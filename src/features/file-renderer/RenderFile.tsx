import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import WebView from '../../WebView';
import BlockEditorPanel, { useBlockEditorSidebarController } from '../../BlockEditorPanel';
import { instrumentJsx } from '../../blockEditor/JsxInstrumenter';
import { MRPAK_CMD } from '../../blockEditor/EditorProtocol';
import { applyStylePatch, applyHtmlOp, applyJsxDelete, applyJsxInsert, applyJsxReparent, applyJsxSetText, applyExternalStylePatch, replaceStyleReferenceInJsx } from '../../blockEditor/PatchEngine';
import { upsertLayerName } from '../../blockEditor/LayerNamesStore';
import { MonacoEditorWrapper } from '../../shared/ui/monaco-editor-wrapper';
import { getFileType, getMonacoLanguage } from '../../shared/lib/file-type-detector';
import { readFile, readFileBase64 } from '../../shared/api/electron-api';
import { syncCodeChangesToEditor, createEditorCommandsFromChanges } from '../../blockEditor/AstSync';
import { AstBidirectionalManager } from '../../blockEditor/AstBidirectional';
import { findProjectRoot, resolvePathSync } from './lib/path-resolver';
import { extractImports, detectComponents, wrapImportedComponentUsages } from './lib/react-processor';
import { createFramework, isFrameworkSupported } from '../../frameworks/FrameworkFactory';
import { BlockEditorSidebar } from '../../shared/ui/BlockEditorSidebar';
import type {
  BlockMap,
  DeleteOperationDedup,
  ExternalComponentDragPayload,
  ExternalFileDragPayload,
  InsertHistoryOperation,
  LayerNames,
  LayersTree,
  LivePosition,
  StagedComponentImport,
  StagedOp,
  StylePatch,
} from './types';
import {
  ensureComponentImportInCode,
  getPathBasename,
  isInternalSourceFilePath,
  LOCAL_EXTERNAL_MODULE_URLS,
  resolveRelativePath,
  stripKnownScriptExtension,
} from './utils';
import { useHistory } from './hooks/useHistory';
import { useMonacoEditor } from './hooks/useMonacoEditor';
import { useDependencies } from './hooks/useDependencies';
import { useFileOperations } from './hooks/useFileOperations';
import { useEditorMessage } from './hooks/useEditorMessage';
import { useAstOperations } from './hooks/useAstOperations';
import { useSplitLayout } from './hooks/useSplitLayout';
import { useStyleLibrary } from './hooks/useStyleLibrary';
import { useBlockOperations } from './hooks/useBlockOperations';
import { useExternalDnd } from './hooks/useExternalDnd';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFileWatchSync } from './hooks/useFileWatchSync';
import { useDependencyWatchers } from './hooks/useDependencyWatchers';
import { usePreviewGeneration } from './hooks/usePreviewGeneration';
import { useSplitEditorHtml } from './hooks/useSplitEditorHtml';
const IMPORTED_COMPONENT_BOUNDARY_HELPER = `
function MrpakImportedBoundary({
  __mrpakComponent: Component,
  __mrpakName,
  __mrpakSource,
  __mrpakId,
  children,
  ...rest
}) {
  return React.createElement(
    'div',
    {
      'data-no-code-ui-id': __mrpakId,
      'data-mrpak-component-boundary': '1',
      'data-mrpak-component-name': __mrpakName,
      'data-mrpak-source': __mrpakSource,
      style: { display: 'contents' },
    },
    React.createElement(Component, rest, children)
  );
}
`;

