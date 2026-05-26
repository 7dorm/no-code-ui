const fs = require('fs');

const path = './src/features/editor/hooks/useBlockOperations.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  `const applyBlockPatch = useCallback(async (blockId: any, patch: any, isIntermediate = false) => {`,
  `const applyBlockPatch = useCallback(async (blockId: any, patch: any, isIntermediate = false, isUndoRedo = false) => {`
);

code = code.replace(
  `addToHistoryDebounced({ type: 'patch', blockId: mappedBlockId, patch, previousValue }, true);`,
  `if (!isUndoRedo) addToHistoryDebounced({ type: 'patch', blockId: mappedBlockId, patch, previousValue }, true);`
);

code = code.replace(
  `addToHistoryDebounced({ type: 'patch', blockId: mappedBlockId, patch, previousValue }, false);`,
  `if (!isUndoRedo) addToHistoryDebounced({ type: 'patch', blockId: mappedBlockId, patch, previousValue }, false);`
);

code = code.replace(
  `const stageDeleteBlock = useCallback((blockId: any) => {`,
  `const stageDeleteBlock = useCallback((blockId: any, isUndoRedo = false) => {`
);

code = code.replace(
  `addToHistory({ type: 'delete', blockId: mappedBlockId, parentId: '', snippet: '', fileType, filePath });`,
  `if (!isUndoRedo) addToHistory({ type: 'delete', blockId: mappedBlockId, parentId: '', snippet: '', fileType, filePath });`
);

code = code.replace(
  `addToHistory(`,
  `if (!isUndoRedo) addToHistory(`
);

code = code.replace(
  `const stageInsertBlock = useCallback(({ targetId, mode, snippet, skipIframeInsert = false }: { targetId: string; mode: 'child' | 'sibling'; snippet: string; skipIframeInsert?: boolean }) => {`,
  `const stageInsertBlock = useCallback(({ targetId, mode, snippet, skipIframeInsert = false, isUndoRedo = false }: { targetId: string; mode: 'child' | 'sibling'; snippet: string; skipIframeInsert?: boolean, isUndoRedo?: boolean }) => {`
);

code = code.replace(
  `addToHistory({`,
  `if (!isUndoRedo) addToHistory({`
);

code = code.replace(
  `const stageReparentBlock = useCallback(({ sourceId, targetParentId, targetBeforeId = null }: { sourceId: string; targetParentId: string; targetBeforeId?: string | null }) => {`,
  `const stageReparentBlock = useCallback(({ sourceId, targetParentId, targetBeforeId = null, isUndoRedo = false }: { sourceId: string; targetParentId: string; targetBeforeId?: string | null, isUndoRedo?: boolean }) => {`
);

code = code.replace(
  `addToHistory({`,
  `if (!isUndoRedo) addToHistory({`
);

code = code.replace(
  `const stageSetText = useCallback(({ blockId, text }: { blockId: string; text: string }) => {`,
  `const stageSetText = useCallback(({ blockId, text, isUndoRedo = false }: { blockId: string; text: string, isUndoRedo?: boolean }) => {`
);

code = code.replace(
  `addToHistory({`,
  `if (!isUndoRedo) addToHistory({`
);

fs.writeFileSync(path, code, 'utf8');

