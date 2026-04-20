import { useEffect } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import { AstBidirectionalManager } from '../../../blockEditor/AstBidirectional';
import { getFileType } from '../../../shared/lib/file-type-detector';
import { onFileChanged, readFile, unwatchFile, watchFile } from '../../../shared/api/electron-api';

type UseFileWatchSyncParams = {
  filePath: string;
  fileType: string | null;
  viewMode: 'preview' | 'split' | 'changes';
  projectRoot: string | null;
  selectedBlock: { id: string; meta?: any } | null;
  astManagerRef: React.MutableRefObject<AstBidirectionalManager | null>;
  isUpdatingFromConstructorRef: React.MutableRefObject<boolean>;
  isUpdatingFromFileRef: React.MutableRefObject<boolean>;
  sendIframeCommand: (cmd: any) => void;
  loadFile: (targetFilePath: string) => Promise<void> | void;
  updateMonacoEditorWithScroll: (newContent: any) => void;
  onViewModeChange: (mode: 'preview' | 'split' | 'changes') => void;
  clearHistory: () => void;
  updateStagedPatches: (updater: any) => void;
  updateStagedOps: (updater: any) => void;
  updateStagedComponentImports: (updater: any) => void;
  updateHasStagedChanges: (value: boolean) => void;
  setFileContent: React.Dispatch<React.SetStateAction<string | null>>;
  setFileType: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setReactHTML: React.Dispatch<React.SetStateAction<string>>;
  setReactNativeHTML: React.Dispatch<React.SetStateAction<string>>;
  setIsProcessingReact: React.Dispatch<React.SetStateAction<boolean>>;
  setIsProcessingReactNative: React.Dispatch<React.SetStateAction<boolean>>;
  setUnsavedContent: React.Dispatch<React.SetStateAction<string | null>>;
  setIsModified: React.Dispatch<React.SetStateAction<boolean>>;
  setBlockMap: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setBlockMapForFile: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setSelectedBlock: React.Dispatch<React.SetStateAction<{ id: string; meta?: any } | null>>;
  setChangesLog: React.Dispatch<React.SetStateAction<Array<{ ts: number; filePath: string; blockId: any; patch: any }>>>;
  setEditorHTML: React.Dispatch<React.SetStateAction<string>>;
  setLayersTree: React.Dispatch<React.SetStateAction<any>>;
  setLayerNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setProjectRoot: React.Dispatch<React.SetStateAction<string | null>>;
  setIframeCommand: React.Dispatch<React.SetStateAction<any>>;
  setExternalDropTargetState: React.Dispatch<React.SetStateAction<any>>;
  setRenderVersion: React.Dispatch<React.SetStateAction<number>>;
};

export function useFileWatchSync({
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
}: UseFileWatchSyncParams) {
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
    updateHasStagedChanges(false);
    updateStagedOps([]);
    setLayersTree(null);
    setLayerNames({});
    setProjectRoot(null);
    setIframeCommand(null);
    setExternalDropTargetState(null);
    setUnsavedContent(null);
    setIsModified(false);
    setRenderVersion((v) => v + 1);
    clearHistory();
    loadFile(filePath);

    watchFile(filePath).then(() => {});

    const handleFileChanged = async (changedFilePath: string) => {
      if (changedFilePath !== currentFilePath) return;
      const savedSelectedBlock = selectedBlock;

      if ((fileType === 'react' || fileType === 'react-native') && viewMode === 'split') {
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
                if (savedSelectedBlock) {
                  setTimeout(() => {
                    setSelectedBlock(savedSelectedBlock);
                    sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
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
                  if (savedSelectedBlock) {
                    setTimeout(() => {
                      setSelectedBlock(savedSelectedBlock);
                      sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
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
        if (savedSelectedBlock) {
          setTimeout(() => {
            setSelectedBlock(savedSelectedBlock);
            sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
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
    fileType,
    isUpdatingFromConstructorRef,
    isUpdatingFromFileRef,
    loadFile,
    onViewModeChange,
    projectRoot,
    selectedBlock,
    sendIframeCommand,
    setBlockMap,
    setBlockMapForFile,
    setChangesLog,
    setEditorHTML,
    setError,
    setExternalDropTargetState,
    setFileContent,
    setFileType,
    setIframeCommand,
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
    updateHasStagedChanges,
    updateMonacoEditorWithScroll,
    updateStagedComponentImports,
    updateStagedOps,
    updateStagedPatches,
    viewMode,
  ]);
}

