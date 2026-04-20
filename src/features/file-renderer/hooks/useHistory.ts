import { useCallback, useRef, useState } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import type {
  HistoryOperation,
  ReparentHistoryOperation,
  SetTextHistoryOperation,
  StagedOp,
  StylePatch,
} from '../types';

type UseHistoryParams = {
  fileType: string | null;
  filePath: string;
  sendIframeCommand: (cmd: any) => void;
  updateStagedPatches: (
    updater: ((prev: Record<string, StylePatch>) => Record<string, StylePatch>) | Record<string, StylePatch>
  ) => void;
  updateStagedOps: (updater: ((prev: StagedOp[]) => StagedOp[]) | StagedOp[]) => void;
  updateHasStagedChanges: (value: boolean) => void;
  stagedPatchesRef: React.MutableRefObject<Record<string, StylePatch>>;
  stagedOpsRef: React.MutableRefObject<StagedOp[]>;
};

export function useHistory({
  fileType,
  filePath,
  sendIframeCommand,
  updateStagedPatches,
  updateStagedOps,
  updateHasStagedChanges,
  stagedPatchesRef,
  stagedOpsRef,
}: UseHistoryParams) {
  const [undoStack, setUndoStack] = useState<HistoryOperation[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryOperation[]>([]);
  const undoHistoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHistoryOperationRef = useRef<HistoryOperation | null>(null);

  const addToHistory = useCallback((operation: HistoryOperation | SetTextHistoryOperation | ReparentHistoryOperation) => {
    setUndoStack((prev) => [...prev, operation]);
    setRedoStack([]);
    console.log('📝 [History] Added operation:', operation.type);
  }, []);

  const addToHistoryDebounced = useCallback((operation: HistoryOperation, isIntermediate: boolean = false) => {
    if (isIntermediate) {
      pendingHistoryOperationRef.current = operation;

      if (undoHistoryTimeoutRef.current) {
        clearTimeout(undoHistoryTimeoutRef.current);
      }

      undoHistoryTimeoutRef.current = setTimeout(() => {
        if (pendingHistoryOperationRef.current) {
          addToHistory(pendingHistoryOperationRef.current);
          pendingHistoryOperationRef.current = null;
        }
      }, 300);
    } else {
      if (undoHistoryTimeoutRef.current) {
        clearTimeout(undoHistoryTimeoutRef.current);
        undoHistoryTimeoutRef.current = null;
      }
      if (pendingHistoryOperationRef.current) {
        pendingHistoryOperationRef.current = null;
      }
      addToHistory(operation);
    }
  }, [addToHistory]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) {
      console.log('↩️ [Undo] stack is empty');
      return;
    }

    const operation = undoStack[undoStack.length - 1];
    console.log('↩️ [Undo] rollback operation:', operation.type, operation);

    setRedoStack((prev) => [...prev, operation]);
    setUndoStack((prev) => prev.slice(0, -1));

    switch (operation.type) {
      case 'patch': {
        updateStagedPatches((prev) => {
          const next = { ...prev };
          if (operation.previousValue) {
            next[operation.blockId] = operation.previousValue;
          } else {
            delete next[operation.blockId];
          }
          return next;
        });

        let patchToApply: Record<string, any>;
        if (operation.previousValue) {
          patchToApply = operation.previousValue;
        } else {
          patchToApply = {};
          for (const key in operation.patch) {
            patchToApply[key] = null;
          }
        }

        sendIframeCommand({
          type: MRPAK_CMD.SET_STYLE,
          id: operation.blockId,
          patch: patchToApply,
          fileType,
        });
        break;
      }
      case 'insert': {
        updateStagedOps((prev) => prev.filter((op) => op.blockId !== operation.blockId));
        sendIframeCommand({ type: MRPAK_CMD.DELETE, id: operation.blockId });
        break;
      }
      case 'delete': {
        updateStagedOps((prev: StagedOp[]) => [
          ...prev,
          {
            type: 'insert',
            targetId: operation.parentId,
            mode: 'child',
            snippet: operation.snippet,
            blockId: operation.blockId,
            fileType,
            filePath,
          },
        ]);
        sendIframeCommand({
          type: MRPAK_CMD.INSERT,
          targetId: operation.parentId,
          mode: 'child',
          html: operation.snippet,
        });
        break;
      }
      case 'setText': {
        updateStagedOps((prev) => prev.filter((op) => !(op.type === 'setText' && op.blockId === operation.blockId)));
        sendIframeCommand({
          type: MRPAK_CMD.SET_TEXT,
          id: operation.blockId,
          text: operation.previousText || '',
        });
        break;
      }
      case 'reparent': {
        updateStagedOps((prev) => prev.filter((op) => !(op.type === 'reparent' && op.blockId === operation.blockId)));
        sendIframeCommand({
          type: MRPAK_CMD.REPARENT,
          sourceId: operation.blockId,
          targetParentId: operation.oldParentId,
        });
        break;
      }
      default:
        console.warn('↩️ [Undo] unknown op:', (operation as any).type);
    }

    setTimeout(() => {
      const hasChanges =
        undoStack.length > 0 ||
        Object.keys(stagedPatchesRef.current || {}).length > 0 ||
        (stagedOpsRef.current || []).length > 0;
      updateHasStagedChanges(hasChanges);
    }, 0);
  }, [
    undoStack,
    fileType,
    filePath,
    sendIframeCommand,
    updateStagedPatches,
    updateStagedOps,
    updateHasStagedChanges,
    stagedPatchesRef,
    stagedOpsRef,
  ]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) {
      console.log('↪️ [Redo] stack is empty');
      return;
    }

    const operation: HistoryOperation = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, operation]);
    setRedoStack((prev) => prev.slice(0, -1));

    switch (operation.type) {
      case 'patch': {
        updateStagedPatches((prev) => ({
          ...prev,
          [operation.blockId]: { ...(prev[operation.blockId] || {}), ...operation.patch },
        }));
        sendIframeCommand({
          type: MRPAK_CMD.SET_STYLE,
          id: operation.blockId,
          patch: operation.patch,
          fileType,
        });
        break;
      }
      case 'insert': {
        updateStagedOps((prev: StagedOp[]) => [
          ...prev,
          {
            type: 'insert',
            targetId: operation.targetId,
            mode: operation.mode,
            snippet: operation.snippet,
            blockId: operation.blockId,
            fileType,
            filePath,
          },
        ]);
        sendIframeCommand({
          type: MRPAK_CMD.INSERT,
          targetId: operation.targetId,
          mode: operation.mode,
          html: operation.snippet,
        });
        break;
      }
      case 'delete': {
        updateStagedOps((prev: StagedOp[]) => [
          ...prev,
          {
            type: 'delete',
            blockId: operation.blockId,
            fileType,
            filePath,
          },
        ]);
        sendIframeCommand({ type: MRPAK_CMD.DELETE, id: operation.blockId });
        break;
      }
      case 'setText': {
        updateStagedOps((prev: StagedOp[]) => [
          ...prev,
          {
            type: 'setText',
            blockId: operation.blockId,
            text: operation.text,
            fileType,
            filePath,
          },
        ]);
        sendIframeCommand({
          type: MRPAK_CMD.SET_TEXT,
          id: operation.blockId,
          text: operation.text,
        });
        break;
      }
      case 'reparent': {
        updateStagedOps((prev: StagedOp[]) => [
          ...prev,
          {
            type: 'reparent',
            blockId: operation.blockId,
            oldParentId: operation.oldParentId,
            newParentId: operation.newParentId,
            sourceId: operation.blockId,
            targetParentId: operation.newParentId,
            targetBeforeId: operation.targetBeforeId || null,
            fileType: operation.fileType,
            filePath: operation.filePath,
          },
        ]);
        if (!operation.targetBeforeId) {
          sendIframeCommand({
            type: MRPAK_CMD.REPARENT,
            sourceId: operation.blockId,
            targetParentId: operation.newParentId,
          });
        }
        break;
      }
      default:
        console.warn('↪️ [Redo] unknown op:', (operation as any).type);
    }

    updateHasStagedChanges(true);
  }, [redoStack, fileType, filePath, sendIframeCommand, updateStagedPatches, updateStagedOps, updateHasStagedChanges]);

  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    if (undoHistoryTimeoutRef.current) {
      clearTimeout(undoHistoryTimeoutRef.current);
      undoHistoryTimeoutRef.current = null;
    }
    pendingHistoryOperationRef.current = null;
  }, []);

  return {
    undoStack,
    redoStack,
    addToHistory,
    addToHistoryDebounced,
    undo,
    redo,
    clearHistory,
  };
}
