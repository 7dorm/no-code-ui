import { useCallback, useEffect, useRef } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import type { BlockMap } from '../types';

type SelectedBlock = { id: string; meta?: any } | null;

type UseMonacoEditorParams = {
  monacoEditorRef: React.MutableRefObject<any>;
  isUpdatingFromFileRef: React.MutableRefObject<boolean>;
  blockMap: BlockMap;
  blockMapForFile: BlockMap;
  selectedBlock: SelectedBlock;
  setSelectedBlock: React.Dispatch<React.SetStateAction<SelectedBlock>>;
  sendIframeCommand: (cmd: any) => void;
};

export function useMonacoEditor({
  monacoEditorRef,
  isUpdatingFromFileRef,
  blockMap,
  blockMapForFile,
  selectedBlock,
  setSelectedBlock,
  sendIframeCommand,
}: UseMonacoEditorParams) {
  const suppressCodeSelectionSyncRef = useRef<boolean>(false);
  const monacoSelectionDecorationsRef = useRef<string[]>([]);

  const updateMonacoEditorWithScroll = useCallback((newContent: any) => {
    if (!monacoEditorRef?.current) return;

    try {
      isUpdatingFromFileRef.current = true;
      const editor = monacoEditorRef.current;
      const viewState = editor.saveViewState();
      const scrollTop = editor.getScrollTop();
      const scrollLeft = editor.getScrollLeft();
      const position = editor.getPosition();

      editor.setValue(newContent);

      if (viewState) {
        requestAnimationFrame(() => {
          try {
            editor.restoreViewState(viewState);
            if (scrollTop !== null && scrollTop !== undefined) {
              editor.setScrollTop(scrollTop);
            }
            if (scrollLeft !== null && scrollLeft !== undefined) {
              editor.setScrollLeft(scrollLeft);
            }
            if (position) {
              editor.setPosition(position);
            }
          } catch (e) {
            console.warn('[updateMonacoEditorWithScroll] restore failed:', e);
          }
        });
      }
    } catch (e) {
      console.warn('[updateMonacoEditorWithScroll] update failed:', e);
      if (monacoEditorRef?.current) {
        monacoEditorRef.current.setValue(newContent);
      }
    }
    setTimeout(() => {
      isUpdatingFromFileRef.current = false;
    }, 0);
  }, [isUpdatingFromFileRef, monacoEditorRef]);

  const clearMonacoBlockSelection = useCallback(() => {
    const editor = monacoEditorRef?.current;
    if (!editor) return;

    try {
      if (typeof editor.deltaDecorations === 'function') {
        monacoSelectionDecorationsRef.current = editor.deltaDecorations(
          monacoSelectionDecorationsRef.current,
          []
        );
      }
    } catch (e) {
      console.warn('[clearMonacoBlockSelection] decorations clear failed:', e);
    }
  }, [monacoEditorRef]);

  const revealSelectedBlockInCode = useCallback((blockId: string | null | undefined) => {
    clearMonacoBlockSelection();
    if (!blockId || !monacoEditorRef?.current) return;

    try {
      const editor = monacoEditorRef.current;
      const model = typeof editor.getModel === 'function' ? editor.getModel() : null;
      if (!model || typeof model.getPositionAt !== 'function') return;

      const entry = (blockMapForFile && blockMapForFile[blockId]) || (blockMap && blockMap[blockId]);
      if (!entry || typeof entry.start !== 'number') return;

      const offset = Math.max(0, Math.min(entry.start, model.getValueLength()));
      const position = model.getPositionAt(offset);
      if (!position) return;

      suppressCodeSelectionSyncRef.current = true;
      if (typeof editor.deltaDecorations === 'function') {
        monacoSelectionDecorationsRef.current = editor.deltaDecorations(
          monacoSelectionDecorationsRef.current,
          [
            {
              range: {
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: model.getLineMaxColumn(position.lineNumber),
              },
              options: {
                isWholeLine: true,
                className: 'monaco-block-selection',
                linesDecorationsClassName: 'monaco-block-selection-glyph',
              },
            },
          ]
        );
      }
      editor.setPosition(position);
      if (typeof editor.revealPositionInCenter === 'function') {
        editor.revealPositionInCenter(position);
      } else if (typeof editor.revealLineInCenter === 'function') {
        editor.revealLineInCenter(position.lineNumber);
      }

      if (typeof editor.setSelection === 'function') {
        editor.setSelection({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: model.getLineMaxColumn(position.lineNumber),
        });
      }

      try {
        editor.focus();
      } catch {}
      requestAnimationFrame(() => {
        suppressCodeSelectionSyncRef.current = false;
      });
    } catch (e) {
      console.warn('[revealSelectedBlockInCode] reveal failed:', e);
      suppressCodeSelectionSyncRef.current = false;
    }
  }, [blockMap, blockMapForFile, clearMonacoBlockSelection, monacoEditorRef]);

  const handleMonacoCtrlClick = useCallback((event: any) => {
    if (suppressCodeSelectionSyncRef.current) return;

    try {
      const editor = monacoEditorRef?.current;
      const model = editor && typeof editor.getModel === 'function' ? editor.getModel() : null;
      const position = event?.position;
      if (!model || !position) return;

      const offset = model.getOffsetAt(position);
      const entries = Object.entries(blockMapForFile || {});
      if (entries.length === 0) return;

      let bestMatch: { id: string; entry: any } | null = null;
      for (const [id, entry] of entries) {
        if (!entry || typeof entry.start !== 'number' || typeof entry.end !== 'number') continue;
        if (offset >= entry.start && offset <= entry.end) {
          if (!bestMatch || (entry.start >= bestMatch.entry.start && entry.end <= bestMatch.entry.end)) {
            bestMatch = { id, entry };
          }
        }
      }

      if (!bestMatch) return;
      if (selectedBlock?.id === bestMatch.id) return;

      setSelectedBlock((prev) => {
        if (prev?.id === bestMatch!.id) return prev;
        return { id: bestMatch!.id, meta: prev?.meta };
      });
      sendIframeCommand({ type: MRPAK_CMD.SELECT, id: bestMatch.id });
    } catch (e) {
      console.warn('[handleMonacoCtrlClick] sync failed:', e);
    }
  }, [blockMapForFile, monacoEditorRef, selectedBlock?.id, sendIframeCommand, setSelectedBlock]);

  useEffect(() => {
    if (!selectedBlock?.id) {
      clearMonacoBlockSelection();
      return;
    }

    const rafId = requestAnimationFrame(() => {
      revealSelectedBlockInCode(selectedBlock.id);
    });

    return () => cancelAnimationFrame(rafId);
  }, [selectedBlock?.id, revealSelectedBlockInCode, clearMonacoBlockSelection]);

  return {
    updateMonacoEditorWithScroll,
    clearMonacoBlockSelection,
    revealSelectedBlockInCode,
    handleMonacoCtrlClick,
  };
}
