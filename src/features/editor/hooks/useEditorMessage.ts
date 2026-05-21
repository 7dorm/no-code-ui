import { useCallback, useEffect, useRef } from 'react';
import { isMrpakMessage, MRPAK_MSG } from '../../../blockEditor/EditorProtocol';
import { useEditorStore } from '../../../store/editorStore';
import type { LivePosition } from '../types';
import {
  collectImportLocalNames,
  enrichLayersTree,
  getPathBasename,
  stripFileExtension,
  toSafeIdentifier,
  ensureUniqueImportName,
} from '../utils';

type UseEditorMessageParams = {
  commitStagedPatches: () => Promise<void> | void;
  monacoEditorRef: React.MutableRefObject<any>;
  unsavedContent: string | null;
  saveFileRef: React.MutableRefObject<((contentToSave?: string | null) => Promise<void>) | null>;
  filePath: string;
  dependencyPaths: string[];
  setError: (error: string | null) => void;
  stageInsertBlock: (params: { targetId: string; mode: 'child' | 'sibling'; snippet: string; skipIframeInsert?: boolean }) => any;
  stageReparentBlock: (params: { sourceId: string; targetParentId: string; targetBeforeId?: string | null }) => void;
  setRenderVersion: React.Dispatch<React.SetStateAction<number>>;
  applyBlockPatch: (blockId: any, patch: any, isIntermediate?: boolean) => Promise<void>;
};

