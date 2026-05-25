import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import BlockEditorPanel from '../../../BlockEditorPanel';
import { BlockEditorSidebar } from '../../../shared/ui/BlockEditorSidebar';
import { MonacoEditorWrapper } from '../../../shared/ui/monaco-editor-wrapper';
import { getMonacoLanguage } from '../../../shared/lib/file-type-detector';
import { styles } from '../styles';

type RenderFileSplitModeProps = {
  editorType: 'html' | 'react' | 'react-native';
  html: string;
  blockEditorSidebarProps: Record<string, unknown>;
  splitSidebarStyles: Record<string, unknown>;
  showSplitSidebar: boolean;
  showSplitPreview: boolean;
  showSplitCode: boolean;
  splitSidebarWidth: number;
  splitLeftWidth: number;
  isResizing: boolean;
  resizeTarget: 'main' | 'sidebar' | null;
  setSplitContainerNode: (node: unknown) => void;
  setSplitMainPanelsNode: (node: unknown) => void;
  handleSplitResizeStart: (target: 'main' | 'sidebar') => (event: unknown) => void;
  handleSplitResize: (event: unknown) => void;
  handleSplitResizeEnd: () => void;
  previewViewportFrameStyle: { width: number; height: number };
  canvasDevice: 'desktop' | 'mobile';
  onEditorMessage: (message: unknown) => void;
  iframeCommand: unknown;
  previewFallbackOverlay: React.ReactNode;
  externalComponentDrag: unknown;
  externalFileDrag: unknown;
  externalDropTargetState: { source: string; sourceId: string | null; targetId: string | null } | null;
  layersTree: { nodes?: Record<string, { componentName?: string; tagName?: string }> } | null;
  hasStagedChanges: boolean;
  isModified: boolean;
  onQuickSave: () => void;
  unsavedContent: string | null;
  fileContent: string | null;
  fileType: string | null;
  filePath: string;
  onEditorChange: (content: string) => void;
  onSave: () => void;
  monacoEditorRef: React.MutableRefObject<unknown>;
  onCodeCtrlClick: (payload: unknown) => void;
};

export function RenderFileSplitMode({
  editorType,
  html,
  blockEditorSidebarProps,
  splitSidebarStyles,
  showSplitSidebar,
  showSplitPreview,
  showSplitCode,
  splitSidebarWidth,
  splitLeftWidth,
  isResizing,
  resizeTarget,
  setSplitContainerNode,
  setSplitMainPanelsNode,
  handleSplitResizeStart,
  handleSplitResize,
  handleSplitResizeEnd,
  previewViewportFrameStyle,
  canvasDevice,
  onEditorMessage,
  iframeCommand,
  previewFallbackOverlay,
  externalComponentDrag,
  externalFileDrag,
  externalDropTargetState,
  layersTree,
  hasStagedChanges,
  isModified,
  onQuickSave,
  unsavedContent,
  fileContent,
  fileType,
  filePath,
  onEditorChange,
  onSave,
  monacoEditorRef,
  onCodeCtrlClick,
}: RenderFileSplitModeProps) {
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
                    <BlockEditorPanel
                      fileType={editorType}
                      html={html}
                      onMessage={onEditorMessage}
                      outgoingMessage={iframeCommand}
                    />
                    {previewFallbackOverlay}
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
                      onPress={onQuickSave}
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
                  onChange={onEditorChange}
                  onSave={onSave}
                  editorRef={monacoEditorRef}
                  onCodeCtrlClick={onCodeCtrlClick}
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
}
