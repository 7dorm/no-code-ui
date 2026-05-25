import { useCallback, useRef } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import { useEditorStore } from '../../../store/editorStore';
import type {
  HistoryOperation,
  ReparentHistoryOperation,
  SetTextHistoryOperation,
  StagedOp,
} from '../types';

type UseHistoryParams = {
  filePath: string;
  applyBlockPatchRef?: React.MutableRefObject<any>;
  stageInsertBlockRef?: React.MutableRefObject<any>;
  stageDeleteBlockRef?: React.MutableRefObject<any>;
  stageReparentBlockRef?: React.MutableRefObject<any>;
  stageSetTextRef?: React.MutableRefObject<any>;
};

export function useHistory({ filePath, applyBlockPatchRef, stageInsertBlockRef, stageDeleteBlockRef, stageReparentBlockRef, stageSetTextRef }: UseHistoryParams) {
  const {
    fileType,
    sendIframeCommand,
    updateStagedPatches,
    updateStagedOps,
    setHasStagedChanges,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
  } = useEditorStore();

  const undoHistoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHistoryOperationRef = useRef<HistoryOperation | null>(null);

  const addToHistory = useCallback((operation: HistoryOperation | SetTextHistoryOperation | ReparentHistoryOperation) => {
    setUndoStack([...undoStack, operation]);
    setRedoStack([]);
    console.log('📝 [History] Added operation:', operation.type);
  }, [undoStack, setUndoStack, setRedoStack]);

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

    setRedoStack([...redoStack, operation]);
    const nextUndoStack = undoStack.slice(0, -1);
    setUndoStack(nextUndoStack);

    switch (operation.type) {
      case 'patch': {
        let patchToApply: Record<string, any>;
        if (operation.previousValue) {
          patchToApply = operation.previousValue;
        } else {
          patchToApply = {};
          for (const key in operation.patch) {
            patchToApply[key] = null;
          }
        }
        if (applyBlockPatchRef?.current) {
          void applyBlockPatchRef.current(operation.blockId, patchToApply, false, true);
        }
        break;
      }
      case 'insert': {
        if (stageDeleteBlockRef?.current) {
          stageDeleteBlockRef.current(operation.blockId, true);
        }
        break;
      }
      case 'delete': {
        if (stageInsertBlockRef?.current) {
          stageInsertBlockRef.current({
            targetId: operation.parentId,
            mode: 'child',
            snippet: operation.snippet,
            skipIframeInsert: false,
            isUndoRedo: true
          });
        }
        break;
      }
      case 'setText': {
        if (stageSetTextRef?.current) {
          stageSetTextRef.current({
            blockId: operation.blockId,
            text: operation.previousText || '',
            isUndoRedo: true
          });
        }
        break;
      }
      case 'reparent': {
        if (stageReparentBlockRef?.current) {
          stageReparentBlockRef.current({
            sourceId: operation.blockId,
            targetParentId: operation.oldParentId,
            isUndoRedo: true
          });
        }
        break;
      }
      default:
        console.warn('↩️ [Undo] unknown op:', (operation as any).type);
    }

    setTimeout(() => {
      const state = useEditorStore.getState();
      const hasChanges =
        state.undoStack.length > 0 ||
        Object.keys(state.stagedPatches).length > 0 ||
        state.stagedOps.length > 0;
      setHasStagedChanges(hasChanges);
    }, 0);
  }, [
    undoStack,
    redoStack,
    fileType,
    filePath,
    sendIframeCommand,
    updateStagedPatches,
    updateStagedOps,
    setHasStagedChanges,
    setUndoStack,
    setRedoStack,
  ]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) {
      console.log('↪️ [Redo] stack is empty');
      return;
    }

    const operation: HistoryOperation = redoStack[redoStack.length - 1];
    setUndoStack([...undoStack, operation]);
    setRedoStack(redoStack.slice(0, -1));

    switch (operation.type) {
      case 'patch': {
        if (applyBlockPatchRef?.current) {
          void applyBlockPatchRef.current(operation.blockId, operation.patch, false, true);
        }
        break;
      }
      case 'insert': {
        if (stageInsertBlockRef?.current) {
          stageInsertBlockRef.current({
            targetId: operation.targetId,
            mode: operation.mode,
            snippet: operation.snippet,
            skipIframeInsert: false,
            isUndoRedo: true
          });
        }
        break;
      }
      case 'delete': {
        if (stageDeleteBlockRef?.current) {
          stageDeleteBlockRef.current(operation.blockId, true);
        }
        break;
      }
      case 'setText': {
        if (stageSetTextRef?.current) {
          stageSetTextRef.current({
            blockId: operation.blockId,
            text: operation.text,
            isUndoRedo: true
          });
        }
        break;
      }
      case 'reparent': {
        if (stageReparentBlockRef?.current) {
          stageReparentBlockRef.current({
            sourceId: operation.blockId,
            targetParentId: operation.newParentId,
            targetBeforeId: operation.targetBeforeId,
            isUndoRedo: true
          });
        }
        break;
      }
      default:
        console.warn('↪️ [Redo] unknown op:', (operation as any).type);
    }

    setHasStagedChanges(true);
  }, [
    undoStack,
    redoStack,
    fileType,
    filePath,
    sendIframeCommand,
    updateStagedPatches,
    updateStagedOps,
    setHasStagedChanges,
    setUndoStack,
    setRedoStack,
  ]);

  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    if (undoHistoryTimeoutRef.current) {
      clearTimeout(undoHistoryTimeoutRef.current);
      undoHistoryTimeoutRef.current = null;
    }
    pendingHistoryOperationRef.current = null;
  }, [setUndoStack, setRedoStack]);

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