function RenderFile({
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
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unsavedContent, setUnsavedContent] = useState<string | null>(null); // Несохраненные изменения
  const [isModified, setIsModified] = useState<boolean>(false); // Флаг изменений
  const [showSaveIndicator, setShowSaveIndicator] = useState<boolean>(false); // РРЅРґРёРєР°С‚РѕСЂ сохранения
  const monacoEditorRef = useRef<any>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Таймер для автосохранения
  const isUpdatingFromConstructorRef = useRef<boolean>(false); // Флаг для предотвращения рекурсии при обновлении из конструктора
  const isUpdatingFromFileRef = useRef<boolean>(false); // Флаг для предотвращения рекурсии при обновлении из файла

  // Хуки для React и React Native файлов (всегда вызываются)
  const [reactHTML, setReactHTML] = useState<string>('');
  const [isProcessingReact, setIsProcessingReact] = useState<boolean>(false);
  const [reactNativeHTML, setReactNativeHTML] = useState<string>('');
  const [isProcessingReactNative, setIsProcessingReactNative] = useState<boolean>(false);
  const [previewOpenError, setPreviewOpenError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState<number>(0); // увеличиваем, чтобы форсировать перерисовку WebView

  // Пути к зависимым файлам для отслеживания изменений
  const [dependencyPaths, setDependencyPaths] = useState<string[]>([]);

  // Хуки для HTML файлов (всегда вызываются)
  const [processedHTML, setProcessedHTML] = useState<string>('');
  const [htmlDependencyPaths, setHtmlDependencyPaths] = useState<string[]>([]);
  const [isProcessingHTML, setIsProcessingHTML] = useState<boolean>(false);

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
  const {
    resolvePathMemo,
    resolvePathForFramework,
    loadDependency,
  } = useDependencies();
  const detectedComponentName = useMemo(() => {
    if (selectedComponentName) {
      return selectedComponentName;
    }

    if (!fileContent || (fileType !== 'react' && fileType !== 'react-native')) {
      return null;
    }

    try {
      const components = detectComponents(fileContent);
      return components[0]?.name || null;
    } catch {
      return null;
    }
  }, [fileContent, fileType, selectedComponentName]);

  useEffect(() => {
    setPreviewOpenError(null);
  }, [filePath]);

  // Состояние редактора блоков
  const [blockMap, setBlockMap] = useState<BlockMap>({});
  // blockMap для исходного файла (для записи патчей в исходный код, без зависимости от обработанного превью)
  const [blockMapForFile, setBlockMapForFile] = useState<BlockMap>({});
  const [selectedBlock, setSelectedBlock] = useState<{ id: string; meta?: any } | null>(null); // { id, meta? }
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [changesLog, setChangesLog] = useState<Array<{ ts: number; filePath: string; blockId: any; patch: any }>>([]); // [{ ts, filePath, blockId, patch }]
  const [editorHTML, setEditorHTML] = useState<string>('');
  const [stagedPatches, setStagedPatches] = useState<Record<string, StylePatch>>({}); // { [blockId]: patchObject }
  const [hasStagedChanges, setHasStagedChanges] = useState<boolean>(false);
  const [layersTree, setLayersTree] = useState<LayersTree | null>(null); // { nodes: {id:...}, rootIds: [] }
  const [layerNames, setLayerNames] = useState<LayerNames>({}); // { [mrpakId]: "Name" }
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [iframeCommand, setIframeCommand] = useState<any>(null); // { type, ...payload, ts }
  const [stagedOps, setStagedOps] = useState<StagedOp[]>([]); // [{type:'insert'|'delete', ...}]
  const [stagedComponentImports, setStagedComponentImports] = useState<StagedComponentImport[]>([]);
  const [styleSnapshots, setStyleSnapshots] = useState<Record<string, { inlineStyle: string; computedStyle?: any }>>({}); // { [mrpakId]: { inlineStyle: string, computedStyle?: object } }
  const [textSnapshots, setTextSnapshots] = useState<Record<string, string>>({}); // { [mrpakId]: text }
  const [externalStylesMap, setExternalStylesMap] = useState<Record<string, { path: string; type: string }>>({}); // { [varName]: { path: string, type: string } }
  const [livePosition, setLivePosition] = useState<LivePosition>({ left: null, top: null, width: null, height: null });
  const [externalDropTargetState, setExternalDropTargetState] = useState<{
    source: string;
    sourceId: string | null;
    targetId: string | null;
  } | null>(null);
  const { writeFile, handleEditorChange, saveFile, loadFile } = useFileOperations({
    filePath,
    fileType,
    monacoEditorRef,
    unsavedContent,
    fileContent,
    isUpdatingFromFileRef,
    autoSaveTimeoutRef,
    setLoading,
    setError,
    setFileContent,
    setSelectedBlock,
    setSelectedBlockIds,
    setUnsavedContent,
    setIsModified,
    setShowSaveIndicator,
    setExternalStylesMap,
  });

  // Две копии AST для bidirectional editing
  // Менеджер для bidirectional editing через два AST
  const astManagerRef = useRef<AstBidirectionalManager | null>(null);

  // Рефы для актуальных значений staged состояний (чтобы избегать устаревших замыканий)
  const stagedPatchesRef = useRef<Record<string, StylePatch>>(stagedPatches);
  const stagedOpsRef = useRef<StagedOp[]>(stagedOps);
  const stagedComponentImportsRef = useRef<StagedComponentImport[]>(stagedComponentImports);
  const hasStagedChangesRef = useRef<boolean>(hasStagedChanges);
  const saveFileRef = useRef<((contentToSave?: string | null) => Promise<void>) | null>(null);

  // Защита от дублирования операций
  const lastInsertOperationRef = useRef<InsertHistoryOperation | null>(null);
  const lastDeleteOperationRef = useRef<DeleteOperationDedup | null>(null);
  const lastReparentOperationRef = useRef<any>(null);

  // Хелперы для синхронного обновления state + ref одновременно
  const updateStagedPatches = useCallback((updater: ((prev: Record<string, StylePatch>) => Record<string, StylePatch>) | Record<string, StylePatch>) => {
    setStagedPatches((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      stagedPatchesRef.current = next; // РЎРРќРҐР РћРќРќРћ обновляем ref
      return next;
    });
  }, []);

  const updateStagedOps = useCallback((updater: ((prev: StagedOp[]) => StagedOp[]) | StagedOp[]) => {
    setStagedOps((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      stagedOpsRef.current = next; // РЎРРќРҐР РћРќРќРћ обновляем ref
      return next;
    });
  }, []);

  const updateStagedComponentImports = useCallback(
    (
      updater:
        | ((prev: StagedComponentImport[]) => StagedComponentImport[])
        | StagedComponentImport[]
    ) => {
      setStagedComponentImports((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        stagedComponentImportsRef.current = next;
        return next;
      });
    },
    []
  );

  const updateHasStagedChanges = useCallback((value: boolean) => {
    setHasStagedChanges(value);
    hasStagedChangesRef.current = value; // РЎРРќРҐР РћРќРќРћ обновляем ref
  }, []);

  // Ref для stageReparentBlock (используется в handleEditorMessage до определения функции)
  const stageReparentBlockRef = useRef<((params: { sourceId: string; targetParentId: string; targetBeforeId?: string | null }) => void) | null>(null);
  // Ref для stageInsertBlock (используется в handleEditorMessage до определения функции)
  const stageInsertBlockRef = useRef<((params: { targetId: string; mode: 'child' | 'sibling'; snippet: string; skipIframeInsert?: boolean }) => any) | null>(null);

  // getFileType и getMonacoLanguage импортированы из shared/lib/file-type-detector.js

  // injectBlockEditorScript теперь импортируется из модуля

  // Команды для iframe - определяем рано, так как используется в undo/redo
  const sendIframeCommand = useCallback((cmd: any) => {
    setIframeCommand({ ...cmd, ts: Date.now() });
  }, []);
  const {
    undoStack,
    redoStack,
    addToHistory,
    addToHistoryDebounced,
    undo,
    redo,
    clearHistory,
  } = useHistory({
    fileType,
    filePath,
    sendIframeCommand,
    updateStagedPatches,
    updateStagedOps,
    updateHasStagedChanges,
    stagedPatchesRef,
    stagedOpsRef,
  });
  const {
    updateMonacoEditorWithScroll,
    clearMonacoBlockSelection,
    revealSelectedBlockInCode,
    handleMonacoCtrlClick,
  } = useMonacoEditor({
    monacoEditorRef,
    isUpdatingFromFileRef,
    blockMap,
    blockMapForFile,
    selectedBlock,
    setSelectedBlock,
    sendIframeCommand,
  });
  useExternalDnd({
    viewMode,
    fileType,
    filePath,
    externalComponentDrag,
    externalFileDrag,
    sendIframeCommand,
  });

  const {
    resolveToMappedBlockId,
    applyBlockPatch,
    commitStagedPatches,
    applyAndCommitPatch,
    stageDeleteBlock,
    stageInsertBlock,
    stageReparentBlock,
    stageSetText,
    extractSelectedToComponent,
  } = useBlockOperations({
    blockMap,
    blockMapForFile,
    layersTree,
    styleSnapshots,
    stagedPatchesRef,
    stagedOpsRef,
    stagedComponentImportsRef,
    hasStagedChangesRef,
    astManagerRef,
    isUpdatingFromConstructorRef,
    monacoEditorRef,
    fileType,
    filePath,
    fileContent,
    projectRoot,
    externalStylesMap,
    resolvePathForFramework,
    writeFile,
    updateMonacoEditorWithScroll,
    updateStagedPatches,
    updateStagedOps,
    updateStagedComponentImports,
    updateHasStagedChanges,
    addToHistory,
    addToHistoryDebounced,
    clearHistory,
    sendIframeCommand,
    textSnapshots,
    lastInsertOperationRef,
    lastDeleteOperationRef,
    lastReparentOperationRef,
    setChangesLog,
    setFileContent,
    setUnsavedContent,
    setIsModified,
    setRenderVersion,
    setShowSaveIndicator,
    selectedBlock,
    selectedBlockIds,
    setSelectedBlock,
    setSelectedBlockIds,
    setLivePosition,
    onProjectFilesChanged,
    setError,
  });
  const {
    styleLibraryEntries,
    handleImportStyleTemplate,
    handleImportStyleFromPicker,
    handleApplyStyleLibraryEntry,
  } = useStyleLibrary({
    filePath,
    fileType,
    fileContent,
    monacoEditorRef,
    blockMapForFile,
    selectedBlock,
    applyAndCommitPatch,
    resolveToMappedBlockId,
    writeFile,
    updateMonacoEditorWithScroll,
    setFileContent,
    setUnsavedContent,
    setIsModified,
    setRenderVersion,
    setError,
  });

  const { handleEditorMessageStable } = useEditorMessage({
    hasStagedChangesRef,
    commitStagedPatches,
    viewMode,
    isModified,
    monacoEditorRef,
    unsavedContent,
    fileContent,
    saveFileRef,
    setSelectedBlockIds,
    setSelectedBlock,
    setLivePosition,
    filePath,
    dependencyPaths,
    setLayersTree,
    setStyleSnapshots,
    setTextSnapshots,
    stageReparentBlockRef,
    setError,
    stageInsertBlockRef,
    updateStagedComponentImports,
    updateHasStagedChanges,
    setFileContent,
    setRenderVersion,
    stagedComponentImportsRef,
    fileType,
    selectedBlockId: selectedBlock?.id,
    projectRoot,
    applyBlockPatch,
    setExternalDropTargetState,
  });

  const handleRenameLayer = useCallback(
    async (mrpakId, name) => {
      try {
        if (!projectRoot || !filePath) return;
        setLayerNames((prev) => ({ ...prev, [mrpakId]: String(name ?? '') }));
        await upsertLayerName({ projectRoot, targetFilePath: filePath, mrpakId, name });
      } catch (e) {
        console.warn('Rename layer failed:', e);
      }
    },
    [projectRoot, filePath]
  );

  // Создаем framework экземпляр для использования в компоненте
  const framework = useMemo(() => {
    if (!fileType || !filePath || !isFrameworkSupported(fileType)) {
      return null;
    }
    return createFramework(fileType, filePath);
  }, [fileType, filePath]);
  stageInsertBlockRef.current = stageInsertBlock;
  stageReparentBlockRef.current = stageReparentBlock;

  // Обработка изменений в редакторе с автосохранением
  useEffect(() => {
    saveFileRef.current = saveFile;
  }, [saveFile]);

  useKeyboardShortcuts({
    viewMode,
    isModified,
    hasStagedChanges,
    filePath,
    saveFile,
    commitStagedPatches,
    unsavedContent,
    fileContent,
    monacoEditorRef,
    undo,
    redo,
    selectedBlockId: selectedBlock?.id,
    sendIframeCommand,
  });

  useAstOperations({
    viewMode,
    filePath,
    projectPath,
    fileType,
    fileContent,
    setProjectRoot,
    setLayerNames,
    astManagerRef,
  });

  // Переопределяем тип файла после загрузки содержимого
  useEffect(() => {
    if (fileContent && filePath) {
      const refinedType = getFileType(filePath, fileContent);
      if (refinedType !== fileType) {
        console.log(`RenderFile: Refining file type from ${fileType} to ${refinedType} based on content`);
        setFileType(refinedType);
      }
    }
  }, [fileContent, filePath]); // fileType не включаем в deps, чтобы избежать циклов

  useFileWatchSync({
    filePath,
    fileType,
    viewMode,
    projectRoot,
    selectedBlock,
    astManagerRef,
    isUpdatingFromConstructorRef,
    isUpdatingFromFileRef,
    sendIframeCommand,
    loadFile,
    updateMonacoEditorWithScroll,
    onViewModeChange,
    clearHistory,
    updateStagedPatches,
    updateStagedOps,
    updateStagedComponentImports,
    updateHasStagedChanges,
    setFileContent,
    setFileType,
    setError,
    setReactHTML,
    setReactNativeHTML,
    setIsProcessingReact,
    setIsProcessingReactNative,
    setUnsavedContent,
    setIsModified,
    setBlockMap,
    setBlockMapForFile,
    setSelectedBlock,
    setChangesLog,
    setEditorHTML,
    setLayersTree,
    setLayerNames,
    setProjectRoot,
    setIframeCommand,
    setExternalDropTargetState,
    setRenderVersion,
  });

  const previewSourceCode = useMemo(() => {
    const baseCode = String(fileContent ?? '');
    if (!baseCode) return baseCode;
    if (fileType !== 'react' && fileType !== 'react-native') return baseCode;
    const pendingImports = Array.isArray(stagedComponentImports) ? stagedComponentImports : [];
    if (pendingImports.length === 0) return baseCode;
    let nextCode = baseCode;
    for (const importMeta of pendingImports) {
      nextCode = ensureComponentImportInCode(nextCode, importMeta);
    }
    return nextCode;
  }, [fileContent, fileType, stagedComponentImports]);

  usePreviewGeneration({
    fileType,
    filePath,
    fileContent,
    previewSourceCode,
    viewMode,
    projectRoot,
    selectedComponentName,
    aggressivePreviewMode,
    setIsProcessingReact,
    setReactHTML,
    setDependencyPaths,
    setBlockMap,
    setBlockMapForFile,
    setPreviewOpenError,
    setIsProcessingReactNative,
    setReactNativeHTML,
    setIsProcessingHTML,
    setProcessedHTML,
    setHtmlDependencyPaths,
  });

  useDependencyWatchers({
    filePath,
    fileType,
    dependencyPaths,
    htmlDependencyPaths,
    loadFile,
    setFileContent,
  });

  // РР·РІР»РµРєР°РµРј все импорты из кода
  // extractImports теперь импортируется из модуля

  // findProjectRoot и resolvePath теперь импортируются из модуля

  useSplitEditorHtml({
    viewMode,
    fileType,
    filePath,
    fileContent,
    processedHTML,
    reactHTML,
    reactNativeHTML,
    setEditorHTML,
    setBlockMap,
    setBlockMapForFile,
  });

  // resolvePathSync теперь импортируется из модуля

  // Вспомогательная функция для поиска модуля по различным путям
  // Синхронная версия, использует уже разрешенные пути из pathMap
  const findModulePath = (
    importPath: string,
    basePath: string,
    pathMap: Record<string, string>,
    dependencyModules: Record<string, string>
  ) => {
    // Пробуем найти по оригинальному пути (включая @ пути, которые уже разрешены)
    if (pathMap[importPath]) {
      return pathMap[importPath];
    }

    // РС‰РµРј в dependencyModules
    if (dependencyModules[importPath]) {
      return dependencyModules[importPath];
    }

    // Разрешаем относительный путь синхронно (для путей без @)
    if (!importPath.startsWith('@/') && !importPath.startsWith('http')) {
      const resolvedPath = resolvePathSync(basePath, importPath);

      console.log('RenderFile: findModulePath resolving:', {
        importPath,
        basePath,
        resolvedPath,
        pathMapHasResolved: !!pathMap[resolvedPath],
        pathMapKeys: Object.keys(pathMap).filter(k => k.includes(importPath) || k.includes(resolvedPath.split('/').pop() || '')).slice(0, 5)
      });

      // Пробуем найти по разрешенному пути
      if (pathMap[resolvedPath]) {
        return pathMap[resolvedPath];
      }

      if (dependencyModules[resolvedPath]) {
        return dependencyModules[resolvedPath];
      }

      // РР·РІР»РµРєР°РµРј имя файла из разрешенного пути для более гибкого поиска
      const fileName = resolvedPath.split('/').pop()?.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      const pathWithoutExt = resolvedPath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      const lastPart = resolvedPath.split('/').slice(-2).join('/'); // Последние 2 части пути

      // Также пробуем найти по разрешенному пути в ключах
      // Нормализуем пути для сравнения (убираем начальные/конечные слеши)
      const normalizedResolved = resolvedPath.replace(/^\/+|\/+$/g, '');
      const normalizedPathWithoutExt = pathWithoutExt.replace(/^\/+|\/+$/g, '');
      const normalizedLastPart = lastPart.replace(/^\/+|\/+$/g, '');

      // РС‰РµРј по всем значениям в pathMap (абсолютным путям)
      for (const [key, value] of Object.entries(pathMap)) {
        const normalizedKey = key.replace(/^\/+|\/+$/g, '');
        const normalizedValue = String(value).replace(/^\/+|\/+$/g, '');

        // Точное совпадение
        if (normalizedKey === normalizedResolved || normalizedKey === normalizedPathWithoutExt) {
          return value;
        }

        // Проверяем, заканчивается ли ключ или значение на разрешенный путь
        if (normalizedKey.endsWith('/' + normalizedResolved) ||
            normalizedResolved.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedLastPart) ||
            normalizedLastPart.endsWith('/' + normalizedKey)) {
          return value;
        }

        // Проверяем значение (абсолютный путь)
        if (normalizedValue.endsWith('/' + normalizedResolved) ||
            normalizedResolved.endsWith('/' + normalizedValue) ||
            normalizedValue.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedValue) ||
            normalizedValue.includes('/' + fileName + '.') ||
            normalizedValue.endsWith('/' + normalizedLastPart) ||
            normalizedLastPart.endsWith('/' + normalizedValue)) {
          return value;
        }

        // Проверяем по имени файла
        if (normalizedKey.includes('/' + fileName) || normalizedValue.includes('/' + fileName + '.')) {
          return value;
        }
      }

      // Пробуем найти в dependencyModules по разрешенному пути
      for (const [key, value] of Object.entries(dependencyModules)) {
        const normalizedKey = String(key).replace(/^\/+|\/+$/g, '');
        if (normalizedKey === normalizedResolved ||
            normalizedKey === normalizedPathWithoutExt ||
            normalizedKey.endsWith('/' + normalizedResolved) ||
            normalizedResolved.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedKey) ||
            normalizedKey.includes('/' + fileName) ||
            normalizedKey.endsWith('/' + normalizedLastPart)) {
          return value;
        }
      }

      // Последняя попытка: ищем по всем значениям в pathMap, которые заканчиваются на имя файла
      for (const [key, value] of Object.entries(pathMap)) {
        const valueStr = String(value);
        if (valueStr.includes(fileName + '.js') || valueStr.includes(fileName + '.jsx') ||
            valueStr.includes(fileName + '.ts') || valueStr.includes(fileName + '.tsx') ||
            valueStr.endsWith('/' + fileName) || valueStr.endsWith('/' + fileName + '.js') ||
            valueStr.endsWith('/' + fileName + '.jsx') || valueStr.endsWith('/' + fileName + '.ts') ||
            valueStr.endsWith('/' + fileName + '.tsx')) {
          // Проверяем, что это действительно нужный файл по последним частям пути
          const valueParts = valueStr.split('/');
          const resolvedParts = resolvedPath.split('/');
          if (valueParts.length >= 2 && resolvedParts.length >= 2) {
            const valueLast2 = valueParts.slice(-2).join('/');
            const resolvedLast2 = resolvedParts.slice(-2).join('/');
            if (valueLast2 === resolvedLast2 || valueLast2.endsWith(resolvedLast2) || resolvedLast2.endsWith(valueLast2)) {
              console.log(`[findModulePath] Found by value matching: ${importPath} -> ${value} (key: ${key})`);
              return value;
            }
          }
        }
      }

      // Еще одна попытка: ищем по всем ключам, которые содержат последние части пути
      const resolvedParts = resolvedPath.split('/');
      if (resolvedParts.length >= 2) {
        const targetLast2 = resolvedParts.slice(-2).join('/');
        const targetLast2NoExt = targetLast2.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');

        for (const [key, value] of Object.entries(pathMap)) {
          const keyStr = String(key);
          const valueStr = String(value);

          // Проверяем, содержит ли ключ или значение последние части пути
          if (keyStr.includes(targetLast2) || keyStr.includes(targetLast2NoExt) ||
              valueStr.includes(targetLast2) || valueStr.includes(targetLast2NoExt) ||
              keyStr.endsWith(targetLast2) || keyStr.endsWith(targetLast2NoExt) ||
              valueStr.endsWith(targetLast2) || valueStr.endsWith(targetLast2NoExt)) {
            // Проверяем, что это действительно нужный файл
            const valueParts = valueStr.split('/');
            if (valueParts.length >= 2) {
              const valueLast2 = valueParts.slice(-2).join('/');
              if (valueLast2 === targetLast2 || valueLast2 === targetLast2NoExt ||
                  valueLast2.endsWith(targetLast2) || targetLast2.endsWith(valueLast2)) {
                console.log(`[findModulePath] Found by last parts matching: ${importPath} -> ${value} (key: ${key})`);
                return value;
              }
            }
          }
        }
      }
    }

    // Если путь с @, пробуем найти его разрешенную версию
    if (importPath.startsWith('@/')) {
      // РС‰РµРј все ключи, которые могут соответствовать этому @ пути
      for (const [key, value] of Object.entries(pathMap)) {
        if (key.includes(importPath.substring(2)) || value.includes(importPath.substring(2))) {
          return value;
        }
      }
      // Также ищем в dependencyModules
      for (const [key, value] of Object.entries(dependencyModules)) {
        if (key.includes(importPath.substring(2)) || value.includes(importPath.substring(2))) {
          return value;
        }
      }
    }

    console.warn('RenderFile: findModulePath failed to find:', {
      importPath,
      basePath,
      resolvedPath: !importPath.startsWith('@/') && !importPath.startsWith('http') ? resolvePathSync(basePath, importPath) : 'N/A'
    });

    // Возвращаем оригинальный путь как fallback
    return importPath;
  };

  // Рекурсивная функция для загрузки всех зависимостей
  const isCoreReactImport = (importPath: string) => /^(react|react-dom|react-native)(\/|$)/.test(String(importPath || '').trim());
  const isHttpImport = (importPath: string) => /^https?:\/\//i.test(String(importPath || '').trim());
  const isProjectAliasImport = (importPath: string) => String(importPath || '').trim().startsWith('@/');
  const isBarePackageImport = (importPath: string) => {
    const normalized = String(importPath || '').trim();
    return !!normalized &&
      !normalized.startsWith('.') &&
      !normalized.startsWith('/') &&
      !isProjectAliasImport(normalized) &&
      !isHttpImport(normalized) &&
      !isCoreReactImport(normalized);
  };
  const createExternalModuleUrl = (importPath: string) => {
    const normalized = String(importPath || '').trim().replace(/^\/*/, '');
    return LOCAL_EXTERNAL_MODULE_URLS[normalized] || `https://esm.sh/${normalized}?bundle`;
  };

  const loadAllDependencies = async (
    importPath: string,
    basePath: string,
    loadedDeps: Set<string> = new Set<string>(),
    dependencyMap: Record<string, string> = {},
    dependencyPaths: string[] = [],
    pathMap: Record<string, string> = {},
    actualPathMap: Record<string, string> = {}
  ) => {
    const baseFileName = basePath.split('/').pop() || basePath.split('\\').pop() || 'unknown';

    console.log(`[LoadAllDependencies] Starting to load dependency:`, {
      importPath,
      fromFile: baseFileName,
      basePath,
      alreadyLoaded: loadedDeps.has(importPath)
    });

    // Разрешаем путь (теперь асинхронно для поддержки @ путей)
    const resolvedPath = await resolvePathMemo(basePath, importPath);

    console.log(`[LoadAllDependencies] Resolved path:`, {
      importPath,
      fromFile: baseFileName,
      resolvedPath
    });

    // РСЃРїРѕР»СЊР·СѓРµРј абсолютный путь как ключ для предотвращения дублирования
    if (loadedDeps.has(resolvedPath)) {
      // Если файл уже загружен, добавляем только маппинг относительного пути
      console.log(`[LoadAllDependencies] Dependency already loaded: ${importPath} (resolved: ${resolvedPath}) from ${baseFileName}`);
      pathMap[importPath] = resolvedPath;
      return { pathMap, actualPathMap };
    }
    loadedDeps.add(resolvedPath);

    // Загружаем зависимость по разрешенному пути
    const depResult = await loadDependency(basePath, importPath);
    if (!depResult.success) {
      console.warn(`[LoadAllDependencies] Failed to load dependency from ${baseFileName}:`, {
        importPath,
        resolvedPath,
        error: depResult.error,
        fromFile: baseFileName
      });
      return { pathMap, actualPathMap };
    }

    console.log(`[LoadAllDependencies] Successfully loaded file:`, {
      importPath,
      resolvedPath,
      actualPath: depResult.path,
      fromFile: baseFileName,
      contentLength: depResult.content?.length || 0
    });

    const depPath = String(depResult.path ?? resolvedPath);
    const depContent = String(depResult.content ?? '');

    // Сохраняем фактический путь файла для разрешенного пути
    actualPathMap[resolvedPath] = depPath;
    actualPathMap[depPath] = depPath;

    // Сохраняем по абсолютному пути как основному ключу
    dependencyMap[resolvedPath] = depContent;
    dependencyPaths.push(depPath);

    // Сохраняем маппинг: относительный путь -> абсолютный путь
    pathMap[importPath] = resolvedPath;
    // Также сохраняем маппинг разрешенного пути (если он отличается от фактического пути файла)
    if (resolvedPath !== depPath) {
      pathMap[resolvedPath] = depPath;
    }
    // Сохраняем маппинг фактического пути файла к самому себе
    pathMap[depPath] = depPath;

    // Для относительных путей также сохраняем разрешенный путь как ключ
    // Это поможет найти модуль, когда мы разрешаем относительный путь в findModulePath
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Разрешаем путь синхронно для сохранения маппинга
      const syncResolved = resolvePathSync(basePath, importPath);
      if (syncResolved !== resolvedPath && syncResolved !== depPath && !pathMap[syncResolved]) {
        pathMap[syncResolved] = depPath;
      }
      // Также сохраняем путь без расширения
      const syncResolvedNoExt = syncResolved.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      if (syncResolvedNoExt !== syncResolved && syncResolvedNoExt !== depPath && !pathMap[syncResolvedNoExt]) {
        pathMap[syncResolvedNoExt] = depPath;
      }
      // Сохраняем последние 2 части пути (например, styles/commonStyles)
      const pathParts = syncResolved.split('/');
      if (pathParts.length >= 2) {
        const last2Parts = pathParts.slice(-2).join('/');
        if (last2Parts !== syncResolved && last2Parts !== depPath && !pathMap[last2Parts]) {
          pathMap[last2Parts] = depPath;
        }
        const last2PartsNoExt = last2Parts.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
        if (last2PartsNoExt !== last2Parts && last2PartsNoExt !== depPath && !pathMap[last2PartsNoExt]) {
          pathMap[last2PartsNoExt] = depPath;
        }
      }
    }

    // Также сохраняем путь без расширения для фактического пути файла
    const depPathNoExt = depPath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
    if (depPathNoExt !== depPath && !pathMap[depPathNoExt]) {
      pathMap[depPathNoExt] = depPath;
    }

    // Сохраняем последние 2 части фактического пути файла
    const depPathParts = depPath.split('/');
    if (depPathParts.length >= 2) {
      const depLast2Parts = depPathParts.slice(-2).join('/');
      if (depLast2Parts !== depPath && !pathMap[depLast2Parts]) {
        pathMap[depLast2Parts] = depPath;
      }
      const depLast2PartsNoExt = depLast2Parts.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      if (depLast2PartsNoExt !== depLast2Parts && depLast2PartsNoExt !== depPath && !pathMap[depLast2PartsNoExt]) {
        pathMap[depLast2PartsNoExt] = depPath;
      }
    }

    console.log('RenderFile: Saved path mappings for:', {
      importPath,
      resolvedPath,
      actualPath: depPath,
      savedKeys: Object.keys(pathMap).filter(k => pathMap[k] === depPath).slice(0, 10)
    });

    // РР·РІР»РµРєР°РµРј импорты из загруженной зависимости
    const depFileName = depPath.split('/').pop() || depPath.split('\\').pop() || 'unknown';
    const depImports = extractImports(depContent, depFileName);

    console.log(`[LoadAllDependencies] Found ${depImports.length} imports in ${depFileName}:`, {
      file: depPath,
      fileName: depFileName,
      imports: depImports.map(i => ({ path: i.path, line: i.line }))
    });

    // Рекурсивно загружаем зависимости зависимостей
    const depBasePath = depPath; // РСЃРїРѕР»СЊР·СѓРµРј фактический путь файла как базовый
    for (const depImp of depImports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      // Теперь обрабатываем локальные импорты, включая @ пути
      if (isCoreReactImport(depImp.path) ||
          isHttpImport(depImp.path) ||
          isBarePackageImport(depImp.path)) {
        console.log(`[LoadAllDependencies] Skipping external library in ${depFileName}: ${depImp.path}`);
        continue;
      }

      console.log(`[LoadAllDependencies] Recursively loading dependency from ${depFileName}:`, {
        importPath: depImp.path,
        fromFile: depFileName,
        importLine: depImp.line,
        basePath: depBasePath
      });

      // Рекурсивно загружаем с правильным базовым путем (фактический путь файла)
      const result = await loadAllDependencies(depImp.path, depBasePath, loadedDeps, dependencyMap, dependencyPaths, pathMap, actualPathMap);
      if (result) {
        Object.assign(pathMap, result.pathMap);
        Object.assign(actualPathMap, result.actualPathMap);
        console.log(`[LoadAllDependencies] Successfully loaded recursive dependency: ${depImp.path} from ${depFileName}`);
      } else {
        console.warn(`[LoadAllDependencies] Failed to load recursive dependency: ${depImp.path} from ${depFileName}`);
      }
    }

    return { pathMap, actualPathMap };
  };

  // Обрабатываем код React файла с поддержкой зависимостей
  const processReactCode = async (code, basePath) => {
    // РР·РІР»РµРєР°РµРј импорты
    const fileName = basePath.split('/').pop() || basePath.split('\\').pop() || 'unknown';
    const imports = extractImports(code, fileName);
    console.log(`[ProcessReactCode] Processing file: ${fileName}`, {
      file: basePath,
      fileName,
      importsCount: imports.length,
      imports: imports.map(i => ({ path: i.path, line: i.line }))
    });

    const dependencies: Record<string, string> = {};
    const dependencyModules: Record<string, string> = {};
    const dependencyPaths: string[] = []; // Массив путей к зависимым файлам
    const loadedDeps = new Set<string>(); // Для предотвращения циклических зависимостей
    const pathMap: Record<string, string> = {}; // Маппинг: относительный путь -> абсолютный путь
    const actualPathMap: Record<string, string> = {}; // Маппинг: разрешенный путь -> фактический путь файла
    const directCssBlocks: string[] = [];
    const directCssSeenPaths = new Set<string>();
    const externalPackageImports = new Set<string>();

    // Загружаем все зависимости рекурсивно
    for (const imp of imports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      // Теперь обрабатываем локальные импорты, включая @ пути
      if (isCoreReactImport(imp.path) || isHttpImport(imp.path)) {
        console.log(`[ProcessReactCode] Skipping external library: ${imp.path} from ${fileName}`);
        continue;
      }

      if (isBarePackageImport(imp.path)) {
        externalPackageImports.add(imp.path);
        console.log(`[ProcessReactCode] Registering bare package import for external loading: ${imp.path} from ${fileName}`);
        continue;
      }

      console.log(`[ProcessReactCode] Loading dependency from ${fileName}:`, {
        sourceFile: fileName,
        importPath: imp.path,
        importLine: imp.line,
        basePath
      });

      const result = await loadAllDependencies(imp.path, basePath, loadedDeps, dependencies, dependencyPaths, pathMap, actualPathMap);
      // Объединяем результаты
      if (result) {
        Object.assign(pathMap, result.pathMap);
        Object.assign(actualPathMap, result.actualPathMap);
        console.log(`[ProcessReactCode] Successfully loaded dependency: ${imp.path} from ${fileName}`);
      } else {
        console.warn(`[ProcessReactCode] Failed to load dependency: ${imp.path} from ${fileName}`);
      }

      if (/\.css($|\?)/i.test(String(imp.path || ''))) {
        const cssDep = await loadDependency(basePath, imp.path);
        if (cssDep?.success && typeof cssDep.content === 'string') {
          const cssPath = String(cssDep.path || imp.path);
          if (!directCssSeenPaths.has(cssPath)) {
            directCssSeenPaths.add(cssPath);
            directCssBlocks.push(`\n/* ${cssPath} */\n${cssDep.content}\n`);
          }
        }
      }
    }

    // РСЃРїРѕР»СЊР·СѓРµРј pathMap для заполнения dependencyModules
    // Основной ключ - абсолютный путь, но также сохраняем маппинг относительных путей
    for (const [relativePath, absolutePath] of Object.entries(pathMap)) {
      // Сохраняем маппинг относительного пути к абсолютному
      dependencyModules[relativePath] = absolutePath;
      // Также сохраняем абсолютный путь как ключ (если он еще не сохранен)
      if (!dependencyModules[absolutePath]) {
        dependencyModules[absolutePath] = absolutePath;
      }
    }

    // Обрабатываем код - удаляем импорты React, но сохраняем локальные
    // Сначала сохраняем информацию о default export перед удалением
    let defaultExportInfo: { name: string; type: string } | null = null;
    const defaultExportMatch = code.match(/export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (defaultExportMatch) {
      defaultExportInfo = {
        name: defaultExportMatch[1],
        type: 'default-export'
      };
    }

    let processedCode = code
      // Удаляем import React from 'react'
      .replace(/import\s+React\s+from\s+['"]react['"];?\s*/gi, '')
      // Удаляем import { ... } from 'react'
      .replace(/import\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '')
      // Удаляем export default, оставляем только определение
      .replace(/export\s+default\s+/g, '')
      .trim();

    const wrappedMainModule = wrapImportedComponentUsages(processedCode);
    processedCode = wrappedMainModule.code;
    if (wrappedMainModule.wrappedCount > 0) {
      processedCode = `${IMPORTED_COMPONENT_BOUNDARY_HELPER}\n${processedCode}`;
    }

    // Создаем код для модулей зависимостей
    let modulesCode = '';
    let collectedCss = '';
    let importReplacements = {};

    // Явно добавляем CSS, импортированный напрямую в текущем файле (side-effect imports),
    // чтобы стили гарантированно попадали в preview.
    if (directCssBlocks.length > 0) {
      collectedCss += directCssBlocks.join('');
    }

    const isCssModulePath = (modulePath: string) => /\.css($|\?)/i.test(modulePath || '');
    const isImageModulePath = (modulePath: string) =>
      /\.(png|jpe?g|gif|webp|avif|bmp|svg)($|\?)/i.test(modulePath || '');
    const isLikelyImageContent = (value: string) => {
      const sample = String(value || '').slice(0, 256);
      if (!sample) return false;
      if (sample.startsWith('data:image/')) return true;
      return (
        sample.includes('PNG') ||
        sample.includes('IHDR') ||
        sample.includes('JFIF') ||
        sample.includes('WEBP')
      );
    };
    const createCssImportReplacement = (importSpec: string) => {
      if (!importSpec) {
        return '';
      }

      const trimmed = importSpec.trim();
      if (!trimmed) {
        return '';
      }

      if (trimmed.startsWith('{')) {
        const names = trimmed
          .replace(/[{}]/g, '')
          .split(',')
          .map((name: string) => name.trim())
          .filter(Boolean);

        return names
          .map((name: string) => {
            const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
            let alias = (parts[1] || parts[0] || '').trim().replace(/[^a-zA-Z0-9_$]/g, '');
            if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
              alias = 'cssImport';
            }
            return `const ${alias} = {};`;
          })
          .join('\n');
      }

      if (trimmed.startsWith('* as ')) {
        const alias = trimmed.replace('* as ', '').trim().replace(/[^a-zA-Z0-9_$]/g, '');
        return alias ? `const ${alias} = {};` : '';
      }

      const alias = trimmed.replace(/[^a-zA-Z0-9_$]/g, '');
      return alias ? `const ${alias} = {};` : '';
    };

    // Собираем уникальные абсолютные пути из pathMap
    const uniqueAbsolutePaths = new Set(Object.values(pathMap));
    const processedDeps = new Set(); // Для отслеживания уже обработанных абсолютных путей

    // Собираем информацию о зависимостях каждого модуля для сортировки
    const moduleDependencies = new Map(); // absolutePath -> Set of absolute paths of dependencies

    // Сначала собираем зависимости для каждого модуля
    for (const absolutePath of uniqueAbsolutePaths) {
      if (processedDeps.has(absolutePath)) {
        continue;
      }

      const content = dependencies[absolutePath] || (() => {
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === absolutePath) {
            return dependencies[relPath];
          }
        }
        return null;
      })();

      if (!content) continue;

      // РР·РІР»РµРєР°РµРј импорты из модуля
      const depImports = extractImports(content, absolutePath);
      const depSet = new Set();

      for (const imp of depImports) {
        // Пропускаем внешние библиотеки
        if (isBarePackageImport(imp.path)) {
          externalPackageImports.add(imp.path);
          continue;
        }
        if (!imp.path.startsWith('.') && !imp.path.startsWith('/') && !imp.path.startsWith('@')) {
          continue;
        }

        // Находим абсолютный путь зависимости
        const depResolvedPath = pathMap[imp.path] || dependencyModules[imp.path];
        if (
          depResolvedPath &&
          uniqueAbsolutePaths.has(depResolvedPath) &&
          !isCssModulePath(String(depResolvedPath))
        ) {
          depSet.add(depResolvedPath);
        }
      }

      moduleDependencies.set(absolutePath, depSet);
    }

    // Топологическая сортировка модулей по зависимостям
    const sortedModules: string[] = [];
    const visited: Set<string> = new Set();
    const visiting: Set<string> = new Set();

    const visit = (modulePath) => {
      if (visiting.has(modulePath)) {
        // Циклическая зависимость - пропускаем
        return;
      }
      if (visited.has(modulePath)) {
        return;
      }

      visiting.add(modulePath);
      const deps = moduleDependencies.get(modulePath) || new Set();
      for (const dep of deps) {
        if (uniqueAbsolutePaths.has(dep)) {
          visit(dep);
        }
      }
      visiting.delete(modulePath);
      visited.add(modulePath);
      sortedModules.push(modulePath);
    };

    // Запускаем топологическую сортировку
    for (const absolutePath of uniqueAbsolutePaths) {
      if (!visited.has(absolutePath)) {
        visit(absolutePath);
      }
    }

    console.log('RenderFile: Sorted modules by dependencies:', sortedModules.map(p => p.split('/').pop()));

    // Обрабатываем каждую зависимость в отсортированном порядке
    processedDeps.clear(); // Сбрасываем для повторного использования
    for (const absolutePath of sortedModules) {
      if (processedDeps.has(absolutePath)) {
        continue;
      }
      processedDeps.add(absolutePath);

      // Получаем контент по абсолютному пути
      let content = dependencies[absolutePath];
      // Если не найдено по абсолютному пути, ищем по относительному из pathMap
      if (!content) {
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === absolutePath) {
            content = dependencies[relPath];
            if (content) break;
          }
        }
      }

      if (!content) {
        continue;
      }

      // РСЃРїРѕР»СЊР·СѓРµРј абсолютный путь как основной ключ для обработки
      if (isCssModulePath(absolutePath)) {
        collectedCss += `\n/* ${absolutePath} */\n${content}\n`;
        continue;
      }

      const importPath = absolutePath;
      // Обрабатываем зависимость
      // Сначала извлекаем все экспорты
      let moduleExports: Record<string, unknown> = {};
      let hasDefaultExport = false;
      let defaultExportName: string | null = null;
      const namedExports: string[] = [];

      // Получаем фактический путь файла для текущей зависимости (для разрешения относительных путей)
      // РСЃРїРѕР»СЊР·СѓРµРј actualPathMap для получения фактического пути файла
      const currentDepResolvedPath = dependencyModules[importPath] || importPath;
      const currentDepActualPath = actualPathMap[currentDepResolvedPath] || currentDepResolvedPath;
      const currentDepBasePath = currentDepActualPath.substring(0, currentDepActualPath.lastIndexOf('/'));

      const moduleAbsolutePath = dependencyModules[importPath] || importPath;
      const allRelativePaths = Object.entries(pathMap)
        .filter(([relPath, absPath]) => absPath === moduleAbsolutePath)
        .map(([relPath]) => relPath);
      const allPossiblePaths = new Set(allRelativePaths);
      allPossiblePaths.add(moduleAbsolutePath);

      const pathWithoutExt = moduleAbsolutePath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      allPossiblePaths.add(pathWithoutExt);

      const pathParts = moduleAbsolutePath.split('/');
      if (pathParts.length >= 2) {
        const last2Parts = pathParts.slice(-2).join('/');
        allPossiblePaths.add(last2Parts);
        const last2PartsNoExt = last2Parts.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
        allPossiblePaths.add(last2PartsNoExt);
      }

      const fileName = pathParts[pathParts.length - 1];
      if (fileName) {
        allPossiblePaths.add(fileName);
        const fileNameNoExt = fileName.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
        allPossiblePaths.add(fileNameNoExt);
      }

      for (const relPath of allRelativePaths) {
        allPossiblePaths.add(relPath);
        const relPathNoExt = relPath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
        allPossiblePaths.add(relPathNoExt);
        if (relPath.startsWith('./')) {
          allPossiblePaths.add(relPath.substring(2));
        }
        if (relPath.startsWith('../')) {
          const relParts = relPath.split('/');
          if (relParts.length >= 2) {
            const relLast2 = relParts.slice(-2).join('/');
            allPossiblePaths.add(relLast2);
            const relLast2NoExt = relLast2.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
            allPossiblePaths.add(relLast2NoExt);
          }
        }
      }

      if (
        isImageModulePath(moduleAbsolutePath) ||
        isImageModulePath(currentDepActualPath) ||
        isLikelyImageContent(String(content || ''))
      ) {
        let dataUrl = String(content || '');
        if (!dataUrl.startsWith('data:')) {
          const imgResult = await readFileBase64(currentDepActualPath);
          if (imgResult.success) {
            dataUrl = `data:${imgResult.mimeType};base64,${imgResult.base64}`;
          } else if (!isLikelyImageContent(dataUrl)) {
            dataUrl = '';
          }
        }
        const imageExport = JSON.stringify(dataUrl);
        modulesCode += `
        // Image module: ${importPath} (absolute: ${moduleAbsolutePath})
        (function() {
          window.__modules__ = window.__modules__ || {};
          const moduleExports = { __esModule: true, default: ${imageExport} };
          window.__modules__['${moduleAbsolutePath}'] = moduleExports;
          window.__modules__['${importPath}'] = moduleExports;
          const allPaths = ${JSON.stringify(allRelativePaths)};
          allPaths.forEach(path => {
            window.__modules__[path] = moduleExports;
          });
          const allPossiblePaths = ${JSON.stringify(Array.from(allPossiblePaths))};
          allPossiblePaths.forEach(path => {
            if (path && path.trim()) {
              window.__modules__[path] = moduleExports;
            }
          });
        })();
      `;
        continue;
      }

      // Отладочная информация
      console.log('RenderFile: Processing dependency:', {
        importPath,
        currentDepResolvedPath,
        currentDepActualPath,
        currentDepBasePath,
        pathMapKeys: Object.keys(pathMap).slice(0, 10) // Первые 10 ключей для отладки
      });

      // Обрабатываем экспорты
      const instrumentedDependency = instrumentJsx(String(content ?? ''), currentDepActualPath);
      let processedDep: string = String(instrumentedDependency.code ?? '');

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:605',message:'Processing dependency before removing imports',data:{importPath,contentLength:processedDep.length,hasImports:processedDep.includes('import'),hasExports:processedDep.includes('export')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // СНАЧАЛА обрабатываем экспорты, ПОТОМ удаляем импорты
      // Named exports: export const/let/var (обрабатываем ДО удаления импортов)
      const namedConstExports: string[] = [];
      processedDep = processedDep.replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, (match: string, keyword: string, name: string) => {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:612',message:'Found named export const',data:{importPath,name,keyword},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        namedConstExports.push(name);
        if (!namedExports.includes(name)) {
          namedExports.push(name);
        }
        return `${keyword} ${name} =`;
      });

      // Named exports: export function (обрабатываем ДО удаления импортов)
      const namedFunctionExports: string[] = [];
      processedDep = processedDep.replace(/export\s+function\s+(\w+)/g, (match: string, name: string) => {
        namedFunctionExports.push(name);
        if (!namedExports.includes(name)) {
          namedExports.push(name);
        }
        return `function ${name}`;
      });

      // Обрабатываем импорты из зависимого файла перед встраиванием
      // РРјРїРѕСЂС‚С‹ React и React Native будут доступны глобально
      // Для локальных импортов заменяем их на код доступа к модулям
      processedDep = processedDep
        // Удаляем import React from 'react'
        .replace(/import\s+React\s+from\s+['"]react['"];?\s*/gi, '')
        // Удаляем import { ... } from 'react'
        .replace(/import\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '')
        // Удаляем import { ... } from 'react-native'
        .replace(/import\s*\{[^}]*\}\s*from\s+['"]react-native['"];?\s*/gi, '')
        .replace(/import\s+['"][^'"]+['"];?\s*/g, '')
        // Заменяем все остальные импорты на код доступа к модулям
        .replace(/import\s+(.*?)\s+from\s+['"](.*?)['"];?\s*/g, (match: string, importSpec: string, depImportPath: string) => {

          const currentDepFileName = currentDepActualPath.split('/').pop() || currentDepActualPath.split('\\').pop() || 'unknown';

          // Пропускаем только внешние библиотеки (npm пакеты)
          // Теперь обрабатываем локальные импорты, включая @ пути
          if (isCoreReactImport(depImportPath) ||
              isHttpImport(depImportPath)) {
            console.log(`[ProcessDependency] Skipping external import in ${currentDepFileName}: ${depImportPath}`);
            return ''; // Удаляем импорт
          }

          // Для локальных импортов заменяем на код доступа к модулям
          // РСЃРїРѕР»СЊР·СѓРµРј фактический путь файла зависимости для разрешения относительных путей
          if (isCssModulePath(depImportPath)) {
            return createCssImportReplacement(importSpec);
          }

          const finalDepPath = findModulePath(depImportPath, currentDepActualPath, pathMap, dependencyModules);

          // Разрешаем путь синхронно для генерации всех возможных вариантов ключей
          const resolvedPathSync = resolvePathSync(currentDepActualPath, depImportPath);
          const resolvedPathNoExt = resolvedPathSync.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
          const resolvedParts = resolvedPathSync.split('/');
          const resolvedLast2 = resolvedParts.length >= 2 ? resolvedParts.slice(-2).join('/') : '';
          const resolvedLast2NoExt = resolvedLast2.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
          const resolvedFileName = resolvedParts[resolvedParts.length - 1] || '';
          const resolvedFileNameNoExt = resolvedFileName.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');

          // Создаем список всех возможных ключей для поиска модуля
          const possibleKeys = [
            finalDepPath,
            depImportPath,
            resolvedPathSync,
            resolvedPathNoExt,
            resolvedLast2,
            resolvedLast2NoExt,
            resolvedFileName,
            resolvedFileNameNoExt
          ].filter(Boolean);

          // Сериализуем для использования в шаблонной строке
          const possibleKeysJson = JSON.stringify(possibleKeys);

          console.log(`[ProcessDependency] Processing import in ${currentDepFileName}:`, {
            file: currentDepFileName,
            filePath: currentDepActualPath,
            importPath: depImportPath,
            importSpec,
            resolvedPath: finalDepPath,
            resolvedPathSync,
            possibleKeys,
            foundInPathMap: !!(pathMap as Record<string, string>)[depImportPath] || !!(pathMap as Record<string, string>)[String(finalDepPath)],
            pathMapKeys: Object.keys(pathMap).filter(k =>
              k.includes(depImportPath.replace(/\.\.?\//g, '')) ||
              k.includes('commonStyles') ||
              k.includes(finalDepPath.split('/').pop() || '')
            ).slice(0, 10)
          });

          if (importSpec.startsWith('{')) {
            // Named imports: import { a, b as c } from ...
            const names = importSpec.replace(/[{}]/g, '').split(',').map((n: string) => n.trim()).filter((n: string) => n);
            return names.map(name => {
              const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
              let orig = parts[0].trim();
              let alias = parts[1].trim();
              // Валидация имени переменной: убираем недопустимые символы
              alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
                // Если имя невалидно, используем безопасное имя
                alias = 'imported_' + Math.random().toString(36).substr(2, 9);
              }
              // Также валидируем orig, так как он используется в module.${orig}
              orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!orig) {
                orig = 'default';
              }
              return `const ${alias} = (() => {
                // Ждем, пока модули загрузятся (на случай, если модуль еще загружается)
                const waitForModule = (maxAttempts = 50) => {
                  const possibleKeys = ${possibleKeysJson};
                  let module = null;
                  
                  for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    // Пробуем найти модуль по всем возможным ключам
                    // РРіРЅРѕСЂРёСЂСѓРµРј null значения (предварительно зарегистрированные слоты)
                    for (const key of possibleKeys) {
                      if (window.__modules__ && window.__modules__[key] !== null && window.__modules__[key] !== undefined) {
                        module = window.__modules__[key];
                        break;
                      }
                    }
                    
                    // Если не нашли по точным ключам, ищем по частичному совпадению
                    if (!module && window.__modules__) {
                      const fileName = '${resolvedFileNameNoExt}';
                      const last2Parts = '${resolvedLast2NoExt}';
                      const importPathClean = '${depImportPath.replace(/\.\.?\//g, '')}';
                      for (const key of Object.keys(window.__modules__)) {
                        const value = window.__modules__[key];
                        // РРіРЅРѕСЂРёСЂСѓРµРј null значения
                        if (value !== null && value !== undefined && 
                            (key.includes(fileName) || key.includes(last2Parts) || 
                            key.endsWith('${depImportPath}') || key.includes(importPathClean))) {
                          module = value;
                          break;
                        }
                      }
                    }
                    
                    if (module) break;
                    
                    // Если модуль не найден, ждем немного и пробуем снова
                    if (attempt < maxAttempts - 1) {
                      // Синхронное ожидание (не идеально, но работает)
                      const start = Date.now();
                      while (Date.now() - start < 10) {
                        // Ждем 10ms
                      }
                    }
                  }
                  
                  return module;
                };
                
                const module = waitForModule();
                
                if (!module || module === null) {
                  console.error('Module not found for ${depImportPath}. Tried keys:', ${possibleKeysJson});
                  console.error('Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Module values:', Object.entries(window.__modules__ || {}).map(([k, v]) => [k, v === null ? 'null' : typeof v]).slice(0, 10));
                  throw new Error('Failed to import ${orig} from ${depImportPath}. Module not found.');
                }
                
                const value = module?.${orig} || module?.default?.${orig};
                if (value === undefined) {
                  console.error('Export ${orig} not found in module. Module keys:', Object.keys(module || {}));
                  throw new Error('Failed to import ${orig} from ${depImportPath}. Export not found.');
                }
                return value;
              })();`;
            }).join('\n');
          } else {
            // Default import: import name from ...
            return `const ${importSpec.trim()} = (() => {
              // Ждем, пока модули загрузятся (на случай, если модуль еще загружается)
              const waitForModule = (maxAttempts = 50) => {
                const possibleKeys = ${possibleKeysJson};
                let module = null;
                
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                  // Пробуем найти модуль по всем возможным ключам
                  // РРіРЅРѕСЂРёСЂСѓРµРј null значения (предварительно зарегистрированные слоты)
                  for (const key of possibleKeys) {
                    if (window.__modules__ && window.__modules__[key] !== null && window.__modules__[key] !== undefined) {
                      module = window.__modules__[key];
                      break;
                    }
                  }
                  
                  // Если не нашли по точным ключам, ищем по частичному совпадению
                  if (!module && window.__modules__) {
                    const fileName = '${resolvedFileNameNoExt}';
                    const last2Parts = '${resolvedLast2NoExt}';
                    const importPathClean = '${depImportPath.replace(/\.\.?\//g, '')}';
                    for (const key of Object.keys(window.__modules__)) {
                      const value = window.__modules__[key];
                      // РРіРЅРѕСЂРёСЂСѓРµРј null значения
                      if (value !== null && value !== undefined && 
                          (key.includes(fileName) || key.includes(last2Parts) || 
                          key.endsWith('${depImportPath}') || key.includes(importPathClean))) {
                        module = value;
                        break;
                      }
                    }
                  }
                  
                  if (module) break;
                  
                  // Если модуль не найден, ждем немного и пробуем снова
                  if (attempt < maxAttempts - 1) {
                    // Синхронное ожидание (не идеально, но работает)
                    const start = Date.now();
                    while (Date.now() - start < 10) {
                      // Ждем 10ms
                    }
                  }
                }
                
                return module;
              };
              
              const module = waitForModule();
              
              if (!module || module === null) {
                console.error('Module not found for ${depImportPath}. Tried keys:', ${possibleKeysJson});
                console.error('Available modules:', Object.keys(window.__modules__ || {}));
                console.error('Module values:', Object.entries(window.__modules__ || {}).map(([k, v]) => [k, v === null ? 'null' : typeof v]).slice(0, 10));
                throw new Error('Failed to import default from ${depImportPath}. Module not found.');
              }
              
              const value = module?.default || module?.styles || module;
              if (value === undefined) {
                console.error('Default export not found in module. Module keys:', Object.keys(module || {}));
                throw new Error('Failed to import default from ${depImportPath}. Default export not found.');
              }
              return value;
            })();`;
          }
        })
        .trim();

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:650',message:'Dependency processed after removing imports',data:{importPath,processedLength:processedDep.length,hasImports:processedDep.includes('import'),hasExports:processedDep.includes('export'),namedExportsCount:namedExports.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // Default export: export default ...
      const defaultExportMatch = processedDep.match(/export\s+default\s+(.+?)(;|$)/s);
      if (defaultExportMatch) {
        hasDefaultExport = true;
        const exportValue = defaultExportMatch[1].trim();
        // Если это переменная или выражение
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportValue)) {
          defaultExportName = exportValue;
          // Удаляем строку export default полностью
          processedDep = processedDep.replace(/export\s+default\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*;?\s*/g, '');
        } else {
          defaultExportName = '__defaultExport';
          processedDep = processedDep.replace(/export\s+default\s+/g, 'const __defaultExport = ');
        }
      }

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:695',message:'After processing exports',data:{importPath,hasDefaultExport,defaultExportName,hasExports:processedDep.includes('export')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion


      // Named exports: export { ... }
      const namedExportsMatch = processedDep.match(/export\s+\{([^}]+)\}/);
      if (namedExportsMatch) {
        const exports = namedExportsMatch[1].split(',').map(e => e.trim()).filter(e => e);
        exports.forEach(exp => {
          const parts = exp.includes(' as ') ? exp.split(' as ') : [exp, exp];
          const orig = parts[0].trim();
          const alias = parts[1].trim();
          moduleExports[alias] = orig;
          if (!namedExports.includes(orig)) {
            namedExports.push(orig);
          }
        });
        processedDep = processedDep.replace(/export\s+\{([^}]+)\}/g, '');
      }

      // Если нет default export, но есть named export 'styles', используем его как default
      if (!hasDefaultExport && namedExports.includes('styles')) {
        defaultExportName = 'styles';
        hasDefaultExport = true;
      }

      // Удаляем все оставшиеся экспорты (на случай, если что-то пропустили)
      processedDep = processedDep.replace(/export\s+default\s+.*?;?\s*/g, '');
      processedDep = processedDep.replace(/export\s+\{[^}]+\}\s*;?\s*/g, '');

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:740',message:'Before creating module code',data:{importPath,hasExports:processedDep.includes('export'),processedLength:processedDep.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion


      console.log(`[ProcessDependency] All possible paths for module ${moduleAbsolutePath}:`, Array.from(allPossiblePaths));

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:752',message:'Creating module code',data:{importPath,absolutePath:moduleAbsolutePath,hasDefaultExport,defaultExportName,namedExportsCount:namedExports.length,namedExports:namedExports.slice(0,5),allRelativePathsCount:allRelativePaths.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // Создаем модуль
      modulesCode += `
        // Модуль: ${importPath} (absolute: ${moduleAbsolutePath})
        (function() {
          // Убеждаемся, что window.__modules__ инициализирован
          window.__modules__ = window.__modules__ || {};
          
          // Убеждаемся, что React Native доступен (для StyleSheet и т.д.)
          const { StyleSheet } = (typeof window !== 'undefined' && window.ReactNative) || {};
          
          // ВАЖНО: Выполняем код модуля ПОСЛЕ того, как все модули предварительно зарегистрированы
          // Это гарантирует, что когда код модуля обращается к другим модулям через window.__modules__,
          // эти модули уже существуют (даже если они еще не выполнились)
          ${processedDep}
          
          // Теперь все переменные должны быть доступны в этой области видимости
          const moduleExports = {};
          
          // Добавляем named exports - используем прямую проверку в текущей области видимости
          ${namedExports.length > 0 ? namedExports
            .map(
              (name) => `if (typeof ${name} !== "undefined") {
              moduleExports.${name} = ${name};
              // #region agent log
              ,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-export',message:'Export added successfully',data:{name:'${name}',importPath:'${importPath}',exportKeys:Object.keys(moduleExports)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              console.log('Added named export ${name} to module ${importPath}:', ${name});
            } else {
              // #region agent log
              ,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-export',message:'Export variable undefined',data:{name:'${name}',importPath:'${importPath}'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              console.error('Named export ${name} is undefined in module ${importPath}!');
              console.error('Trying to find variable in different ways...');
              // Пробуем найти переменную через различные способы
              try {
                // Пробуем через window (если была объявлена глобально)
                if (typeof window !== 'undefined' && typeof window.${name} !== 'undefined') {
                  moduleExports.${name} = window.${name};
                  console.log('Found ${name} on window object');
                } else {
                  // Пробуем через this (в строгом режиме это не сработает, но попробуем)
                  try {
                    if (typeof this !== 'undefined' && typeof this.${name} !== 'undefined') {
                      moduleExports.${name} = this.${name};
                      console.log('Found ${name} on this object');
                }
              } catch(e) {}
                  // Если не нашли, выводим отладочную информацию
                  if (!moduleExports.${name}) {
                    console.error('Could not find ${name} in any scope');
                    console.error('Available variables:', Object.keys(typeof window !== 'undefined' ? window : {}));
                  }
                }
              } catch(e) {
                console.error('Error while trying to find ${name}:', e);
              }
            }`
          ).join('\n          ') : '// No named exports'}
          
          // Добавляем default export
          ${hasDefaultExport && defaultExportName ? 
            `moduleExports.default = typeof ${defaultExportName} !== "undefined" ? ${defaultExportName} : (moduleExports.styles || moduleExports);` : 
            'moduleExports.default = moduleExports.styles || moduleExports;'
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-register',message:'Registering module',data:{importPath:'${importPath}',absolutePath:'${moduleAbsolutePath}',exportKeys:Object.keys(moduleExports),namedExports:${JSON.stringify(namedExports)}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          console.log('Module loaded:', '${importPath}', 'absolute:', '${moduleAbsolutePath}', moduleExports);
          console.log('Module named exports list:', ${JSON.stringify(namedExports)});
          console.log('Module exports keys:', Object.keys(moduleExports));
          
          // Регистрируем модуль по абсолютному пути (нормализованному)
          window.__modules__['${moduleAbsolutePath}'] = moduleExports;
          // Также регистрируем по всем относительным путям из pathMap для обратной совместимости
          window.__modules__['${importPath}'] = moduleExports;
          
          // Регистрируем по всем путям, которые указывают на этот абсолютный путь
          const allPaths = ${JSON.stringify(allRelativePaths)};
          allPaths.forEach(path => {
            window.__modules__[path] = moduleExports;
          });
          
          // Регистрируем по всем возможным вариантам путей для поддержки импортов из разных контекстов
          const allPossiblePaths = ${JSON.stringify(Array.from(allPossiblePaths))};
          allPossiblePaths.forEach(path => {
            if (path && path.trim()) {
              // Экранируем путь для безопасного использования в качестве ключа
              const escapedPath = path.replace(/'/g, "\\'");
              window.__modules__[path] = moduleExports;
            }
          });
          
          // Дополнительно регистрируем по имени файла без расширения для лучшей совместимости
          const fileName = '${moduleAbsolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
          if (fileName) {
            window.__modules__[fileName] = moduleExports;
          }
          
          // Также регистрируем по всем вариантам путей, которые могут быть использованы из разных контекстов
          // (например, '../components/Header' из HomeScreen и './components/Header' из App)
          const resolvedVariants = [
            '${moduleAbsolutePath}',
            '${moduleAbsolutePath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '')}',
            '${moduleAbsolutePath.split('/').slice(-2).join('/')}',
            '${moduleAbsolutePath.split('/').slice(-2).join('/').replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '')}',
            '${moduleAbsolutePath.split('/').pop()}',
            '${moduleAbsolutePath.split('/').pop()?.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '')}'
          ];
          resolvedVariants.forEach(variant => {
            if (variant && variant.trim()) {
              window.__modules__[variant] = moduleExports;
            }
          });
          
          console.log('Registered module under keys:', allPossiblePaths);
          // #region agent log
          {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-register',message:'Module registered',data:{importPath:'${importPath}',absolutePath:'${moduleAbsolutePath}',allModules:Object.keys(window.__modules__||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
        })();
      `;

      // Заменяем импорт на доступ к модулю
      // РС‰РµРј импорт по всем возможным путям (относительному и абсолютному)
      let importStatement = imports.find(imp => imp.path === importPath);
      if (!importStatement) {
        // Если не найдено по абсолютному пути, ищем по относительным путям из pathMap
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === importPath) {
            importStatement = imports.find(imp => imp.path === relPath);
            if (importStatement) break;
          }
        }
      }
      if (importStatement) {
        // Парсим, что именно импортируется
        const match = importStatement.fullStatement.match(/import\s+(.*?)\s+from/);
        if (match) {
          const importSpec = match[1].trim();
          if (isCssModulePath(importPath)) {
            importReplacements[importStatement.fullStatement] = createCssImportReplacement(importSpec);
            continue;
          }
          // Проверяем import * as name from ...
          const starAsMatch = importStatement.fullStatement.match(/import\s+\*\s+as\s+(\w+)/);
          if (starAsMatch) {
            const alias = starAsMatch[1];
            importReplacements[importStatement.fullStatement] = `const ${alias} = window.__modules__['${importPath}'];`;
          } else if (importSpec.startsWith('{')) {
            // Named imports: import { a, b as c } from ...
            const names = importSpec.replace(/[{}]/g, '').split(',').map((n: string) => n.trim()).filter((n: string) => n);
            // Получаем абсолютный путь для этого модуля
            const absolutePath = dependencyModules[importPath] || importPath;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:795',message:'Processing named imports',data:{importPath,absolutePath,importSpec,names,namedExports:namedExports.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            const replacements = names.map(name => {
              const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
              let orig = parts[0].trim();
              let alias = parts[1].trim();
              // Валидация имени переменной: убираем недопустимые символы
              alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
                // Если имя невалидно, используем безопасное имя
                alias = 'imported_' + Math.random().toString(36).substr(2, 9);
              }
              // Также валидируем orig, так как он используется в module.${orig}
              orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!orig) {
                orig = 'default';
              }
              // Пробуем сначала абсолютный путь, потом относительный
              // Добавляем проверку и логирование для отладки
              return `const ${alias} = (() => {
                // #region agent log
                {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Resolving import',data:{orig:'${orig}',alias:'${alias}',importPath:'${importPath}',absolutePath:'${absolutePath}',modulesAvailable:Object.keys(window.__modules__||{}).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                // РС‰РµРј модуль по всем возможным путям
                const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
                const module2 = window.__modules__ && window.__modules__['${importPath}'];
                // Также пробуем найти модуль по любому пути, который содержит имя файла
                let module3 = null;
                const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
                if (window.__modules__) {
                  for (const key of Object.keys(window.__modules__)) {
                    if (key.includes(fileName) || key.endsWith('${importPath}') || key === fileName) {
                      module3 = window.__modules__[key];
                      break;
                    }
                  }
                }
                // #region agent log
                {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Module lookup',data:{orig:'${orig}',hasModule1:!!module1,hasModule2:!!module2,hasModule3:!!module3,module1Keys:module1?Object.keys(module1):[],module2Keys:module2?Object.keys(module2):[],module3Keys:module3?Object.keys(module3):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                const module = module1 || module2 || module3;
                if (!module) {
                  console.error('Module not found for ${importPath}. Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Tried paths: ${absolutePath}, ${importPath}');
                  throw new Error('Module not found: ${importPath}');
                }
                const value = module.${orig} || module.default?.${orig};
                // #region agent log
                {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Import result',data:{orig:'${orig}',alias:'${alias}',valueDefined:value!==undefined,valueType:typeof value,moduleKeys:Object.keys(module)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                if (value === undefined) {
                  console.error('Failed to import ${orig} from ${importPath}.');
                  console.error('Module found:', module);
                  console.error('Module keys:', Object.keys(module || {}));
                  console.error('Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Module ${absolutePath}:', module1);
                  console.error('Module ${importPath}:', module2);
                  console.error('Searched module:', module3);
                  throw new Error('Failed to import ${orig} from ${importPath}. Export "${orig}" not found in module. Available exports: ' + Object.keys(module || {}).join(', '));
                }
                return value;
              })();`;
            });
            importReplacements[importStatement.fullStatement] = replacements.join('\n');
          } else {
            // Default import: import name from ...
            // Получаем абсолютный путь для этого модуля (используем ту же логику, что и для named imports)
            const absolutePath = dependencyModules[importPath] || importPath;

            // Получаем информацию о default export из обработанной зависимости
            // РС‰РµРј модуль в dependencies по абсолютному пути
            const depContent = dependencies[absolutePath] || dependencies[importPath];
            let hasDefaultExport2 = false;
            let defaultExportName2: string | null = null;

            if (depContent) {
              // Проверяем наличие default export в содержимом
              const defaultExportMatch = depContent.match(/export\s+default\s+(.+?)(;|$)/s);
              if (defaultExportMatch) {
                hasDefaultExport2 = true;
                const exportValue = defaultExportMatch[1].trim();
                if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportValue)) {
                  defaultExportName2 = exportValue;
                } else {
                  defaultExportName2 = '__defaultExport';
                }
              }
            }

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:885',message:'Processing default import',data:{importPath,absolutePath,importSpec,hasDefaultExport:hasDefaultExport2,defaultExportName:defaultExportName2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            // Создаем код для импорта default значения
            importReplacements[importStatement.fullStatement] = `const ${importSpec} = (() => {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Resolving default import',data:{importSpec:'${importSpec}',importPath:'${importPath}',absolutePath:'${absolutePath}'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
              const module2 = window.__modules__ && window.__modules__['${importPath}'];
              // Также пробуем найти модуль по любому пути, который содержит имя файла
              let module3 = null;
              const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
              if (window.__modules__) {
                for (const key of Object.keys(window.__modules__)) {
                  if (key.includes(fileName) || key.endsWith('${importPath}')) {
                    module3 = window.__modules__[key];
                    break;
                  }
                }
              }
              // #region agent log
              {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Module lookup for default import',data:{importSpec:'${importSpec}',hasModule1:!!module1,hasModule2:!!module2,hasModule3:!!module3,module1Keys:module1?Object.keys(module1):[],module2Keys:module2?Object.keys(module2):[],module3Keys:module3?Object.keys(module3):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              const module = module1 || module2 || module3;
              const value = module?.default || module?.styles || module;
              // #region agent log
              {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Default import result',data:{importSpec:'${importSpec}',valueDefined:value!==undefined,valueType:typeof value,isFunction:typeof value==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              if (value === undefined) {
                console.error('Failed to import default from ${importPath}. Available modules:', Object.keys(window.__modules__ || {}));
                console.error('Module ${absolutePath}:', module1);
                console.error('Module ${importPath}:', module2);
                console.error('Searched module:', module3);
                throw new Error('Failed to import default from ${importPath}. Module not found or default export not available.');
              }
              return value;
            })();`;
          }
        }
      }
    }

    // Обрабатываем импорты в основном файле
    for (const imp of imports) {
      // Пропускаем внешние библиотеки
      if (isCoreReactImport(imp.path) || isHttpImport(imp.path)) {
        continue;
      }

      // Получаем абсолютный путь для этого импорта
      const absolutePath = dependencyModules[imp.path] || pathMap[imp.path] || imp.path;

      // Парсим, что именно импортируется
      const match = imp.fullStatement.match(/import\s+(.*?)\s+from/);
      if (!match) continue;

      const importSpec = match[1].trim();

      // Проверяем import * as name from ...
      const starAsMatch = imp.fullStatement.match(/import\s+\*\s+as\s+(\w+)/);
      if (starAsMatch) {
        const alias = starAsMatch[1];
        importReplacements[imp.fullStatement] = `const ${alias} = window.__modules__ && window.__modules__['${absolutePath}'] || window.__modules__ && window.__modules__['${imp.path}'] || {};`;
      } else if (importSpec.startsWith('{')) {
        // Named imports: import { a, b as c } from ...
        const names = importSpec.replace(/[{}]/g, '').split(',').map((n: string) => n.trim()).filter((n: string) => n);
        const replacements = names.map(name => {
          const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
          let orig = parts[0].trim();
          let alias = parts[1].trim();
          // Валидация имени переменной: убираем недопустимые символы
          alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
          if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
            // Если имя невалидно, используем безопасное имя
            alias = 'imported_' + Math.random().toString(36).substr(2, 9);
          }
          // Также валидируем orig, так как он используется в module.${orig}
          orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
          if (!orig) {
            orig = 'default';
          }
          return `const ${alias} = (() => {
            const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
            const module2 = window.__modules__ && window.__modules__['${imp.path}'];
            let module3 = null;
            const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
            if (window.__modules__) {
              for (const key of Object.keys(window.__modules__)) {
                if (key.includes(fileName) || key.endsWith('${imp.path}') || key === fileName) {
                  module3 = window.__modules__[key];
                  break;
                }
              }
            }
            const module = module1 || module2 || module3;
            if (!module) {
              console.error('Module not found for ${imp.path}. Available modules:', Object.keys(window.__modules__ || {}));
              throw new Error('Module not found: ${imp.path}');
            }
            const value = module.${orig} || module.default?.${orig};
            if (value === undefined) {
              console.error('Failed to import ${orig} from ${imp.path}.');
              console.error('Module found:', module);
              console.error('Module keys:', Object.keys(module || {}));
              console.error('Available modules:', Object.keys(window.__modules__ || {}));
              throw new Error('Failed to import ${orig} from ${imp.path}. Export "${orig}" not found in module. Available exports: ' + Object.keys(module || {}).join(', '));
            }
            return value;
          })();`;
        });
        importReplacements[imp.fullStatement] = replacements.join('\n');
      } else {
        // Default import: import name from ...
        importReplacements[imp.fullStatement] = `const ${importSpec} = (() => {
          const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
          const module2 = window.__modules__ && window.__modules__['${imp.path}'];
          let module3 = null;
          const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
          if (window.__modules__) {
            for (const key of Object.keys(window.__modules__)) {
              if (key.includes(fileName) || key.endsWith('${imp.path}')) {
                module3 = window.__modules__[key];
                break;
              }
            }
          }
          const module = module1 || module2 || module3;
          const value = module?.default || module?.styles || module;
          if (value === undefined) {
            console.error('Failed to import default from ${imp.path}. Available modules:', Object.keys(window.__modules__ || {}));
            throw new Error('Failed to import default from ${imp.path}. Module not found or default export not available.');
          }
          return value;
        })();`;
      }
    }

    // Заменяем импорты в коде
    console.log('RenderFile: Import replacements:', importReplacements);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:817',message:'Before replacing imports',data:{importReplacementsCount:Object.keys(importReplacements).length,processedCodeLength:processedCode.length,importReplacements:Object.keys(importReplacements).map(k=>k.substring(0,50))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    for (const [original, replacement] of Object.entries(importReplacements)) {
      if (processedCode.includes(original)) {
        processedCode = processedCode.replace(original, replacement);
        console.log('RenderFile: Replaced import:', original, 'with:', replacement);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:822',message:'Replaced import',data:{original:original.substring(0,50),replacement:replacement.substring(0,100),hasHeader:replacement.includes('Header')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      } else {
        console.warn('RenderFile: Import not found in code:', original);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:827',message:'Import not found in code',data:{original:original.substring(0,50),codeContains:processedCode.includes(original)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
      }
    }

    // Удаляем оставшиеся локальные импорты (которые не были заменены)
    processedCode = processedCode.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
    processedCode = processedCode.replace(/import\s+['"][^'"]+['"];?\s*/g, '');

    console.log('RenderFile: Processed code length:', processedCode.length);
    console.log('RenderFile: Modules code length:', modulesCode.length);
    console.log('RenderFile: Dependency paths:', dependencyPaths);

    // Создаем код для предварительной регистрации всех модулей
    // Это гарантирует, что модули будут доступны, даже если они еще не выполнились
    const allModulePaths = new Set<string>();
    // Собираем все возможные пути для каждого модуля
    for (const [relPath, absPath] of Object.entries(pathMap)) {
      allModulePaths.add(relPath);
      allModulePaths.add(absPath);
      // Также добавляем варианты без расширения и последние части пути
      const absPathNoExt = absPath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      allModulePaths.add(absPathNoExt);
      const parts = absPath.split('/');
      if (parts.length >= 2) {
        allModulePaths.add(parts.slice(-2).join('/'));
        allModulePaths.add(parts.slice(-2).join('/').replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, ''));
      }
      if (parts.length > 0) {
        allModulePaths.add(parts[parts.length - 1]);
        allModulePaths.add(parts[parts.length - 1].replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, ''));
      }
    }

    // Также добавляем все пути из allPossiblePaths для каждого модуля
    for (const absolutePath of uniqueAbsolutePaths) {
      const moduleAbsolutePath = dependencyModules[absolutePath] || absolutePath;
      const pathParts = moduleAbsolutePath.split('/');
      if (pathParts.length >= 2) {
        allModulePaths.add(pathParts.slice(-2).join('/'));
        allModulePaths.add(pathParts.slice(-2).join('/').replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, ''));
      }
      if (pathParts.length > 0) {
        allModulePaths.add(pathParts[pathParts.length - 1]);
        allModulePaths.add(pathParts[pathParts.length - 1].replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, ''));
      }
    }

    const preRegisterCode = Array.from(allModulePaths).filter(Boolean).map((path: string) => {
      // Экранируем кавычки в пути
      const escapedPath = path.replace(/'/g, "\\'");
      return `window.__modules__['${escapedPath}'] = window.__modules__['${escapedPath}'] || null;`;
    }).join('\n        ');
    const externalModulesCode = Array.from(externalPackageImports).sort().map((path: string) => {
      const escapedPath = path.replace(/'/g, "\\'");
      const externalUrl = createExternalModuleUrl(path);
      return `
        try {
          const moduleNs = await import(${JSON.stringify(externalUrl)});
          const normalizedModuleNs = window.__normalizeExternalModule__
            ? window.__normalizeExternalModule__('${escapedPath}', moduleNs)
            : moduleNs;
          window.__modules__['${escapedPath}'] = normalizedModuleNs;
          console.log('[ExternalModule] Loaded ${escapedPath} from ${externalUrl}');
        } catch (error) {
          console.error('[ExternalModule] Failed to load ${escapedPath} from ${externalUrl}', error);
          throw new Error('Module not found: ${escapedPath}');
        }`;
    }).join('\n');

    // Обертываем modulesCode, чтобы сначала предварительно зарегистрировать модули
    const wrappedModulesCode = `
        // Предварительная регистрация всех модулей (создаем пустые слоты)
        ${preRegisterCode}
        
        console.log('Pre-registered ${allModulePaths.size} module paths:', ${JSON.stringify(Array.from(allModulePaths).slice(0, 20))});
        
        // Теперь загружаем модули (они заполнят предварительно зарегистрированные слоты)
        ${modulesCode}
        
        console.log('All modules loaded. Total modules:', Object.keys(window.__modules__ || {}).length);
        console.log('Registered module keys:', Object.keys(window.__modules__ || {}));
    `;

    return {
      code: processedCode,
      modulesCode: wrappedModulesCode,
      externalModulesCode,
      stylesCode: collectedCss,
      dependencyPaths: dependencyPaths, // Возвращаем пути зависимых файлов
      defaultExportInfo: defaultExportInfo // Сохраняем информацию о default export
    };
  };

  // detectComponents теперь импортируется из модуля react-processor

  // Создаем HTML обертку для React файлов
  const createReactHTML = async (code, basePath) => {
    // ВАЖНО: сначала инструментируем РРЎРҐРћР”РќР«Р™ код, чтобы data-no-code-ui-id были стабильны относительно файла.
    // Потом уже прогоняем processReactCode вЂ” он не должен ломать data-no-code-ui-id.
    console.log('рџ”µ createReactHTML: инструментируем исходный код', {
      codeLength: code.length,
      codePreview: code.substring(0, 300),
      hasJsxElements: /<[A-Za-z]/.test(code)
    });
    const instOriginal = instrumentJsx(code, basePath);
    console.log('рџ”µ createReactHTML: результат инструментации исходного кода', {
      instOriginalMapKeys: Object.keys(instOriginal.map).length,
      instOriginalMapSample: Object.keys(instOriginal.map).slice(0, 5),
      instOriginalCodeLength: instOriginal.code.length,
      instOriginalCodeHasIds: (instOriginal.code.match(/data-no-code-ui-id/g) || []).length
    });

    // Сначала обрабатываем код (загружаем зависимости, заменяем импорты)
    const processed = await processReactCode(instOriginal.code, basePath);
    const processedCodeBeforeInst = processed.code; // уже содержит data-no-code-ui-id (или legacy data-mrpak-id)
    const modulesCode = processed.modulesCode || '';
    const externalModulesCode = processed.externalModulesCode || '';
    const stylesCode = processed.stylesCode || '';
    const dependencyPaths = processed.dependencyPaths || [];
    const defaultExportInfo = processed.defaultExportInfo || null;

    // Собираем карту для превью/редактора на обработанном коде (атрибуты уже есть).
    const instProcessed = instrumentJsx(processedCodeBeforeInst, basePath);
    const processedCode = instProcessed.code;

    // Детектируем компоненты в обработанном коде
    const detectedComponents = detectComponents(processedCode);

    // Если есть информация о default export, добавляем её с наивысшим приоритетом
    if (defaultExportInfo && !detectedComponents.find(c => c.name === defaultExportInfo.name && c.type === 'default-export')) {
      detectedComponents.unshift({
        name: defaultExportInfo.name,
        type: 'default-export',
        priority: 0
      });
    }

    // Находим компонент для рендеринга по приоритету
    let componentToRender: string | null = null;
    let componentName: string | null = null;

    // Приоритет: default export > named exports > остальные компоненты
    for (const comp of detectedComponents) {
      // Проверяем, что компонент действительно существует в коде
      const componentExists = new RegExp(`(?:const|let|var|function)\\s+${comp.name}\\s*[=(]`).test(processedCode) ||
                               new RegExp(`\\b${comp.name}\\s*=`).test(processedCode);
      if (componentExists) {
        componentToRender = comp.name;
        componentName = comp.name;
        break;
      }
    }

    // Fallback: пробуем стандартные имена
    if (!componentToRender) {
      const standardNames = ['App', 'MyComponent', 'Component'];
      for (const name of standardNames) {
        if (new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode)) {
          componentToRender = name;
          componentName = name;
          break;
        }
      }
    }

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Component Preview</title>
    <script>
        // Передаем filePath в глобальную переменную для использования в скрипте
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(basePath)};
        window.addEventListener('unhandledrejection', (event) => {
          const reason = event && event.reason;
          const message = String((reason && (reason.message || reason)) || '').toLowerCase();
          if (message.includes('canceled') || message.includes('cancelled') || message.includes('aborterror')) {
            event.preventDefault();
          }
        });
    </script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script>
      if (typeof Babel !== 'undefined' && Babel.registerPreset && Babel.availablePresets) {
        Babel.registerPreset('mrpak-tsx', {
          presets: [
            [Babel.availablePresets['react'], { runtime: 'classic' }],
            [Babel.availablePresets['typescript'], { allExtensions: true, isTSX: true }]
          ]
        });
      }
    </script>
    <script>
        if (typeof Babel !== 'undefined' && Babel.registerPreset && Babel.availablePresets) {
            Babel.registerPreset('mrpak-tsx', {
                presets: [
                    [Babel.availablePresets['react'], { runtime: 'classic' }],
                    [Babel.availablePresets['typescript'], { allExtensions: true, isTSX: true }]
                ]
            });
        }
    </script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f5f5f5;
        }
        #root {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px 0;
        }
        .info {
            color: #666;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        ${stylesCode}
    </style>
</head>
<body>
    <div class="info">
        <strong>React Component Preview</strong><br>
        Loading component from selected file...
    </div>
    <div id="root"></div>
    <script type="module">
        window.__externalModulesReady__ = (async () => {
            window.__modules__ = window.__modules__ || {};
            const adaptExternalReactNode = (node) => {
                if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
                    return node;
                }
                if (Array.isArray(node)) {
                    return node.map((child) => adaptExternalReactNode(child));
                }
                if (typeof node === 'object' && node.$$typeof && node.type) {
                    const props = { ...(node.props || {}) };
                    const children = Object.prototype.hasOwnProperty.call(props, 'children') ? props.children : undefined;
                    if (Object.prototype.hasOwnProperty.call(props, 'children')) {
                        delete props.children;
                    }
                    const normalizedChildren = children === undefined ? [] : (Array.isArray(children) ? children : [children]).map((child) => adaptExternalReactNode(child));
                    return React.createElement(node.type, props, ...normalizedChildren);
                }
                return node;
            };
            const adaptExternalReactComponent = (Component) => {
                if (typeof Component !== 'function') return Component;
                const WrappedComponent = function MrpakExternalComponentAdapter(props) {
                    return adaptExternalReactNode(Component(props));
                };
                try {
                    Object.defineProperty(WrappedComponent, 'name', {
                        value: Component.displayName || Component.name || 'MrpakExternalComponentAdapter'
                    });
                } catch {}
                WrappedComponent.displayName = Component.displayName || Component.name || 'MrpakExternalComponentAdapter';
                return WrappedComponent;
            };
            window.__normalizeExternalModule__ = (importPath, moduleNs) => {
                if (!String(importPath || '').startsWith('react-icons/')) {
                    return moduleNs;
                }
                const normalizedEntries = Object.entries(moduleNs || {}).map(([key, value]) => {
                    if (key === 'default') return [key, value];
                    return [key, adaptExternalReactComponent(value)];
                });
                return Object.fromEntries(normalizedEntries);
            };
            ${externalModulesCode || 'return window.__modules__;'}
            return window.__modules__;
        })();
    </script>
    <script type="text/babel" data-type="module" data-presets="mrpak-tsx">
        (async () => {
        // React доступен глобально через CDN
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        
        // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј window.__modules__ ДО загрузки модулей
        window.__modules__ = window.__modules__ || {};
        const __mrpakOriginalConsoleError = console.error;
        console.error = (...args) => {
          const first = args && args.length ? String(args[0] || '') : '';
          if (first.includes('Warning: Encountered two children with the same key')) {
            console.warn(...args);
            return;
          }
          __mrpakOriginalConsoleError(...args);
        };
        await (window.__externalModulesReady__ || Promise.resolve());
        console.log('Before loading modules, window.__modules__ initialized');
        
        // Загружаем модули зависимостей
        ${modulesCode}
        
        // Отладочная информация
        console.log('Available modules:', Object.keys(window.__modules__ || {}));
        Object.keys(window.__modules__ || {}).forEach(path => {
          console.log('Module:', path, window.__modules__[path]);
        });
        
        // Функция для инструментирования DOM элементов с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
        function instrumentReactDOM(rootElement, filePath) {
          if (!rootElement) return;
          
          const safeBasename = (path) => {
            try {
              const norm = String(path || '').replace(/\\\\/g, '/');
              return norm.split('/').pop() || 'unknown';
            } catch {
              return 'unknown';
            }
          };
          
          const makeSelectorForElement = (el) => {
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const tag = cur.tagName.toLowerCase();
              const parent = cur.parentElement;
              if (!parent || parent === rootElement || parent === document.body || parent === document.documentElement) {
                parts.push(tag);
                break;
              }
              const children = Array.from(parent.children);
              const idx = children.indexOf(cur);
              const nth = idx >= 0 ? idx + 1 : 1;
              parts.push(\`\${tag}:nth-child(\${nth})\`);
              cur = parent;
            }
            return parts.reverse().join(' > ');
          };
          
          const makeMrpakId = (filePath, selector, tagName) => {
            const base = safeBasename(filePath);
            return \`mrpak:\${base}:\${tagName || 'el'}:\${selector}\`;
          };
          
          const used = new Set();
          const all = rootElement.querySelectorAll ? Array.from(rootElement.querySelectorAll('*')) : [];
          
          all.forEach((el) => {
            // Пропускаем элементы, которые уже имеют id-атрибут
            const existing = (el.getAttribute && (el.getAttribute('data-no-code-ui-id') || el.getAttribute('data-mrpak-id'))) || null;
            if (existing) {
              used.add(existing);
              return;
            }
            
            // Пропускаем script, style и другие служебные элементы
            const tagName = (el.tagName || '').toLowerCase();
            if (['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
              return;
            }
            
            const selector = makeSelectorForElement(el);
            let id = makeMrpakId(filePath, selector, tagName);
            
            // Убеждаемся, что ID уникален
            if (used.has(id)) {
              let i = 2;
              while (used.has(\`\${id}:\${i}\`)) i += 1;
              id = \`\${id}:\${i}\`;
            }
            used.add(id);
            
            if (el.setAttribute) {
              el.setAttribute('data-no-code-ui-id', id);
            }
          });
        }
        
        try {
            ${processedCode}
            
            // Автоматически находим компонент для рендеринга
            let Component = null;
            ${componentToRender ? 
              `// РСЃРїРѕР»СЊР·СѓРµРј автоматически найденный компонент: ${componentName}
              if (typeof ${componentName} !== 'undefined') {
                Component = ${componentName};
              }` : 
              `// Пробуем стандартные имена как fallback
              if (typeof App !== 'undefined') {
                Component = App;
              } else if (typeof MyComponent !== 'undefined') {
                Component = MyComponent;
              } else if (typeof Component !== 'undefined') {
                Component = Component;
              } else {
                // Пробуем найти любой компонент с заглавной буквы
                const allVars = Object.keys(typeof window !== 'undefined' ? window : {});
                for (const varName of allVars) {
                  if (varName[0] === varName[0].toUpperCase() && 
                      typeof window[varName] === 'function' &&
                      varName !== 'React' && varName !== 'ReactDOM') {
                    Component = window[varName];
                    break;
                  }
                }
              }`
            }
            
            if (Component) {
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                
                // После рендеринга React инструментируем DOM и блокируем интерактивные элементы
                setTimeout(() => {
                  const rootElement = document.getElementById('root');
                  const filePath = window.__MRPAK_FILE_PATH__ || '';
                  
                  // РРЅСЃС‚СЂСѓРјРµРЅС‚РёСЂСѓРµРј DOM элементы с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
                  instrumentReactDOM(rootElement, filePath);
                  
                  // Обновляем дерево слоев после инструментирования
                  if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                    window.__MRPAK_BUILD_TREE__();
                  }
                  
                  // РСЃРїРѕР»СЊР·СѓРµРј MutationObserver для отслеживания новых элементов
                  const observer = new MutationObserver((mutations) => {
                    // РРЅСЃС‚СЂСѓРјРµРЅС‚РёСЂСѓРµРј новые элементы
                    const rootElement = document.getElementById('root');
                    if (rootElement) {
                      instrumentReactDOM(rootElement, filePath);
                      // Обновляем дерево слоев после инструментирования
                      if (typeof buildTree === 'function') {
                        buildTree();
                      }
                    }
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                }, 100);
            } else {
                const foundComponents = ${JSON.stringify(detectedComponents.map(c => c.name))};
                const errorMsg = foundComponents.length > 0 
                  ? 'Found components: ' + foundComponents.join(', ') + '. Failed to use them for rendering.'
                  : 'No component found for rendering. Make sure the file exports a React component.';
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error"><strong>Runtime error:</strong><br>' + error.message + '</div>';
            console.error('React execution error:', error);
        }
        })().catch((error) => {
            console.error('React bootstrap error:', error);
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML = '<div class="error"><strong>Runtime error:</strong><br>' + (error && error.message ? error.message : String(error)) + '</div>';
            }
        });
    </script>
</body>
</html>
    `;

    console.log('рџ”µ createReactHTML: финальный результат', {
      blockMapForEditorKeys: Object.keys(instProcessed.map).length,
      blockMapForFileKeys: Object.keys(instOriginal.map).length,
      blockMapForFileSample: Object.keys(instOriginal.map).slice(0, 5),
      blockMapForEditorSample: Object.keys(instProcessed.map).slice(0, 5)
    });

    return {
      html,
      dependencyPaths,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
    };
  };

  // Создаем HTML обертку для React Native файлов
  const createReactNativeHTML = async (code: string, basePath: string) => {
    // ВАЖНО: сначала инструментируем РРЎРҐРћР”РќР«Р™ код, чтобы data-no-code-ui-id были стабильны относительно файла.
    const instOriginal = instrumentJsx(code, basePath);

    // Сначала обрабатываем код (загружаем зависимости, заменяем импорты)
    const processed = await processReactCode(instOriginal.code, basePath);
    const processedCodeBeforeInst = processed.code; // уже содержит data-no-code-ui-id (или legacy data-mrpak-id)
    const modulesCode = processed.modulesCode || '';
    const dependencyPaths = processed.dependencyPaths || [];
    const defaultExportInfo = processed.defaultExportInfo || null;

    // Собираем карту для превью/редактора на обработанном коде (атрибуты уже есть).
    const instProcessed = instrumentJsx(processedCodeBeforeInst, basePath);
    const processedCode = instProcessed.code;

    // Детектируем компоненты в обработанном коде
    const detectedComponents = detectComponents(processedCode);

    // Если есть информация о default export, добавляем её с наивысшим приоритетом
    if (defaultExportInfo && !detectedComponents.find(c => c.name === defaultExportInfo.name && c.type === 'default-export')) {
      detectedComponents.unshift({
        name: defaultExportInfo.name,
        type: 'default-export',
        priority: 0
      });
    }

    // Находим компонент для рендеринга по приоритету
    let componentToRender: string | null = null;
    let componentName = null;

    // Приоритет: default export > named exports > остальные компоненты
    for (const comp of detectedComponents) {
      // Проверяем, что компонент действительно существует в коде
      const componentExists = new RegExp(`(?:const|let|var|function)\\s+${comp.name}\\s*[=(]`).test(processedCode) ||
                               new RegExp(`\\b${comp.name}\\s*=`).test(processedCode);
      if (componentExists) {
        componentToRender = comp.name;
        componentName = comp.name;
        break;
      }
    }

    // Fallback: пробуем стандартные имена
    if (!componentToRender) {
      const standardNames = ['App', 'MyComponent', 'Component'];
      for (const name of standardNames) {
        if (new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode)) {
          componentToRender = name;
          componentName = name;
          break;
        }
      }
    }

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Native Web Component Preview</title>
    <script>
        // Передаем filePath в глобальную переменную для использования в скрипте
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(basePath)};
        window.addEventListener('unhandledrejection', (event) => {
          const reason = event && event.reason;
          const message = String((reason && (reason.message || reason)) || '').toLowerCase();
          if (message.includes('canceled') || message.includes('cancelled') || message.includes('aborterror')) {
            event.preventDefault();
          }
        });
    </script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script>
      // Функция для нормализации стилей React Native в CSS стили
      function normalizeStyle(style) {
        if (!style) return {};
        if (Array.isArray(style)) {
          // Если массив стилей, объединяем их, пропуская null/undefined
          const validStyles = style.filter(s => s != null && typeof s === 'object');
          if (validStyles.length === 0) return {};
          // Рекурсивно нормализуем и объединяем
          const merged = {};
          validStyles.forEach(s => {
            const normalized = normalizeStyle(s);
            Object.assign(merged, normalized);
          });
          return merged;
        }
        if (typeof style !== 'object' || style === null) return {};
        
        // Создаем новый объект для безопасной работы
        const result = {};
        for (const key in style) {
          if (style.hasOwnProperty(key)) {
            const value = style[key];
            // Пропускаем null, undefined, функции и объекты (кроме Date)
            if (value === null || value === undefined) continue;
            if (typeof value === 'function') continue;
            if (typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
              // Пропускаем объекты типа shadowOffset, transform и т.д.
              // Они не поддерживаются напрямую в CSS
              continue;
            }
            
            // Список свойств, которые требуют 'px' для числовых значений
            const pixelProperties = [
              'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
              'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
              'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
              'top', 'right', 'bottom', 'left',
              'fontSize', 'lineHeight', 'letterSpacing',
              'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
              'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 
              'borderBottomLeftRadius', 'borderBottomRightRadius',
              'outlineWidth', 'gap', 'rowGap', 'columnGap'
            ];
            
            // Обрабатываем значения - ВАЖНО: только примитивы
            let cssValue;
            if (typeof value === 'number') {
              // Для числовых значений добавляем 'px' для размеров
              if (pixelProperties.includes(key)) {
                cssValue = value + 'px';
              } else if (key === 'opacity' || key === 'zIndex' || key === 'flex' || 
                         key === 'flexGrow' || key === 'flexShrink' || key === 'order' ||
                         key === 'fontWeight') {
                // Эти свойства остаются числами
                cssValue = value;
              } else {
                // По умолчанию для других числовых значений тоже добавляем px
                cssValue = value + 'px';
              }
            } else if (typeof value === 'string') {
              cssValue = value;
            } else if (Array.isArray(value)) {
              // Массивы преобразуем в строки, но только если элементы примитивы
              cssValue = value.map(v => String(v)).join(' ');
            } else if (value instanceof Date) {
              cssValue = value.toISOString();
            } else {
              // Пропускаем все остальное
              continue;
            }
            
            // Проверяем, что значение действительно примитив
            if (typeof cssValue !== 'string' && typeof cssValue !== 'number' && typeof cssValue !== 'boolean') {
              continue;
            }
            
            // ВАЖНО: React требует camelCase для inline стилей, НЕ kebab-case!
            // kebab-case используется только в CSS файлах, но не в inline стилях через объекты
            // Поэтому оставляем ключ как есть (camelCase)
            const cssKey = key; // НЕ конвертируем в kebab-case!
            
            // Убеждаемся, что мы устанавливаем только строку или число
            // Но оставляем числа как числа (для opacity, zIndex и т.д.)
            if (typeof cssValue === 'number' && (key === 'opacity' || key === 'zIndex' || key === 'flex' || 
                key === 'flexGrow' || key === 'flexShrink' || key === 'order' || key === 'fontWeight')) {
              result[cssKey] = cssValue;
            } else {
              result[cssKey] = String(cssValue);
            }
          }
        }
        return result;
      }
      
      // React Native Web компоненты через полифилл
      // Создаем базовые компоненты, совместимые с React
      window.ReactNative = {
        View: React.forwardRef((props, ref) => {
          const { style, ...otherProps } = props;
          const baseStyle = { display: 'flex', flexDirection: 'column' };
          // ВАЖНО: normalizeStyle всегда вызывается, даже если style undefined
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка: убеждаемся, что computedStyle не содержит массивов или объектов
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            ...otherProps
          }, props.children);
        }),
        Text: React.forwardRef((props, ref) => {
          const { style, ...otherProps } = props;
          const baseStyle = { display: 'inline' };
          // ВАЖНО: normalizeStyle всегда вызывается, даже если style undefined
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка: убеждаемся, что computedStyle не содержит массивов или объектов
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          return React.createElement('span', {
            ref,
            style: safeStyle,
            ...otherProps
          }, props.children);
        }),
        ScrollView: React.forwardRef((props, ref) => {
          const { style, contentContainerStyle, ...otherProps } = props;
          const baseStyle = {
            overflow: 'auto',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          };
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка для безопасности
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          const safeContentStyle = contentContainerStyle ? normalizeStyle(contentContainerStyle) : null;
          const safeContentStyleObj = {};
          if (safeContentStyle) {
            for (const key in safeContentStyle) {
              const value = safeContentStyle[key];
              if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
                safeContentStyleObj[key] = value;
              }
            }
          }
          
          const children = contentContainerStyle 
            ? React.createElement('div', { style: safeContentStyleObj }, props.children)
            : props.children;
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            ...otherProps
          }, children);
        }),
        TouchableOpacity: React.forwardRef((props, ref) => {
          const { style, onPress, ...otherProps } = props;
          const baseStyle = {
            cursor: 'pointer',
            transition: 'opacity 0.2s',
            display: 'inline-block'
          };
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка для безопасности
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          const handleClick = (e) => {
            if (onPress) {
              onPress(e);
            }
          };
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            onClick: handleClick,
            ...otherProps
          }, props.children);
        }),
        ActivityIndicator: ({ size = 'small', color = '#667eea' }) => {
          const sizeValue = size === 'large' ? '36px' : '20px';
          return React.createElement('div', {
            style: {
              display: 'inline-block',
              width: sizeValue,
              height: sizeValue,
              border: '3px solid rgba(0,0,0,0.1)',
              borderTopColor: color,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }
          });
        },
        StyleSheet: {
          create: (styles) => {
            // Возвращаем стили как есть, но с нормализацией при использовании
            const result = {};
            for (const key in styles) {
              if (styles.hasOwnProperty(key)) {
                result[key] = styles[key];
              }
            }
            return result;
          },
          flatten: (style) => {
            if (Array.isArray(style)) {
              return Object.assign({}, ...style);
            }
            return style || {};
          }
        }
      };
      
      // Добавляем анимацию для ActivityIndicator
      const styleEl = document.createElement('style');
      styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(styleEl);
    </script>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }
        #root {
            width: 100%;
            min-height: 100vh;
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px;
        }
        .info {
            color: #666;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>React Native Web Component Preview</strong><br>
        Loading component from selected file...
    </div>
    <div id="root"></div>
    <script type="text/babel" data-type="module" data-presets="mrpak-tsx">
        // React и React Native Web доступны глобально через CDN
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        const ReactNative = window.ReactNative || {};
        const { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } = ReactNative;
        
        // Деструктурируем для использования в коде
        const RN = ReactNative;
        
        // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј window.__modules__ ДО загрузки модулей
        window.__modules__ = window.__modules__ || {};
        const __mrpakOriginalConsoleError = console.error;
        console.error = (...args) => {
          const first = args && args.length ? String(args[0] || '') : '';
          if (first.includes('Warning: Encountered two children with the same key')) {
            console.warn(...args);
            return;
          }
          __mrpakOriginalConsoleError(...args);
        };
        console.log('Before loading modules, window.__modules__ initialized');
        
        // Загружаем модули зависимостей
        ${modulesCode}
        
        // Отладочная информация - проверяем, что модули загружены
        console.log('After loading modules, available modules:', Object.keys(window.__modules__ || {}));
        Object.keys(window.__modules__ || {}).forEach(path => {
          const module = window.__modules__[path];
          console.log('Module:', path, 'exports:', Object.keys(module || {}));
          if (path.includes('commonStyles')) {
            console.log('commonStyles module details:', module);
            console.log('  - colors:', module?.colors);
            console.log('  - commonStyles:', module?.commonStyles);
          }
        });
        
        // Функция для инструментирования DOM элементов с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
        function instrumentReactDOM(rootElement, filePath) {
          if (!rootElement) return;
          
          const safeBasename = (path) => {
            try {
              const norm = String(path || '').replace(/\\\\/g, '/');
              return norm.split('/').pop() || 'unknown';
            } catch {
              return 'unknown';
            }
          };
          
          const makeSelectorForElement = (el) => {
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const tag = cur.tagName.toLowerCase();
              const parent = cur.parentElement;
              if (!parent || parent === rootElement || parent === document.body || parent === document.documentElement) {
                parts.push(tag);
                break;
              }
              const children = Array.from(parent.children);
              const idx = children.indexOf(cur);
              const nth = idx >= 0 ? idx + 1 : 1;
              parts.push(\`\${tag}:nth-child(\${nth})\`);
              cur = parent;
            }
            return parts.reverse().join(' > ');
          };
          
          const makeMrpakId = (filePath, selector, tagName) => {
            const base = safeBasename(filePath);
            return \`mrpak:\${base}:\${tagName || 'el'}:\${selector}\`;
          };
          
          const used = new Set();
          const all = rootElement.querySelectorAll ? Array.from(rootElement.querySelectorAll('*')) : [];
          
          all.forEach((el) => {
            // Пропускаем элементы, которые уже имеют id-атрибут
            const existing = (el.getAttribute && (el.getAttribute('data-no-code-ui-id') || el.getAttribute('data-mrpak-id'))) || null;
            if (existing) {
              used.add(existing);
              return;
            }
            
            // Пропускаем script, style и другие служебные элементы
            const tagName = (el.tagName || '').toLowerCase();
            if (['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
              return;
            }
            
            const selector = makeSelectorForElement(el);
            let id = makeMrpakId(filePath, selector, tagName);
            
            // Убеждаемся, что ID уникален
            if (used.has(id)) {
              let i = 2;
              while (used.has(\`\${id}:\${i}\`)) i += 1;
              id = \`\${id}:\${i}\`;
            }
            used.add(id);
            
            if (el.setAttribute) {
              el.setAttribute('data-no-code-ui-id', id);
            }
          });
        }
        
        // Перехватываем createElement для обработки массивов стилей в обычных HTML элементах
        const originalCreateElement = React.createElement;
        React.createElement = function(type, props, ...children) {
          // Если это строковый тип (HTML элемент) и есть style prop
          if (typeof type === 'string' && props && props.style) {
            // Обрабатываем массив стилей, если он есть
            if (Array.isArray(props.style)) {
              props = { ...props, style: normalizeStyle(props.style) };
            } else if (props.style && typeof props.style === 'object') {
              // Нормализуем даже одиночные объекты стилей
              props = { ...props, style: normalizeStyle(props.style) };
            }
          }
          return originalCreateElement.call(this, type, props, ...children);
        };
        
        try {
            // #region agent log
            {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:main-code',message:'About to execute processed code',data:{modulesAvailable:Object.keys(window.__modules__||{}).length,codeLength:${processedCode.length}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            ${processedCode}
            
            // Автоматически находим компонент для рендеринга
            let Component = null;
            ${componentToRender ? 
              `// РСЃРїРѕР»СЊР·СѓРµРј автоматически найденный компонент: ${componentName}
              if (typeof ${componentName} !== 'undefined') {
                Component = ${componentName};
              }` : 
              `// Пробуем стандартные имена как fallback
              if (typeof App !== 'undefined') {
                Component = App;
              } else if (typeof MyComponent !== 'undefined') {
                Component = MyComponent;
              } else if (typeof Component !== 'undefined') {
                Component = Component;
              } else {
                // Пробуем найти любой компонент с заглавной буквы
                const allVars = Object.keys(typeof window !== 'undefined' ? window : {});
                for (const varName of allVars) {
                  if (varName[0] === varName[0].toUpperCase() && 
                      typeof window[varName] === 'function' &&
                      varName !== 'React' && varName !== 'ReactDOM') {
                    Component = window[varName];
                    break;
                  }
                }
              }`
            }
            
            if (Component) {
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                
                // После рендеринга React инструментируем DOM и блокируем интерактивные элементы
                setTimeout(() => {
                  const rootElement = document.getElementById('root');
                  const filePath = window.__MRPAK_FILE_PATH__ || '';
                  
                  // РРЅСЃС‚СЂСѓРјРµРЅС‚РёСЂСѓРµРј DOM элементы с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
                  instrumentReactDOM(rootElement, filePath);
                  
                  // Обновляем дерево слоев после инструментирования
                  if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                    window.__MRPAK_BUILD_TREE__();
                  }
                  
                  // РСЃРїРѕР»СЊР·СѓРµРј MutationObserver для отслеживания новых элементов
                  const observer = new MutationObserver((mutations) => {
                    // РРЅСЃС‚СЂСѓРјРµРЅС‚РёСЂСѓРµРј новые элементы
                    const rootElement = document.getElementById('root');
                    if (rootElement) {
                      instrumentReactDOM(rootElement, filePath);
                      // Обновляем дерево слоев после инструментирования
                      if (typeof buildTree === 'function') {
                        buildTree();
                      }
                    }
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                }, 100);
            } else {
                const foundComponents = ${JSON.stringify(detectedComponents.map(c => c.name))};
                const errorMsg = foundComponents.length > 0 
                  ? 'Found components: ' + foundComponents.join(', ') + '. Failed to use them for rendering.'
                  : 'No component found for rendering. Make sure the file exports a React component.';
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error"><strong>Runtime error:</strong><br>' + error.message + '<br><br><pre>' + error.stack + '</pre></div>';
            console.error('React Native execution error:', error);
        }
    </script>
</body>
</html>
    `;

    return {
      html,
      dependencyPaths,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
    };
  };

  const activeBlockEditorType: 'html' | 'react' | 'react-native' = fileType === 'react' || fileType === 'react-native' ? fileType : 'html';

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
        if (!stageInsertBlockRef.current) {
          setError('Insert handler is not ready yet.');
          return;
        }

        if (dependencyPackageName) {
          await handleAddProjectDependency(dependencyPackageName, 'latest');
        }

        await stageInsertBlockRef.current({
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
        updateHasStagedChanges(true);
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
    [fileContent, handleAddProjectDependency, selectedBlock?.id, updateMonacoEditorWithScroll, updateStagedComponentImports, updateHasStagedChanges]
  );

  const blockEditorSidebarProps = useBlockEditorSidebarController({
    fileType: activeBlockEditorType,
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
                        canvasDevice === 'mobile' && styles.previewViewportFrameMobile,
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
    canvasDevice,
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

    // Рендеринг HTML файлов
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
    console.log('RenderFile: Rendering HTML file, content length:', htmlToRender.length);
    console.log('RenderFile: HTML content preview:', htmlToRender.substring(0, 100));

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
                  canvasDevice === 'mobile' && styles.previewViewportFrameMobile,
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
  // Рендеринг React файлов (JSX/TSX)
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
                  canvasDevice === 'mobile' && styles.previewViewportFrameMobile,
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
  // Рендеринг React Native файлов
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
                  canvasDevice === 'mobile' && styles.previewViewportFrameMobile,
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
  // Рендеринг текстовых файлов (JS, TS, CSS, JSON, Markdown и др.)
  console.log('RenderFile: Rendering text file, type:', fileType, 'content length:', fileContent?.length);
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

export default RenderFile;




