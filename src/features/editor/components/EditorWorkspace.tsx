import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import WebView from '../../../WebView';
import BlockEditorPanel, { useBlockEditorSidebarController } from '../../../BlockEditorPanel';
import { MonacoEditorWrapper } from '../../../shared/ui/monaco-editor-wrapper';
import { getMonacoLanguage, getFileType } from '../../../shared/lib/file-type-detector';
import { readFile, watchFile, unwatchFile } from '../../../shared/api/electron-api';
import { findProjectRoot } from '../lib/path-resolver';
import { detectComponents } from '../lib/react-processor';
import { BlockEditorSidebar } from '../../../shared/ui/BlockEditorSidebar';
import { useEditorStore } from '../../../store/editorStore';
import { ensureComponentImportInCode, isInternalSourceFilePath } from '../utils';
import { AstBidirectionalManager } from '../../../blockEditor/AstBidirectional';
import { upsertLayerName } from '../../../blockEditor/LayerNamesStore';
import { createFramework, isFrameworkSupported } from '../../../frameworks/FrameworkFactory';

// Hooks
import { useHistory } from '../hooks/useHistory';
import { useFileOperations } from '../hooks/useFileOperations';
import { useBlockOperations } from '../hooks/useBlockOperations';
import { useMonacoEditor } from '../hooks/useMonacoEditor';
import { useEditorMessage } from '../hooks/useEditorMessage';
import { useFileWatchSync } from '../hooks/useFileWatchSync';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useStyleLibrary } from '../hooks/useStyleLibrary';
import { useAstOperations } from '../hooks/useAstOperations';
import { useDependencies } from '../hooks/useDependencies';
import { useDependencyWatchers } from '../hooks/useDependencyWatchers';
import { usePreviewGeneration } from '../hooks/usePreviewGeneration';
import { useSplitLayout } from '../hooks/useSplitLayout';
import { useSplitEditorHtml } from '../hooks/useSplitEditorHtml';
import { useExternalDnd } from '../hooks/useExternalDnd';
import type { ExternalComponentDragPayload, ExternalFileDragPayload } from '../types';

