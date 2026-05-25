import { useCallback } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import { parseStyleText } from '../../../blockEditor/styleUtils';
import { createFramework, isFrameworkSupported } from '../../../frameworks/FrameworkFactory';
import { AstBidirectionalManager } from '../../../blockEditor/AstBidirectional';
import { readFile } from '../../../shared/api/electron-api';
import { extractJsxToComponent } from '../../../blockEditor/extractJsxToComponent';
import type {
  BlockMapEntry,
  BlockMap,
  HistoryOperation,
  InsertHistoryOperation,
  DeleteOperationDedup,
  LayerNode,
  LayersTree,
  LivePosition,
  StagedComponentImport,
  StagedOp,
  StylePatch,
} from '../types';
import { ensureComponentImportInCode, resolveProjectRootSync } from '../utils';
import { findProjectRoot } from '../lib/path-resolver';

type StyleSnapshot = {
  inlineStyle: string;
  computedStyle?: Record<string, unknown>;
};

type FileWriteResult = {
  success?: boolean;
  error?: string;
};

type MonacoEditorLike = {
  getValue?: () => string;
};

type ReparentOperationDedup = {
  key: string;
  timestamp: number;
};

type ChangesLogEntry = {
  ts: number;
  filePath: string;
  blockId: string;
  patch: StylePatch | { op: StagedOp['type'] };
};