export function useEditorMessage({
  commitStagedPatches,
  monacoEditorRef,
  unsavedContent,
  saveFileRef,
  filePath,
  dependencyPaths,
  setError,
  stageInsertBlock,
  stageReparentBlock,
  setRenderVersion,
  applyBlockPatch,
}: UseEditorMessageParams) {
  const {
    viewMode,
    isModified,
    fileContent,
    setFileContent,
    setSelectedBlockIds,
    setSelectedBlock,
    setLivePosition,
    setLayersTree,
    setStyleSnapshots,
    setTextSnapshots,
    updateStagedComponentImports,
    setHasStagedChanges,
    fileType,
    selectedBlock,
    projectRoot,
    setExternalDropTargetState,
  } = useEditorStore();

  const handleEditorMessage = useCallback(
    async (event: any) => {
      const data = event?.nativeEvent?.data;
      if (!isMrpakMessage(data)) return;

      if (data.type === MRPAK_MSG.SAVE) {
        const state = useEditorStore.getState();
        if (state.hasStagedChanges) {
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
        setSelectedBlockIds(ids);
        setSelectedBlock({ id: data.id, meta: data.meta });
        setLivePosition({ left: null, top: null, width: null, height: null });
        return;
      }

      if (data.type === MRPAK_MSG.TREE) {
        if (data.tree) {
          const nextTree = enrichLayersTree(data.tree, filePath, dependencyPaths);
          setLayersTree(nextTree);
        }
        return;
      }

      if (data.type === MRPAK_MSG.STYLE_SNAPSHOT) {
        if (data.id) {
          setStyleSnapshots({
            ...useEditorStore.getState().styleSnapshots,
            [data.id]: (() => {
              const nextSnap = { inlineStyle: data.inlineStyle || '', computedStyle: data.computedStyle || null };
              const prevSnap = useEditorStore.getState().styleSnapshots?.[data.id];
              if (
                prevSnap &&
                prevSnap.inlineStyle === nextSnap.inlineStyle &&
                JSON.stringify(prevSnap.computedStyle || null) === JSON.stringify(nextSnap.computedStyle || null)
              ) {
                return prevSnap;
              }
              return nextSnap;
            })(),
          });
        }
        return;
      }

      if (data.type === MRPAK_MSG.TEXT_SNAPSHOT) {
        if (data.id) {
          setTextSnapshots({
            ...useEditorStore.getState().textSnapshots,
            [data.id]: useEditorStore.getState().textSnapshots?.[data.id] === (data.text ?? '')
              ? useEditorStore.getState().textSnapshots?.[data.id] || ''
              : (data.text ?? ''),
          });
        }
        return;
      }

      if (data.type === MRPAK_MSG.APPLY) {
        const id = data.id;
        const patch = data.patch || {};
        const isIntermediate = data.isIntermediate === true;
        if (!id) return;

        if (patch.__reparentTo) {
          stageReparentBlock({ sourceId: id, targetParentId: patch.__reparentTo });
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
            
            await stageInsertBlock({ targetId: id, mode: 'child', snippet, skipIframeInsert: true });
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
            setHasStagedChanges(true);
            const liveCode = monacoEditorRef?.current?.getValue?.();
            if (typeof liveCode === 'string' && liveCode.length > 0) {
              setFileContent(liveCode);
            }
            setRenderVersion((v) => v + 1);
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
            useEditorStore.getState().stagedComponentImports.forEach((item) => {
              if (item?.localName) usedNames.add(item.localName);
            });
            const localName = ensureUniqueImportName(baseName, usedNames);
            const snippet =
              fileType === 'react-native'
                ? `<Image source={${localName}} />`
                : `<img src={${localName}} alt=\"\" />`;

            await stageInsertBlock({ targetId: id, mode: 'child', snippet, skipIframeInsert: true });
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
            setHasStagedChanges(true);
            const liveCode = monacoEditorRef?.current?.getValue?.();
            if (typeof liveCode === 'string' && liveCode.length > 0) {
              setFileContent(liveCode);
            }
            setRenderVersion((v) => v + 1);
            return;
          }

          const rawTag = String(patch.__insertFromLibrary?.tag || '').trim();
          const normalizedTag = /^[A-Za-z][A-Za-z0-9_-]*$/.test(rawTag) ? rawTag : '';
          let tag = normalizedTag;
          if (!tag) {
            tag = fileType === 'react-native' ? 'View' : 'div';
          }
          const snippet = `<${tag}></${tag}>`;
          await stageInsertBlock({ targetId: id, mode: 'child', snippet });
          return;
        }

        if (isIntermediate && selectedBlock?.id === id) {
          setLivePosition({
            ...useEditorStore.getState().livePosition,
            left: (() => {
              const patchLeft = patch.marginLeft !== undefined ? patch.marginLeft : patch.left;
              if (patchLeft !== undefined) {
                const val = typeof patchLeft === 'string' ? parseFloat(patchLeft.replace('px', '')) : patchLeft;
                return !isNaN(val) ? val : useEditorStore.getState().livePosition.left;
              }
              return useEditorStore.getState().livePosition.left;
            })(),
            top: (() => {
              const patchTop = patch.marginTop !== undefined ? patch.marginTop : patch.top;
              if (patchTop !== undefined) {
                const val = typeof patchTop === 'string' ? parseFloat(patchTop.replace('px', '')) : patchTop;
                return !isNaN(val) ? val : useEditorStore.getState().livePosition.top;
              }
              return useEditorStore.getState().livePosition.top;
            })(),
            width: (() => {
              if (patch.width !== undefined) {
                const val = typeof patch.width === 'string' ? parseFloat(patch.width.replace('px', '')) : patch.width;
                return !isNaN(val) ? val : useEditorStore.getState().livePosition.width;
              }
              return useEditorStore.getState().livePosition.width;
            })(),
            height: (() => {
              if (patch.height !== undefined) {
                const val = typeof patch.height === 'string' ? parseFloat(patch.height.replace('px', '')) : patch.height;
                return !isNaN(val) ? val : useEditorStore.getState().livePosition.height;
              }
              return useEditorStore.getState().livePosition.height;
            })(),
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
      isModified,
      monacoEditorRef,
      projectRoot,
      saveFileRef,
      selectedBlock,
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
      stageInsertBlock,
      stageReparentBlock,
      unsavedContent,
      setHasStagedChanges,
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