export function EditorWorkspace({
  filePath,
  selectedComponentName,
  projectPath,
  viewMode,
  onViewModeChange,
  showSplitSidebar,
  showSplitPreview,
  showSplitCode,
  canvasWidth = 1280,
  canvasHeight = 800,
  canvasDevice = 'desktop',
  aggressivePreviewMode: externalAggressivePreviewMode = false,
  externalComponentDrag = null,
  externalFileDrag = null,
  onProjectFilesChanged,
  onOpenFile,
}: {
  filePath: string;
  selectedComponentName?: string | null;
  projectPath: string | null;
  viewMode: 'preview' | 'split' | 'changes';
  onViewModeChange: (mode: 'preview' | 'split' | 'changes') => void;
  showSplitSidebar: boolean;
  showSplitPreview: boolean;
  showSplitCode: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  canvasDevice?: 'desktop' | 'mobile';
  aggressivePreviewMode?: boolean;
  externalComponentDrag?: ExternalComponentDragPayload | null;
  externalFileDrag?: ExternalFileDragPayload | null;
  onProjectFilesChanged?: () => void;
  onOpenFile?: (path: string) => void;
}) {
  const aggressivePreviewMode = externalAggressivePreviewMode;
  const normalizedCanvasWidth = Math.max(240, Math.min(3840, Math.round(Number(canvasWidth) || 1280)));
  const normalizedCanvasHeight = Math.max(240, Math.min(3840, Math.round(Number(canvasHeight) || 800)));
  const previewViewportFrameStyle = useMemo(() => ({
    width: normalizedCanvasWidth,
    height: normalizedCanvasHeight,
  }), [normalizedCanvasHeight, normalizedCanvasWidth]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unsavedContent, setUnsavedContent] = useState<string | null>(null);
  const [showSaveIndicator, setShowSaveIndicator] = useState<boolean>(false);
  const [renderVersion, setRenderVersion] = useState<number>(0);

  // Local HTML/React/React-Native preview content and states
  const [reactHTML, setReactHTML] = useState<string>('');
  const [isProcessingReact, setIsProcessingReact] = useState<boolean>(false);
  const [reactNativeHTML, setReactNativeHTML] = useState<string>('');
  const [isProcessingReactNative, setIsProcessingReactNative] = useState<boolean>(false);
  const [previewOpenError, setPreviewOpenError] = useState<string | null>(null);
  const [dependencyPaths, setDependencyPaths] = useState<string[]>([]);

  const [processedHTML, setProcessedHTML] = useState<string>('');
  const [htmlDependencyPaths, setHtmlDependencyPaths] = useState<string[]>([]);
  const [isProcessingHTML, setIsProcessingHTML] = useState<boolean>(false);

  // References to keep track of Monaco instance and updater flags
  const monacoEditorRef = useRef<any>(null);
  const isUpdatingFromConstructorRef = useRef<boolean>(false);
  const isUpdatingFromFileRef = useRef<boolean>(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInsertOperationRef = useRef<any>(null);
  const lastDeleteOperationRef = useRef<any>(null);
  const lastReparentOperationRef = useRef<any>(null);
  const astManagerRef = useRef<AstBidirectionalManager | null>(null);

  // Zustand state select
  const {
    fileContent,
    fileType,
    canvasDevice: canvasDeviceStore,
    isModified,
    hasStagedChanges,
    selectedBlock,
    selectedBlockIds,
    layersTree,
    layerNames,
    stagedPatches,
    livePosition,
    changesLog,
    undoStack,
    redoStack,
    editorHTML,
    iframeCommand,
    externalDropTargetState,
    styleSnapshots,
    textSnapshots,
    projectRoot,
    setFileType,
    setFileContent,
    setIsModified,
    setSelectedBlock,
    setSelectedBlockIds,
    setLayersTree,
    setLayerNames,
    setLivePosition,
    sendIframeCommand,
    updateStagedPatches,
    updateStagedOps,
    updateStagedComponentImports,
    setHasStagedChanges,
    setChangesLog,
    setUndoStack,
    setRedoStack,
    setProjectRoot,
    setIframeCommand,
    setExternalDropTargetState,
  } = useEditorStore();

  // Sync props with editorStore
  useEffect(() => {
    useEditorStore.setState({
      viewMode,
      showSplitSidebar,
      showSplitPreview,
      showSplitCode,
      canvasWidth,
      canvasHeight,
      canvasDevice,
      aggressivePreviewMode,
    });
  }, [
    viewMode,
    showSplitSidebar,
    showSplitPreview,
    showSplitCode,
    canvasWidth,
    canvasHeight,
    canvasDevice,
    aggressivePreviewMode,
  ]);

  // Sync back viewMode modifications to parent component if needed
  useEffect(() => {
    if (onViewModeChange) {
      onViewModeChange(useEditorStore.getState().viewMode);
    }
  }, [useEditorStore((s) => s.viewMode), onViewModeChange]);

  const {
    undo,
    redo,
    addToHistory,
    addToHistoryDebounced,
    clearHistory,
  } = useHistory({
    filePath,
    monacoEditorRef,
    isUpdatingFromFileRef,
  });

  const {
    writeFile,
    handleEditorChange,
    saveFile,
    loadFile,
  } = useFileOperations({
    filePath,
    monacoEditorRef,
    unsavedContent,
    isUpdatingFromFileRef,
    autoSaveTimeoutRef,
    setLoading,
    setError,
    setUnsavedContent,
    setShowSaveIndicator,
  });

  const {
    resolvePathForFramework,
  } = useDependencies();

  const updateMonacoEditorWithScroll = useCallback((newContent: string) => {
    if (monacoEditorRef.current) {
      isUpdatingFromFileRef.current = true;
      const scroll = monacoEditorRef.current.getScrollTop();
      monacoEditorRef.current.setValue(newContent);
      monacoEditorRef.current.setScrollTop(scroll);
      isUpdatingFromFileRef.current = false;
    }
  }, []);

  const {
    resolveToMappedBlockId,
    applyBlockPatch,
    applyAndCommitPatch,
    commitStagedPatches,
    stageInsertBlock,
    stageDeleteBlock,
    stageReparentBlock,
    stageSetText,
    extractSelectedToComponent,
  } = useBlockOperations({
    filePath,
    astManagerRef,
    isUpdatingFromConstructorRef,
    monacoEditorRef,
    resolvePathForFramework,
    writeFile,
    updateMonacoEditorWithScroll,
    addToHistory,
    addToHistoryDebounced,
    clearHistory,
    lastInsertOperationRef,
    lastDeleteOperationRef,
    lastReparentOperationRef,
    setUnsavedContent,
    setIsModified,
    setRenderVersion,
    setShowSaveIndicator,
    onProjectFilesChanged,
    setError,
  });

  useAstOperations({
    filePath,
    astManagerRef,
  });

  useDependencyWatchers({
    filePath,
    dependencyPaths,
    htmlDependencyPaths,
    loadFile,
  });

  usePreviewGeneration({
    filePath,
    previewSourceCode: fileContent || '',
    selectedComponentName,
    setIsProcessingReact,
    setReactHTML,
    setDependencyPaths,
    setPreviewOpenError,
    setIsProcessingReactNative,
    setReactNativeHTML,
    setIsProcessingHTML,
    setProcessedHTML,
    setHtmlDependencyPaths,
  });

  useSplitEditorHtml({
    filePath,
    processedHTML,
    reactHTML,
    reactNativeHTML,
  });

  const {
    handleEditorMessageStable,
  } = useEditorMessage({
    filePath,
    astManagerRef,
    isUpdatingFromConstructorRef,
    isUpdatingFromFileRef,
    monacoEditorRef,
    applyBlockPatch,
    stageInsertBlock,
    stageDeleteBlock,
    stageReparentBlock,
    stageSetText,
  });

  useFileWatchSync({
    filePath,
    astManagerRef,
    isUpdatingFromConstructorRef,
    isUpdatingFromFileRef,
    loadFile,
    updateMonacoEditorWithScroll,
    onViewModeChange,
    clearHistory,
    setError,
    setReactHTML,
    setReactNativeHTML,
    setIsProcessingReact,
    setIsProcessingReactNative,
    setUnsavedContent,
    setRenderVersion,
  });

  useKeyboardShortcuts({
    saveFile,
    undo,
    redo,
  });

  const {
    styleLibraryEntries,
    handleImportStyleTemplate,
    handleImportStyleFromPicker,
    handleApplyStyleLibraryEntry,
  } = useStyleLibrary({
    filePath,
    monacoEditorRef,
    applyAndCommitPatch,
    resolveToMappedBlockId,
    writeFile,
    updateMonacoEditorWithScroll,
    setUnsavedContent,
    setRenderVersion,
    setError,
  });

  useExternalDnd({
    filePath,
    externalComponentDrag,
    externalFileDrag,
  });

  const {
    splitLeftWidth,
    splitSidebarWidth,
    isResizing,
    resizeTarget,
    setSplitContainerNode,
    setSplitMainPanelsNode,
    handleSplitResizeStart,
    handleSplitResize,
    handleSplitResizeEnd,
  } = useSplitLayout();


  // Set file type when file name or contents change
  useEffect(() => {
    if (filePath && fileContent !== null) {
      const type = getFileType(filePath, fileContent);
      setFileType(type);
    }
  }, [filePath, fileContent]);

  const handleRenameLayer = useCallback(
    async (mrpakId: string, name: string) => {
      try {
        if (!projectRoot || !filePath) return;
        setLayerNames({ ...layerNames, [mrpakId]: String(name ?? '') });
        await upsertLayerName({ projectRoot, targetFilePath: filePath, mrpakId, name });
      } catch (e) {
        console.warn('Rename layer failed:', e);
      }
    },
    [projectRoot, filePath, layerNames, setLayerNames]
  );

  const handleAddProjectDependency = useCallback(
    async (packageName: string, version?: string) => {
      try {
        const name = String(packageName || '').trim();
        if (!name) {
          setError('Library name is empty.');
          return false;
        }
        const normalizedPackageName =
          name.startsWith('react-icons/') ? 'react-icons' : name;
        const normalize = (value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const rawRoot = normalize(String(projectRoot || ''));
        const rawProjectPath = normalize(String(projectPath || ''));
        const rawFilePath = normalize(String(filePath || ''));
        const fileDir = rawFilePath.includes('/') ? rawFilePath.slice(0, rawFilePath.lastIndexOf('/')) : '';

        const collectParents = (inputPath: string) => {
          const value = normalize(inputPath);
          if (!value) return [];
          const parts = value.split('/').filter(Boolean);
          const roots: string[] = [];
          for (let i = parts.length; i >= 1; i -= 1) {
            roots.push(parts.slice(0, i).join('/'));
          }
          return roots;
        };

        const rootCandidates = Array.from(
          new Set<string>(
            [
              rawRoot,
              rawProjectPath,
              fileDir,
              ...collectParents(fileDir),
              ...collectParents(rawProjectPath),
              ...collectParents(rawRoot),
            ].filter(Boolean)
          )
        );

        const packageCandidates = Array.from(
          new Set<string>([
            ...rootCandidates.map((root) => `${root}/package.json`),
            'package.json',
          ])
        );

        let packageJsonPath = '';
        let packageRead: any = null;
        for (const candidate of packageCandidates) {
          const readRes = await readFile(candidate);
          if (readRes?.success) {
            packageJsonPath = candidate;
            packageRead = readRes;
            break;
          }
        }

        if (!packageRead?.success) {
          const probePaths = Array.from(
            new Set(
              [
                rawFilePath,
                rawProjectPath && rawFilePath ? `${rawProjectPath}/${rawFilePath}` : '',
                rawProjectPath,
                rawRoot && rawFilePath ? `${rawRoot}/${rawFilePath}` : '',
                rawRoot,
              ].filter(Boolean)
            )
          );
          for (const probe of probePaths) {
            const detectedRoot = await findProjectRoot(probe);
            if (!detectedRoot) continue;
            const detectedPath = `${normalize(detectedRoot)}/package.json`;
            const readRes = await readFile(detectedPath);
            if (readRes?.success) {
              packageJsonPath = detectedPath;
              packageRead = readRes;
              break;
            }
          }
        }

        if (!packageRead?.success || !packageJsonPath) {
          const sampleCandidates = packageCandidates.slice(0, 6).join(', ');
          setError(
            `Failed to read package.json: not found. Tried: ${sampleCandidates}${packageCandidates.length > 6 ? ', ...' : ''}`
          );
          return false;
        }

        let parsed: any = null;
        try {
          parsed = JSON.parse(String(packageRead.content || '{}'));
        } catch {
          setError('package.json has invalid JSON.');
          return false;
        }

        const nextVersion = String(version || '').trim() || 'latest';
        const nextDependencies = {
          ...(parsed?.dependencies || {}),
          [normalizedPackageName]: nextVersion,
        };
        const sortedDependencies = Object.keys(nextDependencies)
          .sort((a, b) => a.localeCompare(b))
          .reduce((acc: Record<string, string>, key) => {
            acc[key] = nextDependencies[key];
            return acc;
          }, {});

        const nextPackageJson = {
          ...parsed,
          dependencies: sortedDependencies,
        };

        const writeRes = await writeFile(packageJsonPath, JSON.stringify(nextPackageJson, null, 2) + '\n', {
          backup: false,
        });
        if (!writeRes?.success) {
          setError(`Failed to update package.json: ${writeRes?.error || 'unknown error'}`);
          return false;
        }

        setError(null);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(`Failed to add dependency: ${message}`);
        return false;
      }
    },
    [filePath, projectPath, projectRoot, writeFile]
  );

  const handleInsertComponentFromLibrary = useCallback(
    async (componentName: string, importPath: string, importKind: 'default' | 'named' = 'named') => {
      try {
        const targetId = String(selectedBlock?.id || '').trim();
        const safeName = String(componentName || '').trim();
        const safeImportPath = String(importPath || '').trim();
        const dependencyPackageName =
          safeImportPath.startsWith('react-icons/') ? 'react-icons' : safeImportPath.split('/').slice(0, safeImportPath.startsWith('@') ? 2 : 1).join('/');
        if (!targetId) {
          setError('Select a block in canvas first.');
          return;
        }
        if (!safeName || !safeImportPath) {
          setError('Icon insert failed: invalid component import data.');
          return;
        }

        if (dependencyPackageName) {
          await handleAddProjectDependency(dependencyPackageName, 'latest');
        }

        await stageInsertBlock({
          targetId,
          mode: 'child',
          snippet: `<${safeName} />`,
          skipIframeInsert: true,
        });

        updateStagedComponentImports((prev) => {
          const exists = prev.some(
            (item) =>
              item.localName === safeName &&
              item.importPath === safeImportPath &&
              item.importKind === importKind
          );
          if (exists) return prev;
          return [...prev, { localName: safeName, importPath: safeImportPath, importKind }];
        });
        setHasStagedChanges(true);
        const liveCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
        if (typeof liveCode === 'string' && liveCode.length > 0) {
          const codeWithImport = ensureComponentImportInCode(liveCode, {
            localName: safeName,
            importPath: safeImportPath,
            importKind,
          });
          if (codeWithImport !== liveCode) {
            updateMonacoEditorWithScroll(codeWithImport);
            setUnsavedContent(codeWithImport);
            setIsModified(true);
            setFileContent(codeWithImport);
          } else {
            setFileContent(liveCode);
          }
        }
        setRenderVersion((v) => v + 1);
        setError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(`Icon insert failed: ${message}`);
      }
    },
    [fileContent, handleAddProjectDependency, selectedBlock?.id, updateMonacoEditorWithScroll, updateStagedComponentImports, setHasStagedChanges, stageInsertBlock, setFileContent, setUnsavedContent, setIsModified]
  );

  const framework = useMemo(() => {
    if (!fileType || !filePath || !isFrameworkSupported(fileType)) {
      return null;
    }
    return createFramework(fileType, filePath);
  }, [fileType, filePath]);

  const blockEditorSidebarProps = useBlockEditorSidebarController({
    fileType: fileType as any,
    selectedBlock,
    onApplyPatch: applyAndCommitPatch,
    onStagePatch: applyBlockPatch,
    onCommitStagedChanges: commitStagedPatches,
    styleSnapshot: selectedBlock?.id ? styleSnapshots[selectedBlock.id] : null,
    textSnapshot: selectedBlock?.id ? textSnapshots[selectedBlock.id] : '',
    layersTree,
    layerNames,
    onRenameLayer: handleRenameLayer,
    onSendCommand: sendIframeCommand,
    onInsertBlock: stageInsertBlock,
    onDeleteBlock: stageDeleteBlock,
    onReparentBlock: stageReparentBlock,
    onSetText: stageSetText,
    framework,
    onUndo: undo,
    onRedo: redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    livePosition,
    selectedBlockIds,
    onExtractSelection: extractSelectedToComponent,
    onOpenFile,
    styleLibraryEntries,
    onImportStyleTemplate: handleImportStyleTemplate,
    onImportStyleFromPicker: handleImportStyleFromPicker,
    onApplyStyleLibraryEntry: handleApplyStyleLibraryEntry,
    onAddProjectDependency: handleAddProjectDependency,
    onInsertComponentFromLibrary: handleInsertComponentFromLibrary,
  });

  const renderContentMetaOverlay = useCallback((label: string, componentName?: string | null) => (
    <View style={styles.contentMetaOverlay} pointerEvents="none">
      <View style={styles.fileTypeBadge}>
        <Text style={styles.fileTypeText}>
          {componentName ? `${label} • ${componentName}` : label}
        </Text>
      </View>
    </View>
  ), []);

  const splitSidebarStyles = useMemo(() => ({
    ...blockEditorSidebarProps.styles,
    sidebar: {
      ...blockEditorSidebarProps.styles.sidebar,
      width: '100%',
      minWidth: 0,
      height: '100%',
    },
  }), [blockEditorSidebarProps.styles]);

  const shouldOfferAggressiveMode = useMemo(() => {
    if (fileType !== 'react' && fileType !== 'react-native') {
      return false;
    }
    return isInternalSourceFilePath(filePath);
  }, [filePath, fileType]);

  const renderBlockEditorPreview = useCallback((editorType: 'html' | 'react' | 'react-native', html: string) => (
    <BlockEditorPanel
      fileType={editorType}
      html={html}
      onMessage={handleEditorMessageStable}
      outgoingMessage={iframeCommand}
    />
  ), [
    handleEditorMessageStable,
    iframeCommand,
  ]);

  const renderPreviewFallbackOverlay = useCallback(() => {
    const canUseAggressiveMode =
      shouldOfferAggressiveMode &&
      (!!previewOpenError || shouldOfferAggressiveMode) &&
      !aggressivePreviewMode;

    if (!canUseAggressiveMode && !aggressivePreviewMode) {
      return null;
    }

    return (
      <View style={styles.previewFallbackOverlay}>
        <View style={styles.previewFallbackCard}>
          <Text style={styles.previewFallbackTitle}>
            {aggressivePreviewMode ? 'Aggressive mode is active' : 'Default mode could not open this file'}
          </Text>
          <Text style={styles.previewFallbackText}>
            {aggressivePreviewMode
              ? 'Preview is running in best-effort mode. Some dependencies may be stubbed.'
              : (previewOpenError || 'This file appears to be part of a complex project. If default preview fails, use aggressive mode.')}
          </Text>
        </View>
      </View>
    );
  }, [aggressivePreviewMode, previewOpenError, shouldOfferAggressiveMode]);

  const handleMonacoCtrlClick = useCallback((mrpakId: string) => {
    setSelectedBlock({ id: mrpakId });
    setSelectedBlockIds([mrpakId]);
    sendIframeCommand({ type: MRPAK_CMD.SELECT_BLOCK, blockId: mrpakId });
  }, [setSelectedBlock, setSelectedBlockIds, sendIframeCommand]);

  const renderBlockEditorSplitMode = useCallback((editorType: 'html' | 'react' | 'react-native', html: string) => {
    const hasAnyVisiblePanel = showSplitSidebar || showSplitPreview || showSplitCode;
    const previewWidth = showSplitCode ? `${splitLeftWidth * 100}%` : '100%';
    const codeWidth = showSplitPreview ? `${(1 - splitLeftWidth) * 100}%` : '100%';
    const dropTargetNode = externalDropTargetState?.targetId
      ? layersTree?.nodes?.[externalDropTargetState.targetId]
      : null;
    const dropTargetLabel = dropTargetNode
      ? `${dropTargetNode.componentName || dropTargetNode.tagName || 'block'} (${externalDropTargetState?.targetId})`
      : (externalDropTargetState?.targetId || 'not selected');
    const showExternalDropHint =
      (Boolean(externalComponentDrag) && externalDropTargetState?.source === 'component') ||
      (Boolean(externalFileDrag) && externalDropTargetState?.source === 'file');

    return (
      <View style={styles.splitModeRoot}>
        <View style={styles.splitContainer} data-split-container="true" ref={setSplitContainerNode}>
          {showSplitSidebar && (
            <View style={[styles.splitSidebarPane, { width: splitSidebarWidth }]}>
              <BlockEditorSidebar {...blockEditorSidebarProps} styles={splitSidebarStyles} />
            </View>
          )}
          {showSplitSidebar && (showSplitPreview || showSplitCode) && (
            <View
              style={[styles.splitDivider, isResizing && resizeTarget === 'sidebar' && styles.splitDividerActive]}
              onMouseDown={handleSplitResizeStart('sidebar')}
              onTouchStart={handleSplitResizeStart('sidebar')}
            />
          )}
          <View style={styles.splitMainPanels} data-split-main-panels="true" ref={setSplitMainPanelsNode}>
            {showSplitPreview && (
              <View style={[styles.splitLeft, { width: previewWidth, maxWidth: showSplitCode ? '80%' : '100%', minWidth: showSplitCode ? '20%' : 0 }]}>
                <View style={styles.blockEditorPreviewContainer}>
                  <View style={styles.previewViewportHost}>
                    <View
                      style={[
                        styles.previewViewportFrame,
                        previewViewportFrameStyle,
                        canvasDeviceStore === 'mobile' && styles.previewViewportFrameMobile,
                      ]}
                    >
                      {renderBlockEditorPreview(editorType, html)}
                      {renderPreviewFallbackOverlay()}
                      {showExternalDropHint && (
                        <View style={styles.dropTargetIndicator} pointerEvents="none">
                          <Text style={styles.dropTargetIndicatorText}>
                            Insert parent: {dropTargetLabel}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={[
                          styles.quickSaveButton,
                          !(hasStagedChanges || isModified) && styles.quickSaveButtonDisabled,
                        ]}
                        disabled={!(hasStagedChanges || isModified)}
                        onPress={() => {
                          if (hasStagedChanges) {
                            void commitStagedPatches();
                            return;
                          }
                          if (isModified) {
                            void saveFile();
                          }
                        }}
                      >
                        <Text style={styles.quickSaveButtonText}>Save changes</Text>
                      </TouchableOpacity>
                      {hasStagedChanges && (
                        <View style={styles.saveIndicator} pointerEvents="none">
                          <Text style={styles.saveIndicatorText}>* Unsaved changes</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}
            {showSplitPreview && showSplitCode && (
              <View
                style={[styles.splitDivider, isResizing && resizeTarget === 'main' && styles.splitDividerActive]}
                onMouseDown={handleSplitResizeStart('main')}
                onTouchStart={handleSplitResizeStart('main')}
              />
            )}
            {showSplitCode && (
              <View style={[styles.splitRight, { width: codeWidth, maxWidth: showSplitPreview ? '80%' : '100%', minWidth: showSplitPreview ? '20%' : 0 }]}>
                <View style={styles.editorContainer}>
                  <MonacoEditorWrapper
                    value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
                    language={getMonacoLanguage(fileType, filePath)}
                    filePath={filePath}
                    onChange={handleEditorChange}
                    onSave={saveFile}
                    editorRef={monacoEditorRef}
                    onCodeCtrlClick={handleMonacoCtrlClick}
                  />
                  {isModified && (
                    <View style={styles.saveIndicator} pointerEvents="none">
                      <Text style={styles.saveIndicatorText}>* Unsaved changes (Ctrl+S)</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            {!hasAnyVisiblePanel && (
              <View style={styles.splitEmptyState}>
                <Text style={styles.splitEmptyStateText}>Enable at least one panel</Text>
              </View>
            )}
          </View>
        </View>
        {isResizing && (
          <View
            style={[
              styles.splitResizeOverlay,
              resizeTarget === 'sidebar' ? styles.splitResizeOverlaySidebar : styles.splitResizeOverlayMain,
            ]}
            onMouseMove={handleSplitResize}
            onMouseUp={handleSplitResizeEnd}
            onTouchMove={handleSplitResize}
            onTouchEnd={handleSplitResizeEnd}
          />
        )}
      </View>
    );
  }, [
    blockEditorSidebarProps,
    fileContent,
    filePath,
    fileType,
    canvasDeviceStore,
    commitStagedPatches,
    externalComponentDrag,
    externalFileDrag,
    externalDropTargetState,
    handleEditorChange,
    handleSplitResizeStart,
    handleSplitResize,
    handleSplitResizeEnd,
    hasStagedChanges,
    isModified,
    isResizing,
    layersTree,
    resizeTarget,
    renderBlockEditorPreview,
    renderPreviewFallbackOverlay,
    saveFile,
    setSplitContainerNode,
    setSplitMainPanelsNode,
    showSplitCode,
    showSplitPreview,
    showSplitSidebar,
    shouldOfferAggressiveMode,
    previewViewportFrameStyle,
    splitLeftWidth,
    splitSidebarStyles,
    splitSidebarWidth,
    unsavedContent,
    handleMonacoCtrlClick
  ]);

  if (!filePath) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholderText}>
          Select a file to display
        </Text>
        <Text style={styles.hintText}>
          Supported: HTML, React (JSX/TSX), JavaScript, TypeScript, CSS, JSON
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading file...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!fileContent) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholderText}>
          File content is not loaded
        </Text>
      </View>
    );
  }

  // Render HTML Files
  if (fileType === 'html' && fileContent) {
    if (isProcessingHTML) {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>HTML</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Processing dependencies...</Text>
          </View>
        </View>
      );
    }

    const htmlToRender = processedHTML || fileContent;

    return (
      <View style={styles.htmlContainer}>
        {renderContentMetaOverlay('HTML')}
        {viewMode === 'preview' ? (
          <View style={styles.blockEditorPreviewContainer}>
            <View style={styles.previewViewportHost}>
              <View
                style={[
                  styles.previewViewportFrame,
                  previewViewportFrameStyle,
                  canvasDeviceStore === 'mobile' && styles.previewViewportFrameMobile,
                ]}
              >
                <WebView
                  key={`html-${filePath}-${htmlDependencyPaths.length}-${renderVersion}-${(htmlToRender || '').length}`}
                  source={{ html: htmlToRender }}
                  style={styles.webview}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={false}
                  allowExternalScripts={true}
                  onLoad={() => {
                    console.log('RenderFile: HTML content loaded successfully');
                  }}
                  onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('RenderFile: WebView error:', nativeEvent);
                  }}
                />
              </View>
            </View>
          </View>
        ) : viewMode === 'split' ? (
          renderBlockEditorSplitMode('html', editorHTML || htmlToRender)
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>Change history</Text>
            {hasStagedChanges && (
              <Text style={styles.changesStagedHint}>
                There are unsaved editor changes. Switch mode or click "Apply to files".
              </Text>
            )}
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>No changes yet</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Block: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>File: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>
    );
  }

  // Render React Files (JSX/TSX)
  if (fileType === 'react' && fileContent) {
    if (isProcessingReact || !reactHTML) {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>React Component</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Processing dependencies...</Text>
          </View>
        </View>
      );
    }

    const detectedComponentName = (() => {
      if (selectedComponentName) return selectedComponentName;
      try {
        const components = detectComponents(fileContent);
        return components[0]?.name || null;
      } catch {
        return null;
      }
    })();

    return (
      <View style={styles.htmlContainer}>
        {renderContentMetaOverlay('React', detectedComponentName)}
        {viewMode === 'preview' ? (
          <View style={styles.blockEditorPreviewContainer}>
            <View style={styles.previewViewportHost}>
              <View
                style={[
                  styles.previewViewportFrame,
                  previewViewportFrameStyle,
                  canvasDeviceStore === 'mobile' && styles.previewViewportFrameMobile,
                ]}
              >
                <WebView
                  key={`react-${filePath}-${renderVersion}-${reactHTML?.length || 0}`}
                  source={{ html: reactHTML }}
                  style={styles.webview}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  allowExternalScripts={true}
                  renderLoading={() => (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#667eea" />
                    </View>
                  )}
                  onLoad={() => {
                    console.log('RenderFile: React component loaded successfully');
                  }}
                  onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('RenderFile: WebView error:', nativeEvent);
                    setPreviewOpenError(nativeEvent?.description || nativeEvent?.message || 'WebView failed to load preview');
                  }}
                />
                {renderPreviewFallbackOverlay()}
              </View>
            </View>
          </View>
        ) : viewMode === 'split' ? (
          renderBlockEditorSplitMode('react', editorHTML || reactHTML)
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>Change history</Text>
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>No changes yet</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Block: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>File: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>
    );
  }

  // Render React Native Files
  if (fileType === 'react-native' && fileContent) {
    if (isProcessingReactNative || !reactNativeHTML) {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>React Native Component</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Processing dependencies...</Text>
          </View>
        </View>
      );
    }

    const detectedComponentName = (() => {
      if (selectedComponentName) return selectedComponentName;
      try {
        const components = detectComponents(fileContent);
        return components[0]?.name || null;
      } catch {
        return null;
      }
    })();

    return (
      <View style={styles.htmlContainer}>
        {renderContentMetaOverlay('React Native', detectedComponentName)}
        {viewMode === 'preview' ? (
          <View style={styles.blockEditorPreviewContainer}>
            <View style={styles.previewViewportHost}>
              <View
                style={[
                  styles.previewViewportFrame,
                  previewViewportFrameStyle,
                  canvasDeviceStore === 'mobile' && styles.previewViewportFrameMobile,
                ]}
              >
                <WebView
                  key={`react-native-${filePath}-${renderVersion}-${reactNativeHTML?.length || 0}`}
                  source={{ html: reactNativeHTML }}
                  style={styles.webview}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  allowExternalScripts={true}
                  renderLoading={() => (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#667eea" />
                    </View>
                  )}
                  onLoad={() => {
                    console.log('RenderFile: React Native component loaded successfully');
                  }}
                  onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('RenderFile: WebView error:', nativeEvent);
                    setPreviewOpenError(nativeEvent?.description || nativeEvent?.message || 'WebView failed to load preview');
                  }}
                />
                {renderPreviewFallbackOverlay()}
              </View>
            </View>
          </View>
        ) : viewMode === 'split' ? (
          renderBlockEditorSplitMode('react-native', editorHTML || reactNativeHTML)
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>Change history</Text>
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>No changes yet</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Block: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>File: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>
    );
  }

  // Render text files (JS, TS, CSS, JSON, Markdown, etc.)
  const monacoLanguage = getMonacoLanguage(fileType, filePath);
  const languageNames = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'css': 'CSS',
    'json': 'JSON',
    'markdown': 'Markdown',
    'html': 'HTML',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'C/C++',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'php': 'PHP',
    'ruby': 'Ruby',
    'shell': 'Shell',
    'xml': 'XML',
    'yaml': 'YAML',
    'sql': 'SQL',
    'dockerfile': 'Dockerfile',
    'makefile': 'Makefile',
    'lua': 'Lua',
    'perl': 'Perl',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'vue': 'Vue',
    'plaintext': 'Text',
  };

  return (
    <View style={styles.textContainer}>
      {renderContentMetaOverlay(languageNames[monacoLanguage as keyof typeof languageNames] || 'Text')}
      <View style={styles.editorContainer}>
        <MonacoEditorWrapper
          value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
          language={monacoLanguage}
          filePath={filePath}
          onChange={handleEditorChange}
          onSave={saveFile}
          editorRef={monacoEditorRef}
          onCodeCtrlClick={handleMonacoCtrlClick}
        />
        {isModified && (
          <View style={styles.saveIndicator}>
            <Text style={styles.saveIndicatorText}>* Unsaved changes (Ctrl+S to save)</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 200,
  },
  placeholderText: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 12,
  },
  hintText: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.5,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.8,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.4)',
    alignItems: 'center',
    maxWidth: '100%',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  htmlContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  webview: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  contentMetaOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '70%',
  },
  fileTypeBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  fileTypeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'none',
  },
  componentNameText: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 11,
    fontWeight: '500',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    padding: 2,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    minWidth: 80,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#667eea',
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  editorContainer: {
    flex: 1,
    width: '100%',
    minHeight: 600,
    backgroundColor: '#1e1e1e',
  },
  blockEditorPreviewContainer: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  previewViewportHost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    overflow: 'auto',
    backgroundColor: '#0f1115',
  },
  previewViewportFrame: {
    position: 'relative',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
  },
  previewViewportFrameMobile: {
    borderRadius: 18,
  },
  previewFallbackOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 1200,
    alignItems: 'center',
  },
  previewFallbackCard: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: 'rgba(12, 18, 31, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.45)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
  },
  previewFallbackTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  previewFallbackText: {
    color: 'rgba(226, 232, 240, 0.82)',
    fontSize: 12,
    lineHeight: 17,
  },
  previewFallbackButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  previewFallbackButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  splitModeRoot: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    position: 'relative',
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
  },
  splitSidebarPane: {
    minWidth: 240,
    maxWidth: 520,
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  splitMainPanels: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  splitLeft: {
    minWidth: 300,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
    height: '100%',
  },
  splitRight: {
    minWidth: 300,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
    height: '100%',
  },
  splitDivider: {
    width: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    cursor: 'col-resize',
    position: 'relative',
    zIndex: 10,
  },
  splitDividerActive: {
    backgroundColor: 'rgba(102, 126, 234, 0.5)',
  },
  splitResizeOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2000,
  },
  splitResizeOverlayMain: {
    cursor: 'col-resize',
  },
  splitResizeOverlaySidebar: {
    cursor: 'col-resize',
  },
  splitEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitEmptyStateText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
  },
  changesContainer: {
    flex: 1,
    width: '100%',
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    padding: 16,
  },
  changesTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  changesStagedHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },
  changesEmpty: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  changesScroll: {
    flex: 1,
  },
  changeItem: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  changeItemTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  changeItemText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  textContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
  },
  codeScrollView: {
    flex: 1,
  },
  codeContainer: {
    padding: 0,
  },
  codeWrapper: {
    backgroundColor: '#1e1e1e',
    padding: 16,
    borderRadius: 4,
  },
  codeText: {
    fontFamily: 'Monaco, "Courier New", monospace',
    fontSize: 14,
    color: '#d4d4d4',
    lineHeight: 20,
  },
  binaryContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
  },
  binaryInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  binaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  binaryPath: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 20,
    textAlign: 'center',
  },
  binaryHint: {
    fontSize: 14,
    color: '#d4d4d4',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 20,
  },
  imagePreview: {
    marginTop: 20,
    marginBottom: 20,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveIndicator: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    zIndex: 1000,
  },
  quickSaveButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.92)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    zIndex: 1001,
  },
  quickSaveButtonDisabled: {
    backgroundColor: 'rgba(100, 116, 139, 0.65)',
  },
  quickSaveButtonText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  dropTargetIndicator: {
    position: 'absolute',
    top: 10,
    left: 170,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.65)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    zIndex: 1001,
  },
  dropTargetIndicatorText: {
    fontSize: 12,
    color: '#e2e8f0',
  },
  saveIndicatorText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '600',
  },
  saveSuccessIndicator: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
  },
  saveSuccessText: {
    color: '#ffffff',
  },
});

export default EditorWorkspace;