type UseBlockOperationsParams = {
  blockMap: BlockMap;
  blockMapForFile: BlockMap;
  layersTree: LayersTree | null;
  styleSnapshots: Record<string, StyleSnapshot>;
  stagedPatchesRef: React.MutableRefObject<Record<string, StylePatch>>;
  stagedOpsRef: React.MutableRefObject<StagedOp[]>;
  stagedComponentImportsRef: React.MutableRefObject<StagedComponentImport[]>;
  hasStagedChangesRef: React.MutableRefObject<boolean>;
  astManagerRef: React.MutableRefObject<AstBidirectionalManager | null>;
  isUpdatingFromConstructorRef: React.MutableRefObject<boolean>;
  monacoEditorRef: React.MutableRefObject<MonacoEditorLike | null>;
  fileType: string | null;
  filePath: string;
  fileContent: string | null;
  projectRoot: string | null;
  externalStylesMap: Record<string, { path: string; type: string }>;
  resolvePathForFramework: (inputPath: string, basePath?: string) => string;
  writeFile: (targetPath: string, content: string, options?: { backup?: boolean }) => Promise<FileWriteResult>;
  updateMonacoEditorWithScroll: (newContent: string) => void;
  updateStagedPatches: (
    updater: ((prev: Record<string, StylePatch>) => Record<string, StylePatch>) | Record<string, StylePatch>
  ) => void;
  updateStagedOps: (updater: ((prev: StagedOp[]) => StagedOp[]) | StagedOp[]) => void;
  updateStagedComponentImports: (
    updater: ((prev: StagedComponentImport[]) => StagedComponentImport[]) | StagedComponentImport[]
  ) => void;
  updateHasStagedChanges: (value: boolean) => void;
  addToHistory: (operation: HistoryOperation) => void;
  addToHistoryDebounced: (operation: HistoryOperation, isIntermediate?: boolean) => void;
  clearHistory: () => void;
  sendIframeCommand: (cmd: Record<string, unknown>) => void;
  textSnapshots: Record<string, string>;
  lastInsertOperationRef: React.MutableRefObject<InsertHistoryOperation | null>;
  lastDeleteOperationRef: React.MutableRefObject<DeleteOperationDedup | null>;
  lastReparentOperationRef: React.MutableRefObject<ReparentOperationDedup | null>;
  setChangesLog: React.Dispatch<React.SetStateAction<ChangesLogEntry[]>>;
  setFileContent: React.Dispatch<React.SetStateAction<string | null>>;
  setUnsavedContent: React.Dispatch<React.SetStateAction<string | null>>;
  setIsModified: React.Dispatch<React.SetStateAction<boolean>>;
  setRenderVersion: React.Dispatch<React.SetStateAction<number>>;
  setShowSaveIndicator: React.Dispatch<React.SetStateAction<boolean>>;
  selectedBlock: { id: string; meta?: unknown } | null;
  selectedBlockIds: string[];
  setSelectedBlock: React.Dispatch<React.SetStateAction<{ id: string; meta?: unknown } | null>>;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<string[]>>;
  setLivePosition: React.Dispatch<React.SetStateAction<LivePosition>>;
  onProjectFilesChanged?: () => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useBlockOperations({
  blockMap,
  blockMapForFile,
  layersTree,
  styleSnapshots,
  stagedPatchesRef,
  stagedOpsRef,
  stagedComponentImportsRef,
  hasStagedChangesRef,
  astManagerRef,
  isUpdatingFromConstructorRef,
  monacoEditorRef,
  fileType,
  filePath,
  fileContent,
  projectRoot,
  externalStylesMap,
  resolvePathForFramework,
  writeFile,
  updateMonacoEditorWithScroll,
  updateStagedPatches,
  updateStagedOps,
  updateStagedComponentImports,
  updateHasStagedChanges,
  addToHistory,
  addToHistoryDebounced,
  clearHistory,
  sendIframeCommand,
  textSnapshots,
  lastInsertOperationRef,
  lastDeleteOperationRef,
  lastReparentOperationRef,
  setChangesLog,
  setFileContent,
  setUnsavedContent,
  setIsModified,
  setRenderVersion,
  setShowSaveIndicator,
  selectedBlock,
  selectedBlockIds,
  setSelectedBlock,
  setSelectedBlockIds,
  setLivePosition,
  onProjectFilesChanged,
  setError,
}: UseBlockOperationsParams) {
  const derivePreviousStylePatch = useCallback((blockId: string, patch: StylePatch) => {
    const inlineStyle = String(styleSnapshots?.[blockId]?.inlineStyle || '');
    if (!inlineStyle || !patch || typeof patch !== 'object') return null;
    const parsed = parseStyleText(inlineStyle);
    const toKebab = (key: string) => String(key || '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase();
    const toCamel = (key: string) => String(key || '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const previousValue: StylePatch = {};
    Object.keys(patch).forEach((key) => {
      const kebabKey = toKebab(key);
      const camelKey = toCamel(key);
      if (Object.prototype.hasOwnProperty.call(parsed, key)) previousValue[key] = parsed[key];
      else if (Object.prototype.hasOwnProperty.call(parsed, kebabKey)) previousValue[key] = parsed[kebabKey];
      else if (Object.prototype.hasOwnProperty.call(parsed, camelKey)) previousValue[key] = parsed[camelKey];
    });
    return Object.keys(previousValue).length > 0 ? previousValue : null;
  }, [styleSnapshots]);

  const ensureAstManager = useCallback(async (): Promise<AstBidirectionalManager | null> => {
    if (astManagerRef.current) return astManagerRef.current;
    if (fileType !== 'react' && fileType !== 'react-native') return null;

    const code = String(monacoEditorRef?.current?.getValue?.() || fileContent || '');
    if (!code) return null;

    let root = projectRoot || resolveProjectRootSync(filePath);
    if (!root) {
      root = await findProjectRoot(filePath);
    }
    if (!root) return null;

    const manager = new AstBidirectionalManager(filePath, root);
    const initResult = await manager.initializeFromCode(code);
    if (!initResult.ok) return null;
    astManagerRef.current = manager;
    return manager;
  }, [astManagerRef, fileContent, filePath, fileType, monacoEditorRef, projectRoot]);

  const resolveToMappedBlockId = useCallback((rawId: unknown): string | null => {
    const hasMapEntry = (id: string) => !!blockMapForFile?.[id];
    let current = String(rawId || '').trim();
    if (!current) return null;
    if (hasMapEntry(current)) return current;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const parentId = layersTree?.nodes?.[current]?.parentId || null;
      if (!parentId) break;
      current = String(parentId);
      if (hasMapEntry(current)) return current;
    }
    return null;
  }, [blockMapForFile, layersTree?.nodes]);

  const syncPatchToPreview = useCallback((blockId: string, patch: StylePatch) => {
    const mappedId = resolveToMappedBlockId(blockId) || String(blockId || '');
    if (!mappedId || !patch || typeof patch !== 'object') return;
    sendIframeCommand({
      type: MRPAK_CMD.SET_STYLE,
      id: mappedId,
      patch,
    });
  }, [resolveToMappedBlockId, sendIframeCommand]);

  const applyBlockPatch = useCallback(async (blockId: string, patch: StylePatch, isIntermediate = false) => {
    try {
      if (!blockId) return;
      const mappedBlockId = resolveToMappedBlockId(blockId) || String(blockId);

      if (fileType !== 'react' && fileType !== 'react-native') {
        const currentBlockMapForFile = blockMapForFile || {};
        if (!isFrameworkSupported(fileType as string)) return;
        const framework = createFramework(fileType as string, filePath);
        const result = await framework.commitPatches({
          originalCode: String(fileContent ?? ''),
          stagedPatches: { [mappedBlockId]: patch },
          stagedOps: [],
          blockMapForFile: currentBlockMapForFile,
          externalStylesMap,
          filePath,
          resolvePath: resolvePathForFramework,
          readFile,
          writeFile,
        });
        if (!result.ok) throw new Error(result.error || 'Failed to apply changes');
        const newContent = result.code || String(fileContent ?? '');
        if (!newContent || typeof newContent !== 'string') throw new Error('Apply result is empty or invalid');
        updateStagedPatches((prev) => ({
          ...prev,
          [mappedBlockId]: { ...(prev?.[mappedBlockId] || {}), ...patch },
        }));
        updateHasStagedChanges(true);
        updateMonacoEditorWithScroll(newContent);
        syncPatchToPreview(mappedBlockId, patch);
        return;
      }

      const manager = (await ensureAstManager()) || astManagerRef.current;
      if (!manager) return;

      let updateResult = manager.updateCodeAST(mappedBlockId, { type: 'style', patch });
      if (!updateResult.ok) {
        const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
        const refreshResult = await manager.updateCodeASTFromCode(String(currentCode ?? ''), true);
        if (refreshResult?.ok) updateResult = manager.updateCodeAST(mappedBlockId, { type: 'style', patch });
      }
      if (!updateResult.ok) {
        syncPatchToPreview(mappedBlockId, patch);
        return;
      }

      const generateResult = manager.generateCodeFromCodeAST();
      if (!generateResult.ok) throw new Error(generateResult.error || 'Failed to generate code from codeAST');
      const newContent = generateResult.code;

      if (isIntermediate) {
        updateMonacoEditorWithScroll(newContent);
        await manager.updateCodeASTFromCode(newContent || '', true);
        syncPatchToPreview(mappedBlockId, patch);
        const previousValue = derivePreviousStylePatch(mappedBlockId, patch);
        addToHistoryDebounced({ type: 'patch', blockId: mappedBlockId, patch, previousValue }, true);
        return;
      }

      isUpdatingFromConstructorRef.current = true;
      updateMonacoEditorWithScroll(newContent);
      syncPatchToPreview(mappedBlockId, patch);
      updateStagedPatches((prev) => ({
        ...prev,
        [mappedBlockId]: { ...(prev?.[mappedBlockId] || {}), ...patch },
      }));
      updateHasStagedChanges(true);
      setChangesLog((prev) => [
        { ts: Date.now() + Math.random(), filePath, blockId: mappedBlockId, patch },
        ...prev,
      ]);
      const previousValue = derivePreviousStylePatch(mappedBlockId, patch);
      addToHistoryDebounced({ type: 'patch', blockId: mappedBlockId, patch, previousValue }, false);
      setTimeout(() => {
        isUpdatingFromConstructorRef.current = false;
      }, 100);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Failed to apply changes: ${errorMessage}`);
    }
  }, [
    addToHistoryDebounced,
    ensureAstManager,
    astManagerRef,
    blockMapForFile,
    derivePreviousStylePatch,
    externalStylesMap,
    fileContent,
    filePath,
    fileType,
    isUpdatingFromConstructorRef,
    monacoEditorRef,
    projectRoot,
    resolvePathForFramework,
    resolveToMappedBlockId,
    setChangesLog,
    setError,
    syncPatchToPreview,
    updateHasStagedChanges,
    updateMonacoEditorWithScroll,
    updateStagedPatches,
    writeFile,
  ]);

  const commitStagedPatches = useCallback(async () => {
    const currentStagedPatches = stagedPatchesRef.current || {};
    const currentStagedOps = stagedOpsRef.current || [];
    const currentStagedComponentImports = stagedComponentImportsRef.current || [];
    const currentHasStagedChanges = hasStagedChangesRef.current;
    const entries = Object.entries(currentStagedPatches).filter(([id, p]) => id && p && Object.keys(p).length > 0);
    const ops = Array.isArray(currentStagedOps) ? currentStagedOps : [];
    const imports = Array.isArray(currentStagedComponentImports) ? currentStagedComponentImports : [];

    try {
      if (!currentHasStagedChanges && entries.length === 0 && ops.length === 0 && imports.length === 0) {
        updateHasStagedChanges(false);
        return;
      }
      if (!isFrameworkSupported(fileType as string)) return;
      const framework = createFramework(fileType as string, filePath);
      const result = await framework.commitPatches({
        originalCode: String(fileContent ?? ''),
        stagedPatches: currentStagedPatches,
        stagedOps: ops,
        blockMapForFile: blockMapForFile || {},
        externalStylesMap,
        filePath,
        resolvePath: resolvePathForFramework,
        readFile,
        writeFile,
      });
      if (!result.ok) throw new Error(result.error || 'Failed to apply changes');
      let finalContent = result.code || String(fileContent ?? '');
      if (!finalContent || typeof finalContent !== 'string') throw new Error('Apply result is empty or invalid');
      for (const importMeta of imports) finalContent = ensureComponentImportInCode(finalContent, importMeta);

      const writeRes = await writeFile(filePath, finalContent, { backup: true });
      if (!writeRes?.success) throw new Error(writeRes?.error || 'File write error');

      setFileContent(finalContent);
      setRenderVersion((v) => v + 1);
      setChangesLog((prev) => [
        ...entries.map(([blockId, patch]) => ({ ts: Date.now() + Math.random(), filePath, blockId, patch })),
        ...ops.map((o) => ({
          ts: Date.now() + Math.random(),
          filePath,
          blockId:
            o.type === 'insert'
              ? o.targetId
              : o.type === 'reparent'
                ? (o.sourceId || o.blockId || '')
                : o.blockId,
          patch: { op: o.type },
        })),
        ...prev,
      ]);
      updateStagedPatches({});
      updateStagedOps([]);
      updateStagedComponentImports([]);
      updateHasStagedChanges(false);
      clearHistory();
      setShowSaveIndicator(true);
      setTimeout(() => setShowSaveIndicator(false), 2000);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Failed to apply changes: ${message}`);
    }
  }, [
    blockMap,
    blockMapForFile,
    clearHistory,
    externalStylesMap,
    fileContent,
    filePath,
    fileType,
    hasStagedChangesRef,
    resolvePathForFramework,
    setChangesLog,
    setError,
    setFileContent,
    setRenderVersion,
    setShowSaveIndicator,
    stagedComponentImportsRef,
    stagedOpsRef,
    stagedPatchesRef,
    updateHasStagedChanges,
    updateStagedComponentImports,
    updateStagedOps,
    updateStagedPatches,
    writeFile,
  ]);

  const applyAndCommitPatch = useCallback(async (blockId: string, patch: StylePatch) => {
    await applyBlockPatch(blockId, patch);
  }, [applyBlockPatch]);

  const ensureSnippetHasMrpakId = useCallback((snippet: string, mrpakId: string) => {
    const s = String(snippet || '').trim();
    if (!s) return s;
    if (/\bdata-no-code-ui-id\s*=/.test(s) || /\bdata-mrpak-id\s*=/.test(s)) return s;
    return s.replace(/^<\s*([A-Za-z_$][A-Za-z0-9_$.-]*)\b/, `<$1 data-no-code-ui-id="${String(mrpakId)}"`);
  }, []);

  const makeTempMrpakId = useCallback(() => {
    return `mrpak:temp:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
  }, []);

  const stageDeleteBlock = useCallback((blockId: string) => {
    if (!blockId) return;
    const mappedBlockId = resolveToMappedBlockId(blockId) || blockId;
    const now = Date.now();
    if (lastDeleteOperationRef.current) {
      const { blockId: lastBlockId, timestamp } = lastDeleteOperationRef.current;
      if (lastBlockId === mappedBlockId && (now - timestamp) < 500) return;
    }
    lastDeleteOperationRef.current = { blockId: mappedBlockId, timestamp: now };

    if (fileType === 'react' || fileType === 'react-native') {
      (async () => {
        try {
          const manager = astManagerRef.current;
          if (!manager) return;
          let updateResult = manager.updateCodeAST(mappedBlockId, { type: 'delete' });
          if (!updateResult.ok && mappedBlockId !== blockId) {
            updateResult = manager.updateCodeAST(blockId, { type: 'delete' });
          }
          if (!updateResult.ok) throw new Error(updateResult.error || 'Element not found or no changes applied');
          const generateResult = manager.generateCodeFromCodeAST();
          if (!generateResult.ok) throw new Error(generateResult.error || 'Failed to generate code from codeAST');
          updateMonacoEditorWithScroll(generateResult.code);
          updateStagedOps((prev) => [
            ...prev,
            { type: 'delete', blockId: mappedBlockId, fileType, filePath },
          ]);
          updateHasStagedChanges(true);
          addToHistory({ type: 'delete', blockId: mappedBlockId, parentId: '', snippet: '', fileType, filePath });
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          setError(`Delete block failed: ${errorMessage}`);
        }
      })();
      sendIframeCommand({ type: MRPAK_CMD.DELETE, id: blockId });
      return;
    }

    updateStagedOps((prev) => [
      ...prev,
      { type: 'delete', blockId: mappedBlockId, fileType, filePath },
    ]);
    updateHasStagedChanges(true);
    addToHistory({
      type: 'delete',
      blockId: mappedBlockId,
      parentId: layersTree?.nodes?.[blockId]?.parentId || '',
      snippet: `<div data-no-code-ui-id="${blockId}">Deleted block</div>`,
      fileType,
      filePath,
    });
    sendIframeCommand({ type: MRPAK_CMD.DELETE, id: blockId });
  }, [
    addToHistory,
    astManagerRef,
    filePath,
    fileType,
    lastDeleteOperationRef,
    layersTree?.nodes,
    resolveToMappedBlockId,
    sendIframeCommand,
    setError,
    updateHasStagedChanges,
    updateMonacoEditorWithScroll,
    updateStagedOps,
  ]);

  const stageInsertBlock = useCallback(({ targetId, mode, snippet, skipIframeInsert = false }: { targetId: string; mode: 'child' | 'sibling'; snippet: string; skipIframeInsert?: boolean }): string | null => {
    if (!targetId) return null;
    const operationKey = `${targetId}:${mode}:${snippet}`;
    const now = Date.now();
    if (lastInsertOperationRef.current) {
      const { key, timestamp } = lastInsertOperationRef.current;
      if (key === operationKey && (now - timestamp) < 500) return null;
    }
    lastInsertOperationRef.current = { key: operationKey, timestamp: now };

    const mappedTargetId = resolveToMappedBlockId(targetId) || targetId;
    const newId = makeTempMrpakId();
    const snippetWithId = ensureSnippetHasMrpakId(snippet, newId);
    updateStagedOps((prev) => [
      ...prev,
      {
        type: 'insert',
        targetId: mappedTargetId,
        mode: mode === 'sibling' ? 'after' : 'child',
        snippet: String(snippetWithId || ''),
        blockId: newId,
        fileType,
        filePath,
      },
    ]);
    updateHasStagedChanges(true);
    addToHistory({
      type: 'insert',
      blockId: newId,
      targetId: mappedTargetId,
      mode: mode === 'sibling' ? 'after' : 'child',
      snippet: String(snippetWithId || ''),
      fileType,
      filePath,
    });
    if (!skipIframeInsert) {
      sendIframeCommand({
        type: MRPAK_CMD.INSERT,
        targetId,
        mode: mode === 'sibling' ? 'after' : 'child',
        html: String(snippetWithId || ''),
      });
    }
    return newId;
  }, [
    addToHistory,
    ensureSnippetHasMrpakId,
    filePath,
    fileType,
    lastInsertOperationRef,
    makeTempMrpakId,
    resolveToMappedBlockId,
    sendIframeCommand,
    updateHasStagedChanges,
    updateStagedOps,
  ]);

  const stageReparentBlock = useCallback(async ({
    sourceId,
    targetParentId,
    targetBeforeId = null,
  }: {
    sourceId: string;
    targetParentId: string;
    targetBeforeId?: string | null;
  }) => {
    if (!sourceId || !targetParentId || sourceId === targetParentId) return;
    const operationKey = `${sourceId}:${targetParentId}:${targetBeforeId ?? ''}`;
    const now = Date.now();
    if (lastReparentOperationRef.current) {
      const { key, timestamp } = lastReparentOperationRef.current;
      if (key === operationKey && (now - timestamp) < 500) return;
    }
    lastReparentOperationRef.current = { key: operationKey, timestamp: now };

    sendIframeCommand({
      type: MRPAK_CMD.REPARENT,
      sourceId,
      targetParentId,
      ...(targetBeforeId ? { targetBeforeId } : {}),
    });

    if (fileType === 'react' || fileType === 'react-native') {
      try {
        const manager = (await ensureAstManager()) || astManagerRef.current;
        if (manager) {
          const updateResult = manager.updateCodeAST(sourceId, {
            type: 'reparent',
            sourceId,
            targetParentId,
            targetBeforeId,
          });
          if (updateResult.ok) {
            const generateResult = manager.generateCodeFromCodeAST();
            if (generateResult.ok && generateResult.code) {
              isUpdatingFromConstructorRef.current = true;
              updateMonacoEditorWithScroll(generateResult.code);
              setTimeout(() => {
                isUpdatingFromConstructorRef.current = false;
              }, 100);
            }
          }
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(`Failed to move block: ${errorMessage}`);
      }
    }

    updateStagedOps((prev) => [
      ...prev,
      { type: 'reparent', sourceId, targetParentId, targetBeforeId, fileType, filePath },
    ]);
    updateHasStagedChanges(true);
    addToHistory({
      type: 'reparent',
      blockId: sourceId,
      oldParentId: layersTree?.nodes?.[sourceId]?.parentId || null,
      newParentId: targetParentId,
      targetBeforeId,
      fileType,
      filePath,
    });
  }, [
    addToHistory,
    ensureAstManager,
    astManagerRef,
    filePath,
    fileType,
    isUpdatingFromConstructorRef,
    lastReparentOperationRef,
    layersTree?.nodes,
    sendIframeCommand,
    setError,
    updateHasStagedChanges,
    updateMonacoEditorWithScroll,
    updateStagedOps,
  ]);

  const stageSetText = useCallback(({ blockId, text }: { blockId: string; text: string }) => {
    if (!blockId) return;
    const mappedBlockId = resolveToMappedBlockId(blockId) || String(blockId);
    const previousText = textSnapshots[mappedBlockId] || textSnapshots[blockId] || '';
    updateStagedOps((prev) => [
      ...prev,
      { type: 'setText', blockId: mappedBlockId, text: String(text ?? ''), fileType, filePath },
    ]);
    updateHasStagedChanges(true);
    addToHistory({
      type: 'setText',
      blockId: mappedBlockId,
      text: String(text ?? ''),
      previousText,
    });
    sendIframeCommand({ type: MRPAK_CMD.SET_TEXT, id: blockId, text: String(text ?? '') });
  }, [
    addToHistory,
    filePath,
    fileType,
    resolveToMappedBlockId,
    sendIframeCommand,
    textSnapshots,
    updateHasStagedChanges,
    updateStagedOps,
  ]);

  const extractSelectedToComponent = useCallback(async () => {
    try {
      if (!filePath || !fileContent) return;
      if (fileType !== 'react' && fileType !== 'react-native') {
        setError('Extract to component is supported only for React/React Native files.');
        return;
      }

      const ids = selectedBlockIds.length > 0
        ? selectedBlockIds
        : (selectedBlock?.id ? [selectedBlock.id] : []);
      if (ids.length === 0) {
        setError('Select block(s) on canvas first.');
        return;
      }

      const hasMapEntry = (id: string) => {
        const entry = blockMapForFile?.[id] as BlockMapEntry | undefined;
        return !!(entry && Number.isFinite(entry.start) && Number.isFinite(entry.end));
      };

      const resolveToExtractableId = (rawId: string) => {
        let current = String(rawId || '').trim();
        if (!current) return null;
        if (hasMapEntry(current)) return current;
        const visited = new Set<string>();
        while (current && !visited.has(current)) {
          visited.add(current);
          const parentId = layersTree?.nodes?.[current]?.parentId || null;
          if (!parentId) break;
          current = String(parentId);
          if (hasMapEntry(current)) return current;
        }
        return null;
      };

      const resolvedIds = Array.from(
        new Set(
          ids.map((id) => resolveToExtractableId(String(id))).filter((id): id is string => !!id)
        )
      );
      if (resolvedIds.length === 0) {
        setError('Selected runtime elements do not map to source code. Select a parent block with data-id and retry.');
        return;
      }

      const normalizedFilePath = String(filePath).replace(/\\/g, '/');
      const slashIdx = normalizedFilePath.lastIndexOf('/');
      const dirPath = slashIdx >= 0 ? normalizedFilePath.slice(0, slashIdx) : '';
      const extMatch = normalizedFilePath.match(/(\.[^.\/\\]+)$/);
      const ext = extMatch ? extMatch[1] : '.tsx';

      let componentName = 'ExtractedBlock';
      let candidatePath = dirPath ? `${dirPath}/${componentName}${ext}` : `${componentName}${ext}`;
      for (let i = 1; i <= 99; i += 1) {
        const readRes = await readFile(candidatePath);
        if (!readRes?.success) {
          if (i > 1) {
            componentName = `ExtractedBlock${i}`;
            candidatePath = dirPath ? `${dirPath}/${componentName}${ext}` : `${componentName}${ext}`;
          }
          break;
        }
        componentName = `ExtractedBlock${i + 1}`;
        candidatePath = dirPath ? `${dirPath}/${componentName}${ext}` : `${componentName}${ext}`;
      }

      const extractResult = extractJsxToComponent({
        code: fileContent,
        filePath,
        selectedIds: resolvedIds,
        componentName,
        fileType,
        blockMap: blockMapForFile,
      });
      if (!extractResult.ok) {
        setError(`Extract block error: ${extractResult.error}`);
        return;
      }

      const writeComponentRes = await writeFile(candidatePath, extractResult.newComponentCode, { backup: true });
      if (!writeComponentRes?.success) {
        setError(`Failed to create component file: ${candidatePath}`);
        return;
      }
      const writeMainRes = await writeFile(filePath, extractResult.newMainCode, { backup: true });
      if (!writeMainRes?.success) {
        setError('Failed to update source file after extraction.');
        return;
      }

      onProjectFilesChanged?.();
      setFileContent(extractResult.newMainCode);
      setUnsavedContent(null);
      setIsModified(false);
      updateMonacoEditorWithScroll(extractResult.newMainCode);
      setRenderVersion((v) => v + 1);
      setSelectedBlockIds([]);
      setSelectedBlock(null);
      setLivePosition({ left: null, top: null, width: null, height: null });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Extract block error: ${errorMessage}`);
    }
  }, [
    blockMapForFile,
    fileContent,
    filePath,
    fileType,
    layersTree?.nodes,
    onProjectFilesChanged,
    selectedBlock,
    selectedBlockIds,
    setError,
    setFileContent,
    setIsModified,
    setLivePosition,
    setRenderVersion,
    setSelectedBlock,
    setSelectedBlockIds,
    setUnsavedContent,
    updateMonacoEditorWithScroll,
    writeFile,
  ]);

  return {
    resolveToMappedBlockId,
    applyBlockPatch,
    commitStagedPatches,
    applyAndCommitPatch,
    stageDeleteBlock,
    stageInsertBlock,
    stageReparentBlock,
    stageSetText,
    extractSelectedToComponent,
  };
}
