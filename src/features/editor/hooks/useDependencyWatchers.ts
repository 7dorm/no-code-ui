import { useEffect } from 'react';
import { onFileChanged, readFile, unwatchFile, watchFile } from '../../../shared/api/electron-api';
import { useEditorStore } from '../../../store/editorStore';

type UseDependencyWatchersParams = {
  filePath: string;
  dependencyPaths: string[];
  htmlDependencyPaths: string[];
  loadFile: (targetFilePath: string) => Promise<void> | void;
};

export function useDependencyWatchers({
  filePath,
  dependencyPaths,
  htmlDependencyPaths,
  loadFile,
}: UseDependencyWatchersParams) {
  const { fileType, setFileContent } = useEditorStore();

  useEffect(() => {
    if (!filePath || dependencyPaths.length === 0) return;

    const unsubscribers: Array<() => void> = [];
    const handleDependencyChanged = (changedFilePath: string) => {
      if (loadFile) loadFile(filePath);
    };

    dependencyPaths.forEach((depPath) => {
      watchFile(depPath).then(() => {});
      const unsubscribe: () => void = onFileChanged((changedFilePath: string) => {
        if (changedFilePath === depPath) handleDependencyChanged(changedFilePath);
      }) as unknown as () => void;
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
      dependencyPaths.forEach((depPath: string) => {
        unwatchFile(depPath);
      });
    };
  }, [dependencyPaths, filePath, loadFile]);

  useEffect(() => {
    if (!filePath || htmlDependencyPaths.length === 0 || fileType !== 'html') return;

    const unsubscribers: Array<() => void> = [];
    const handleDependencyChanged = (_changedFilePath: string) => {
      const currentPath = filePath;
      readFile(currentPath).then((result) => {
        if (result.success) setFileContent(result.content || '');
      });
    };

    htmlDependencyPaths.forEach((depPath) => {
      watchFile(depPath).then(() => {});
      const unsubscribe = onFileChanged((changedFilePath: string) => {
        if (changedFilePath === depPath) handleDependencyChanged(changedFilePath);
      });
      unsubscribers.push(unsubscribe as () => void);
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
      htmlDependencyPaths.forEach((depPath: string) => {
        unwatchFile(depPath);
      });
    };
  }, [htmlDependencyPaths, filePath, fileType, setFileContent]);
}
