import { useEffect, useRef } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import { AstBidirectionalManager } from '../../../blockEditor/AstBidirectional';
import { getFileType } from '../../../shared/lib/file-type-detector';
import { onFileChanged, readFile, unwatchFile, watchFile } from '../../../shared/api/electron-api';
import type { BlockMap, LayersTree, StagedComponentImport, StagedOp, StylePatch } from '../types';

type SelectedBlock = { id: string; meta?: unknown } | null;
type ChangesLogEntry = { ts: number; filePath: string; blockId: string; patch: StylePatch | { op: string } };

type UseFileWatchSyncParams = {
  filePath: string;
  fileType: string | null;
  viewMode: 'preview' | 'split' | 'changes';
  projectRoot: string | null;
  selectedBlock: SelectedBlock;
  astManagerRef: React.MutableRefObject<AstBidirectionalManager | null>;
  isUpdatingFromConstructorRef: React.MutableRefObject<boolean>;
  isUpdatingFromFileRef: React.MutableRefObject<boolean>;
  sendIframeCommand: (cmd: Record<string, unknown>) => void;
  loadFile: (targetFilePath: string) => Promise<void> | void;
  updateMonacoEditorWithScroll: (newContent: string) => void;
  onViewModeChange: (mode: 'preview' | 'split' | 'changes') => void;
  clearHistory: () => void;
  updateStagedPatches: (updater: ((prev: Record<string, StylePatch>) => Record<string, StylePatch>) | Record<string, StylePatch>) => void;
  updateStagedOps: (updater: ((prev: StagedOp[]) => StagedOp[]) | StagedOp[]) => void;
  updateStagedComponentImports: (updater: ((prev: StagedComponentImport[]) => StagedComponentImport[]) | StagedComponentImport[]) => void;
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
  setBlockMap: React.Dispatch<React.SetStateAction<BlockMap>>;
  setBlockMapForFile: React.Dispatch<React.SetStateAction<BlockMap>>;
  setSelectedBlock: React.Dispatch<React.SetStateAction<SelectedBlock>>;
  setChangesLog: React.Dispatch<React.SetStateAction<ChangesLogEntry[]>>;
  setEditorHTML: React.Dispatch<React.SetStateAction<string>>;
  setLayersTree: React.Dispatch<React.SetStateAction<LayersTree | null>>;
  setLayerNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setProjectRoot: React.Dispatch<React.SetStateAction<string | null>>;
  setIframeCommand: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>;
  setExternalDropTargetState: React.Dispatch<React.SetStateAction<{
    source: string;
    sourceId: string | null;
    targetId: string | null;
  } | null>>;
  setRenderVersion: React.Dispatch<React.SetStateAction<number>>;
};

type FileWatchHandlerContext = {
  viewMode: 'preview' | 'split' | 'changes';
  fileType: string | null;
  selectedBlock: SelectedBlock;
  projectRoot: string | null;
  sendIframeCommand: (cmd: Record<string, unknown>) => void;
  updateMonacoEditorWithScroll: (newContent: string) => void;
  loadFile: (targetFilePath: string) => Promise<void> | void;
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
  const handlerContextRef = useRef<FileWatchHandlerContext>({
    viewMode,
    fileType,
    selectedBlock,
    projectRoot,
    sendIframeCommand,
    updateMonacoEditorWithScroll,
    loadFile,
  });

  handlerContextRef.current = {
    viewMode,
    fileType,
    selectedBlock,
    projectRoot,
    sendIframeCommand,
    updateMonacoEditorWithScroll,
    loadFile,
  };

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
      const ctx = handlerContextRef.current;
      const savedSelectedBlock = ctx.selectedBlock;

      if ((ctx.fileType === 'react' || ctx.fileType === 'react-native') && ctx.viewMode === 'split') {
        try {
          const readResult = await readFile(changedFilePath);
          if (readResult?.success && readResult.content) {
            const newCode = readResult.content;
            const manager = astManagerRef.current;

            if (!manager) {
              const newManager = new AstBidirectionalManager(changedFilePath, ctx.projectRoot);
              const initResult = await newManager.initializeFromCode(newCode);
              if (initResult.ok) {
                astManagerRef.current = newManager;
                setFileContent(newCode);
                if (savedSelectedBlock) {
                  setTimeout(() => {
                    setSelectedBlock(savedSelectedBlock);
                    ctx.sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
                  }, 100);
                }
                return;
              }
            } else {
              if (isUpdatingFromConstructorRef.current) {
                const updateResult = await manager.updateCodeASTFromCode(newCode, true);
                if (updateResult.ok) {
                  setFileContent(newCode);
                  ctx.updateMonacoEditorWithScroll(newCode);
                }
                return;
              }

              isUpdatingFromFileRef.current = true;
              try {
                const updateResult = await manager.updateCodeASTFromCode(newCode, false);
                if (updateResult.ok) {
                  setFileContent(newCode);
                  ctx.updateMonacoEditorWithScroll(newCode);
                  if (savedSelectedBlock) {
                    setTimeout(() => {
                      setSelectedBlock(savedSelectedBlock);
                      ctx.sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
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
        ctx.loadFile(changedFilePath);
        if (savedSelectedBlock) {
          setTimeout(() => {
            setSelectedBlock(savedSelectedBlock);
            ctx.sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
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
  ]);
}
