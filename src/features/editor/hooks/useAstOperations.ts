import { useEffect } from 'react';
import { loadLayerNames } from '../../../blockEditor/LayerNamesStore';
import { AstBidirectionalManager } from '../../../blockEditor/AstBidirectional';
import { useEditorStore } from '../../../store/editorStore';
import { findProjectRoot } from '../lib/path-resolver';

type UseAstOperationsParams = {
  filePath: string;
  astManagerRef: React.MutableRefObject<AstBidirectionalManager | null>;
};

export function useAstOperations({
  filePath,
  astManagerRef,
}: UseAstOperationsParams) {
  const {
    viewMode,
    fileType,
    fileContent,
    projectRoot,
    setProjectRoot,
    setLayerNames,
  } = useEditorStore();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (viewMode !== 'split' || !filePath) {
        return;
      }
      try {
        let root = projectRoot;

        if (!root && filePath) {
          const normalizedPath = filePath.replace(/\\/g, '/');
          const lastSlash = normalizedPath.lastIndexOf('/');
          if (lastSlash > 0) {
            root = normalizedPath.substring(0, lastSlash);
            if (root.endsWith('/src')) {
              root = root.substring(0, root.length - 4);
            }
          }
        }

        if (!root) {
          root = await findProjectRoot(filePath);
        }

        if (cancelled) return;
        setProjectRoot(root);
        if (root) {
          const res = await loadLayerNames({ projectRoot: root, targetFilePath: filePath });
          if (!cancelled && res?.ok) {
            setLayerNames(res.names || {});
          }

          if ((fileType === 'react' || fileType === 'react-native') && fileContent) {
            const manager = new AstBidirectionalManager(filePath, root);
            const initResult = await manager.initializeFromCode(String(fileContent));
            if (initResult.ok) {
              astManagerRef.current = manager;
            } else {
              astManagerRef.current = null;
            }
          }
        } else {
          astManagerRef.current = null;
        }
      } catch {
        // ignore init errors, RenderFile handles runtime fallbacks
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [viewMode, filePath, projectRoot, fileType, fileContent, setProjectRoot, setLayerNames, astManagerRef]);
}
