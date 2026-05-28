import { useCallback, useEffect, useRef } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import { useEditorStore } from '../../../store/editorStore';

type UseMonacoEditorParams = {
  monacoEditorRef: React.MutableRefObject<any>;
  isUpdatingFromFileRef: React.MutableRefObject<boolean>;
};

export function useMonacoEditor({
  monacoEditorRef,
  isUpdatingFromFileRef,
}: UseMonacoEditorParams) {
  const {
    blockMap,
    blockMapForFile,
    selectedBlock,
    setSelectedBlock,
    sendIframeCommand,
    selectedVariableName,
    setSelectedVariableName,
    variableSnapshots,
  } = useEditorStore();

  const suppressCodeSelectionSyncRef = useRef<boolean>(false);
  const monacoSelectionDecorationsRef = useRef<string[]>([]);
  const monacoVariableDecorationsRef = useRef<string[]>([]);

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

  const clearMonacoVariableSelection = useCallback(() => {
    const editor = monacoEditorRef?.current;
    if (!editor) return;

    try {
      if (typeof editor.deltaDecorations === 'function') {
        monacoVariableDecorationsRef.current = editor.deltaDecorations(
          monacoVariableDecorationsRef.current,
          []
        );
      }
    } catch (e) {
      console.warn('[clearMonacoVariableSelection] decorations clear failed:', e);
    }
  }, [monacoEditorRef]);

  const revealSelectedBlockInCode = useCallback((
    blockId: string | null | undefined,
    options?: { center?: boolean; focus?: boolean; moveCursor?: boolean; select?: boolean }
  ) => {
    clearMonacoBlockSelection();
    if (!blockId || !monacoEditorRef?.current) return;

    try {
      const editor = monacoEditorRef.current;
      const model = typeof editor.getModel === 'function' ? editor.getModel() : null;
      if (!model || typeof model.getPositionAt !== 'function') return;

      const entry = (blockMapForFile && blockMapForFile[blockId]) || (blockMap && blockMap[blockId]);
      if (!entry || typeof entry.start !== 'number') return;

      const startOffset = Math.max(0, Math.min(entry.start, model.getValueLength()));
      const endOffset = typeof entry.end === 'number'
        ? Math.max(startOffset, Math.min(entry.end, model.getValueLength()))
        : startOffset;
      const startPos = model.getPositionAt(startOffset);
      const endPos = model.getPositionAt(endOffset);
      if (!startPos || !endPos) return;
      const range = {
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      };
      const shouldCenter = options?.center !== false;
      const shouldFocus = options?.focus !== false;
      const shouldMoveCursor = options?.moveCursor !== false;
      const shouldSelect = options?.select !== false;

      suppressCodeSelectionSyncRef.current = true;
      if (typeof editor.deltaDecorations === 'function') {
        monacoSelectionDecorationsRef.current = editor.deltaDecorations(
          monacoSelectionDecorationsRef.current,
          [
            {
              range,
              options: {
                isWholeLine: range.startLineNumber !== range.endLineNumber,
                className: 'monaco-block-selection',
                linesDecorationsClassName: 'monaco-block-selection-glyph',
                inlineClassName: 'monaco-block-selection-inline',
              },
            },
          ]
        );
      }
      if (shouldMoveCursor && typeof editor.setPosition === 'function') {
        editor.setPosition(startPos);
      }
      if (shouldCenter && typeof editor.revealRangeInCenter === 'function') {
        editor.revealRangeInCenter(range);
      } else if (shouldCenter && typeof editor.revealPositionInCenter === 'function') {
        editor.revealPositionInCenter(startPos);
      } else if (typeof editor.revealLineInCenter === 'function') {
        editor.revealLineInCenter(startPos.lineNumber);
      }

      if (shouldSelect && typeof editor.setSelection === 'function') {
        editor.setSelection({
          startLineNumber: range.startLineNumber,
          startColumn: range.startColumn,
          endLineNumber: range.endLineNumber,
          endColumn: range.endColumn,
        });
      }

      try {
        if (!shouldFocus) throw new Error('skip-focus');
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
      
      const wordInfo = typeof model.getWordAtPosition === 'function' ? model.getWordAtPosition(position) : null;
      if (wordInfo && wordInfo.word) {
        let isVariable = false;
        for (const compVars of Object.values(variableSnapshots || {})) {
          if (compVars[wordInfo.word]) {
            isVariable = true;
            break;
          }
        }
        if (isVariable) {
          setSelectedVariableName(wordInfo.word);
          // Don't return here, so it can ALSO select the block if needed, or we can just return.
          // The prompt says "в коде ктрл + лкм по переменной выделит ее на панели", so selecting the block is secondary.
          // Let's just return to make variable selection precise.
          return;
        }
      }

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

      setSelectedBlock({ id: bestMatch.id, meta: selectedBlock?.meta });
      sendIframeCommand({ type: MRPAK_CMD.SELECT, id: bestMatch.id });
    } catch (e) {
      console.warn('[handleMonacoCtrlClick] sync failed:', e);
    }
  }, [blockMapForFile, monacoEditorRef, selectedBlock, setSelectedBlock, sendIframeCommand]);

  useEffect(() => {
    if (!selectedBlock?.id) {
      clearMonacoBlockSelection();
      return;
    }

    const rafId = requestAnimationFrame(() => {
      revealSelectedBlockInCode(selectedBlock.id);
    });

    return () => cancelAnimationFrame(rafId);
  }, [selectedBlock, revealSelectedBlockInCode, clearMonacoBlockSelection]);

  useEffect(() => {
    if (!selectedVariableName) {
      clearMonacoVariableSelection();
      return;
    }

    const editor = monacoEditorRef?.current;
    if (!editor) return;

    const rafId = requestAnimationFrame(() => {
      try {
        const model = typeof editor.getModel === 'function' ? editor.getModel() : null;
        if (!model || typeof model.findMatches !== 'function') return;

        const matches = model.findMatches(selectedVariableName, false, false, true, null, true);
        const newDecorations = matches.map((match: any) => ({
          range: match.range,
          options: {
            inlineClassName: 'monaco-variable-selection-inline',
            overviewRuler: {
              color: 'rgba(102, 126, 234, 0.8)',
              position: 1 // OverviewRulerLane.Left
            }
          }
        }));

        if (typeof editor.deltaDecorations === 'function') {
          monacoVariableDecorationsRef.current = editor.deltaDecorations(
            monacoVariableDecorationsRef.current,
            newDecorations
          );
        }
      } catch (e) {
        console.warn('[highlightVariableInCode] failed:', e);
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [selectedVariableName, monacoEditorRef, clearMonacoVariableSelection]);

  return {
    updateMonacoEditorWithScroll,
    clearMonacoBlockSelection,
    revealSelectedBlockInCode,
    handleMonacoCtrlClick,
  };
}
