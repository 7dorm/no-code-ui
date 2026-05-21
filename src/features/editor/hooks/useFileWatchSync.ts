import { useEffect } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import { AstBidirectionalManager } from '../../../blockEditor/AstBidirectional';
import { getFileType } from '../../../shared/lib/file-type-detector';
import { onFileChanged, readFile, unwatchFile, watchFile } from '../../../shared/api/electron-api';
import { useEditorStore } from '../../../store/editorStore';

type UseFileWatchSyncParams = {
  filePath: string;
  astManagerRef: React.MutableRefObject<AstBidirectionalManager | null>;
  isUpdatingFromConstructorRef: React.MutableRefObject<boolean>;
  isUpdatingFromFileRef: React.MutableRefObject<boolean>;
  loadFile: (targetFilePath: string) => Promise<void> | void;
  updateMonacoEditorWithScroll: (newContent: any) => void;
  onViewModeChange: (mode: 'preview' | 'split' | 'changes') => void;
  clearHistory: () => void;
  setError: (error: string | null) => void;
  setReactHTML: React.Dispatch<React.SetStateAction<string>>;
  setReactNativeHTML: React.Dispatch<React.SetStateAction<string>>;
  setIsProcessingReact: React.Dispatch<React.SetStateAction<boolean>>;
  setIsProcessingReactNative: React.Dispatch<React.SetStateAction<boolean>>;
  setUnsavedContent: (content: string | null) => void;
  setRenderVersion: React.Dispatch<React.SetStateAction<number>>;
};

export function useFileWatchSync({
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
}: UseFileWatchSyncParams) {
  const {
    fileType,
    setFileType,
    viewMode,
    projectRoot,
    selectedBlock,
    setSelectedBlock,
    sendIframeCommand,
    setFileContent,
    setIsModified,
    setBlockMap,
    setBlockMapForFile,
    setChangesLog,
    setEditorHTML,
    updateStagedPatches,
    updateStagedComponentImports,
    setHasStagedChanges,
    updateStagedOps,
    setLayersTree,
    setLayerNames,
    setProjectRoot,
    setExternalDropTargetState,
  } = useEditorStore();

  useEffect(() => {
    let currentFilePath = filePath;

    if (!filePath) {
      setFileContent(null);
      setFileType(null);
      setError(null);
      setReactHTML('');
      setReactNativeHTML('');
      setIsProcessingReact(false);
      setIsProcessingReactNative(false);
      setUnsavedContent(null);
      setIsModified(false);
      return;
    }

    const initialType = getFileType(filePath);
    setFileType(initialType);
    onViewModeChange('preview');
    setBlockMap({});
    setBlockMapForFile({});
    setSelectedBlock(null);
    setChangesLog([]);
    setEditorHTML('');
    updateStagedPatches({});
    updateStagedComponentImports([]);
    setHasStagedChanges(false);
    updateStagedOps([]);
    setLayersTree(null);
    setLayerNames({});
    setProjectRoot(null);
    // Send iframe command null sets it to null
    useEditorStore.setState({ iframeCommand: null });
    setExternalDropTargetState(null);
    setUnsavedContent(null);
    setIsModified(false);
    setRenderVersion((v) => v + 1);
    clearHistory();
    loadFile(filePath);

    watchFile(filePath).then(() => {});

    const handleFileChanged = async (changedFilePath: string) => {
      if (changedFilePath !== currentFilePath) return;
      const state = useEditorStore.getState();
      const currentSelectedBlock = state.selectedBlock;
      const currentFileType = state.fileType;
      const currentViewMode = state.viewMode;

      if ((currentFileType === 'react' || currentFileType === 'react-native') && currentViewMode === 'split') {
        try {
          const readResult = await readFile(changedFilePath);
          if (readResult?.success && readResult.content) {
            const newCode = readResult.content;
            const manager = astManagerRef.current;

            if (!manager) {
              const newManager = new AstBidirectionalManager(changedFilePath, projectRoot);
              const initResult = await newManager.initializeFromCode(newCode);
              if (initResult.ok) {
                astManagerRef.current = newManager;
                setFileContent(newCode);
                if (currentSelectedBlock) {
                  setTimeout(() => {
                    setSelectedBlock(currentSelectedBlock);
                    sendIframeCommand({ type: MRPAK_CMD.SELECT, id: currentSelectedBlock.id });
                  }, 100);
                }
                return;
              }
            } else {
              if (isUpdatingFromConstructorRef.current) {
                const updateResult = await manager.updateCodeASTFromCode(newCode, true);
                if (updateResult.ok) {
                  setFileContent(newCode);
                  updateMonacoEditorWithScroll(newCode);
                }
                return;
              }

              isUpdatingFromFileRef.current = true;
              try {
                const updateResult = await manager.updateCodeASTFromCode(newCode, false);
                if (updateResult.ok) {
                  setFileContent(newCode);
                  updateMonacoEditorWithScroll(newCode);
                  if (currentSelectedBlock) {
                    setTimeout(() => {
                      setSelectedBlock(currentSelectedBlock);
                      sendIframeCommand({ type: MRPAK_CMD.SELECT, id: currentSelectedBlock.id });
                    }, 100);
                  }
                  return;
                }
              } finally {
                setTimeout(() => {
                  isUpdatingFromFileRef.current = false;
                }, 100);
              }
            }
          }
        } catch {}
      }

      setTimeout(() => {
        loadFile(changedFilePath);
        if (currentSelectedBlock) {
          setTimeout(() => {
            setSelectedBlock(currentSelectedBlock);
            sendIframeCommand({ type: MRPAK_CMD.SELECT, id: currentSelectedBlock.id });
          }, 200);
        }
      }, 100);
    };

    const unsubscribe: () => void = onFileChanged(handleFileChanged) as unknown as () => void;

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') unsubscribe();
      if (currentFilePath) unwatchFile(currentFilePath);
    };
  }, [
    astManagerRef,
    clearHistory,
    filePath,
    isUpdatingFromConstructorRef,
    isUpdatingFromFileRef,
    loadFile,
    onViewModeChange,
    projectRoot,
    sendIframeCommand,
    setBlockMap,
    setBlockMapForFile,
    setChangesLog,
    setEditorHTML,
    setError,
    setExternalDropTargetState,
    setFileContent,
    setFileType,
    setIsModified,
    setIsProcessingReact,
    setIsProcessingReactNative,
    setLayerNames,
    setLayersTree,
    setProjectRoot,
    setReactHTML,
    setReactNativeHTML,
    setRenderVersion,
    setSelectedBlock,
    setUnsavedContent,
    setHasStagedChanges,
    updateMonacoEditorWithScroll,
    updateStagedComponentImports,
    updateStagedOps,
    updateStagedPatches,
  ]);
}
