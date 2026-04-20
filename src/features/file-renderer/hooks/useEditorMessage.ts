import { useCallback, useEffect, useRef } from 'react';
import { isMrpakMessage, MRPAK_MSG } from '../../../blockEditor/EditorProtocol';
import type { LayersTree, LivePosition, StagedComponentImport } from '../types';
import {
  collectImportLocalNames,
  enrichLayersTree,
  getPathBasename,
  stripFileExtension,
  toSafeIdentifier,
  ensureUniqueImportName,
} from '../utils';

type UseEditorMessageParams = {
  hasStagedChangesRef: React.MutableRefObject<boolean>;
  commitStagedPatches: () => Promise<void> | void;
  viewMode: 'preview' | 'split' | 'changes';
  isModified: boolean;
  monacoEditorRef: React.MutableRefObject<any>;
  unsavedContent: string | null;
  fileContent: string | null;
  saveFileRef: React.MutableRefObject<((contentToSave?: string | null) => Promise<void>) | null>;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedBlock: React.Dispatch<React.SetStateAction<{ id: string; meta?: any } | null>>;
  setLivePosition: React.Dispatch<React.SetStateAction<LivePosition>>;
  filePath: string;
  dependencyPaths: string[];
  setLayersTree: React.Dispatch<React.SetStateAction<LayersTree | null>>;
  setStyleSnapshots: React.Dispatch<React.SetStateAction<Record<string, { inlineStyle: string; computedStyle?: any }>>>;
  setTextSnapshots: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  stageReparentBlockRef: React.MutableRefObject<((params: { sourceId: string; targetParentId: string; targetBeforeId?: string | null }) => void) | null>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  stageInsertBlockRef: React.MutableRefObject<((params: { targetId: string; mode: 'child' | 'sibling'; snippet: string; skipIframeInsert?: boolean }) => any) | null>;
  updateStagedComponentImports: (updater: ((prev: StagedComponentImport[]) => StagedComponentImport[]) | StagedComponentImport[]) => void;
  updateHasStagedChanges: (value: boolean) => void;
  setFileContent: React.Dispatch<React.SetStateAction<string | null>>;
  setRenderVersion: React.Dispatch<React.SetStateAction<number>>;
  stagedComponentImportsRef: React.MutableRefObject<StagedComponentImport[]>;
  fileType: string | null;
  selectedBlockId?: string | null;
  projectRoot: string | null;
  applyBlockPatch: (blockId: any, patch: any, isIntermediate?: boolean) => Promise<void>;
  setExternalDropTargetState: React.Dispatch<React.SetStateAction<{ source: string; sourceId: string | null; targetId: string | null } | null>>;
};

