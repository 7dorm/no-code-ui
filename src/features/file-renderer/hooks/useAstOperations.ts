import { useEffect } from 'react';
import { loadLayerNames } from '../../../blockEditor/LayerNamesStore';
import { AstBidirectionalManager } from '../../../blockEditor/AstBidirectional';
import { findProjectRoot } from '../lib/path-resolver';
import { resolveProjectRootSync } from '../utils';
import type { LayerNames } from '../types';

type UseAstOperationsParams = {
  viewMode: 'preview' | 'split' | 'changes';
  filePath: string;
  projectPath: string | null;
  fileType: string | null;
  fileContent: string | null;
  setProjectRoot: React.Dispatch<React.SetStateAction<string | null>>;
  setLayerNames: React.Dispatch<React.SetStateAction<LayerNames>>;
  astManagerRef: React.MutableRefObject<AstBidirectionalManager | null>;
};

export function useAstOperations({
  viewMode,
  filePath,
  projectPath,
  fileType,
  fileContent,
  setProjectRoot,
  setLayerNames,
  astManagerRef,
}: UseAstOperationsParams) {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (viewMode !== 'split' || !filePath) {
        return;
      }
      try {
        let root = resolveProjectRootSync(filePath, projectPath);
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
  }, [viewMode, filePath, projectPath, fileType, fileContent, setProjectRoot, setLayerNames, astManagerRef]);
}
