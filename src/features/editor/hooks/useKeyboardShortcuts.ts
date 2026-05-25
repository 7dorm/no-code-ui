import { useEffect } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import { useEditorStore } from '../../../store/editorStore';

type UseKeyboardShortcutsParams = {
  filePath: string;
  saveFile: (contentToSave?: string | null) => Promise<void> | void;
  commitStagedPatches: () => Promise<void> | void;
  unsavedContent: string | null;
  monacoEditorRef: React.MutableRefObject<any>;
  undo: () => void;
  redo: () => void;
};

export function useKeyboardShortcuts({
  filePath,
  saveFile,
  commitStagedPatches,
  unsavedContent,
  monacoEditorRef,
  undo,
  redo,
}: UseKeyboardShortcutsParams) {
  const {
    viewMode,
    isModified,
    hasStagedChanges,
    fileContent,
    selectedBlock,
    sendIframeCommand,
  } = useEditorStore();

  const selectedBlockId = selectedBlock?.id;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof (e as any).stopImmediatePropagation === 'function') (e as any).stopImmediatePropagation();
        if (!filePath) return;
        if (hasStagedChanges) {
          void commitStagedPatches();
          return;
        }
        if (viewMode === 'split' && isModified) {
          let contentToSave: string | null = null;
          if (monacoEditorRef?.current) {
            try {
              contentToSave = monacoEditorRef.current.getValue();
            } catch {}
          }
          if (!contentToSave) contentToSave = unsavedContent !== null ? unsavedContent : fileContent;
          if (contentToSave) void saveFile(contentToSave);
          return;
        }
        if (viewMode === 'preview' && isModified) void saveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isModified, filePath, saveFile, viewMode, hasStagedChanges, commitStagedPatches, unsavedContent, fileContent, monacoEditorRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode === 'changes') return; // Undo/redo works in preview and split modes
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, undo, redo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'split') return;
      if (!selectedBlockId) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const tag = String(activeEl?.tagName || '').toLowerCase();
      const isTypingTarget =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        !!activeEl?.isContentEditable ||
        !!activeEl?.closest?.('.monaco-editor') ||
        !!activeEl?.classList?.contains?.('inputarea');
      if (isTypingTarget) return;

      e.preventDefault();
      e.stopPropagation();
      sendIframeCommand({
        type: MRPAK_CMD.SET_RESIZE_TARGET,
        direction: e.key === 'ArrowLeft' ? 'left' : 'right',
      });
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [viewMode, selectedBlockId, sendIframeCommand]);
}