export function useEditorMessage({
  hasStagedChangesRef,
  commitStagedPatches,
  viewMode,
  isModified,
  monacoEditorRef,
  unsavedContent,
  fileContent,
  saveFileRef,
  setSelectedBlockIds,
  setSelectedBlock,
  setLivePosition,
  filePath,
  dependencyPaths,
  setLayersTree,
  setStyleSnapshots,
  setTextSnapshots,
  stageReparentBlockRef,
  setError,
  stageInsertBlockRef,
  updateStagedComponentImports,
  updateHasStagedChanges,
  setFileContent,
  setRenderVersion,
  stagedComponentImportsRef,
  fileType,
  selectedBlockId,
  projectRoot,
  applyBlockPatch,
  setExternalDropTargetState,
}: UseEditorMessageParams) {
  const handleEditorMessage = useCallback(
    async (event: any) => {
      const data = event?.nativeEvent?.data;
      if (!isMrpakMessage(data)) return;

      if (data.type === MRPAK_MSG.SAVE) {
        if (hasStagedChangesRef.current) {
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
          if (!contentToSave) {
            contentToSave = unsavedContent !== null ? unsavedContent : fileContent;
          }
          if (contentToSave) {
            void saveFileRef.current?.(contentToSave);
          }
          return;
        }
        if (viewMode === 'preview' && isModified) {
          void saveFileRef.current?.();
        }
        return;
      }

      if (data.type === MRPAK_MSG.SELECT) {
        const ids = Array.isArray(data.ids)
          ? Array.from(new Set(data.ids.map((id: any) => String(id || '').trim()).filter(Boolean)))
          : (data.id ? [String(data.id)] : []);
        setSelectedBlockIds((prev) => {
          if (prev.length === ids.length && prev.every((id, idx) => id === ids[idx])) {
            return prev;
          }
          return ids;
        });
        setSelectedBlock((prev) => {
          if (prev?.id === data.id) return prev;
          return { id: data.id, meta: data.meta };
        });
        setLivePosition({ left: null, top: null, width: null, height: null });
        return;
      }

      if (data.type === MRPAK_MSG.TREE) {
        if (data.tree) {
          const nextTree = enrichLayersTree(data.tree, filePath, dependencyPaths);
          setLayersTree((prev) => {
            try {
              if (prev && JSON.stringify(prev) === JSON.stringify(nextTree)) {
                return prev;
              }
            } catch {}
            return nextTree;
          });
        }
        return;
      }

      if (data.type === MRPAK_MSG.STYLE_SNAPSHOT) {
        if (data.id) {
          setStyleSnapshots((prev) => ({
            ...(prev || {}),
            [data.id]: (() => {
              const nextSnap = { inlineStyle: data.inlineStyle || '', computedStyle: data.computedStyle || null };
              const prevSnap = prev?.[data.id];
              if (
                prevSnap &&
                prevSnap.inlineStyle === nextSnap.inlineStyle &&
                JSON.stringify(prevSnap.computedStyle || null) === JSON.stringify(nextSnap.computedStyle || null)
              ) {
                return prevSnap;
              }
              return nextSnap;
            })(),
          }));
        }
        return;
      }

      if (data.type === MRPAK_MSG.TEXT_SNAPSHOT) {
        if (data.id) {
          setTextSnapshots((prev) => ({
            ...(prev || {}),
            [data.id]: prev?.[data.id] === (data.text ?? '') ? prev[data.id] : (data.text ?? ''),
          }));
        }
        return;
      }

      if (data.type === MRPAK_MSG.APPLY) {
        const id = data.id;
        const patch = data.patch || {};
        const isIntermediate = data.isIntermediate === true;
        if (!id) return;

        if (patch.__reparentTo) {
          if (stageReparentBlockRef.current) {
            stageReparentBlockRef.current({ sourceId: id, targetParentId: patch.__reparentTo });
          }
          return;
        }

        if (patch.__insertFromLibrary && !isIntermediate) {
          const sourceType = String(patch.__insertFromLibrary?.source || 'library');
          if (sourceType === 'component') {
            const componentName = String(patch.__insertFromLibrary?.componentName || '').trim();
            const importPath = String(patch.__insertFromLibrary?.importPath || '').trim();
            const importKind =
              String(patch.__insertFromLibrary?.importKind || 'default') === 'named'
                ? 'named'
                : 'default';
            const hasProps = Boolean(patch.__insertFromLibrary?.hasProps);
            const supportsStyleOnlyArg = Boolean(patch.__insertFromLibrary?.supportsStyleOnlyArg);
            if (hasProps && !supportsStyleOnlyArg) {
              setError(
                `Component "${componentName || 'Unknown'}" has props other than "style". Only components with no props or style-only props are supported right now.`
              );
              return;
            }
            if (!componentName || !importPath) {
              setError('Failed to insert component: import data is missing.');
              return;
            }
            const snippet = supportsStyleOnlyArg ? `<${componentName} style={{}} />` : `<${componentName} />`;
            if (stageInsertBlockRef.current) {
              await stageInsertBlockRef.current({ targetId: id, mode: 'child', snippet, skipIframeInsert: true });
              updateStagedComponentImports((prev) => {
                const exists = prev.some(
                  (item) =>
                    item.localName === componentName &&
                    item.importPath === importPath &&
                    item.importKind === importKind
                );
                if (exists) return prev;
                return [...prev, { localName: componentName, importPath, importKind }];
              });
              updateHasStagedChanges(true);
              const liveCode = monacoEditorRef?.current?.getValue?.();
              if (typeof liveCode === 'string' && liveCode.length > 0) {
                setFileContent(liveCode);
              }
              setRenderVersion((v) => v + 1);
            }
            return;
          }

          if (sourceType === 'file') {
            const sourceFilePath = String(patch.__insertFromLibrary?.filePath || '').trim();
            const importPath = String(patch.__insertFromLibrary?.importPath || '').trim();
            if (!sourceFilePath || !importPath) {
              setError('Failed to insert file: missing import data.');
              return;
            }

            const baseName = toSafeIdentifier(stripFileExtension(getPathBasename(sourceFilePath)));
            const usedNames = collectImportLocalNames(fileContent || '');
            (stagedComponentImportsRef.current || []).forEach((item) => {
              if (item?.localName) usedNames.add(item.localName);
            });
            const localName = ensureUniqueImportName(baseName, usedNames);
            const snippet =
              fileType === 'react-native'
                ? `<Image source={${localName}} />`
                : `<img src={${localName}} alt=\"\" />`;

            if (stageInsertBlockRef.current) {
              await stageInsertBlockRef.current({ targetId: id, mode: 'child', snippet, skipIframeInsert: true });
              updateStagedComponentImports((prev) => {
                const exists = prev.some(
                  (item) =>
                    item.localName === localName &&
                    item.importPath === importPath &&
                    item.importKind === 'default'
                );
                if (exists) return prev;
                return [...prev, { localName, importPath, importKind: 'default' }];
              });
              updateHasStagedChanges(true);
              const liveCode = monacoEditorRef?.current?.getValue?.();
              if (typeof liveCode === 'string' && liveCode.length > 0) {
                setFileContent(liveCode);
              }
              setRenderVersion((v) => v + 1);
            }
            return;
          }

          const rawTag = String(patch.__insertFromLibrary?.tag || '').trim();
          const normalizedTag = /^[A-Za-z][A-Za-z0-9_-]*$/.test(rawTag) ? rawTag : '';
          let tag = normalizedTag;
          if (!tag) {
            tag = fileType === 'react-native' ? 'View' : 'div';
          }
          const snippet = `<${tag}></${tag}>`;
          if (stageInsertBlockRef.current) {
            await stageInsertBlockRef.current({ targetId: id, mode: 'child', snippet });
          }
          return;
        }

        if (isIntermediate && selectedBlockId === id) {
          setLivePosition((prev) => {
            const newPos = { ...prev };
            const patchLeft = patch.marginLeft !== undefined ? patch.marginLeft : patch.left;
            const patchTop = patch.marginTop !== undefined ? patch.marginTop : patch.top;
            if (patchLeft !== undefined) {
              const leftVal = typeof patchLeft === 'string' ? parseFloat(patchLeft.replace('px', '')) : patchLeft;
              if (!isNaN(leftVal)) newPos.left = leftVal;
            }
            if (patchTop !== undefined) {
              const topVal = typeof patchTop === 'string' ? parseFloat(patchTop.replace('px', '')) : patchTop;
              if (!isNaN(topVal)) newPos.top = topVal;
            }
            if (patch.width !== undefined) {
              const widthVal = typeof patch.width === 'string' ? parseFloat(patch.width.replace('px', '')) : patch.width;
              if (!isNaN(widthVal)) newPos.width = widthVal;
            }
            if (patch.height !== undefined) {
              const heightVal = typeof patch.height === 'string' ? parseFloat(patch.height.replace('px', '')) : patch.height;
              if (!isNaN(heightVal)) newPos.height = heightVal;
            }
            return newPos;
          });
        }

        if (!projectRoot && !isIntermediate) {
          setError('Cannot apply changes: project is not loaded yet. Please wait and try again.');
          return;
        }

        await applyBlockPatch(id, patch, isIntermediate);
        return;
      }

      if (data.type === MRPAK_MSG.DROP_TARGET) {
        const source = String(data.source || 'library');
        const sourceId = data.sourceId ? String(data.sourceId) : null;
        const targetId = data.targetId ? String(data.targetId) : null;
        setExternalDropTargetState({ source, sourceId, targetId });
        return;
      }
    },
    [
      applyBlockPatch,
      commitStagedPatches,
      dependencyPaths,
      fileContent,
      filePath,
      fileType,
      hasStagedChangesRef,
      isModified,
      monacoEditorRef,
      projectRoot,
      saveFileRef,
      selectedBlockId,
      setError,
      setExternalDropTargetState,
      setFileContent,
      setLayersTree,
      setLivePosition,
      setRenderVersion,
      setSelectedBlock,
      setSelectedBlockIds,
      setStyleSnapshots,
      setTextSnapshots,
      stageInsertBlockRef,
      stageReparentBlockRef,
      stagedComponentImportsRef,
      unsavedContent,
      updateHasStagedChanges,
      updateStagedComponentImports,
      viewMode,
    ]
  );

  const handleEditorMessageRef = useRef(handleEditorMessage);
  useEffect(() => {
    handleEditorMessageRef.current = handleEditorMessage;
  }, [handleEditorMessage]);

  const handleEditorMessageStable = useCallback((event: any) => {
    handleEditorMessageRef.current?.(event);
  }, []);

  return {
    handleEditorMessageStable,
  };
}
