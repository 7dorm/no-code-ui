import { useCallback } from 'react';
import { readFile, writeFile as writeFileRaw } from '../../../shared/api/electron-api';
import { getFileType } from '../../../shared/lib/file-type-detector';
import { parseStyleImports } from '../../../blockEditor/PatchEngine';
import { formatContentForWrite } from '../utils';

type UseFileOperationsParams = {
  filePath: string;
  fileType: string | null;
  monacoEditorRef: React.MutableRefObject<any>;
  unsavedContent: string | null;
  fileContent: string | null;
  isUpdatingFromFileRef: React.MutableRefObject<boolean>;
  autoSaveTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setFileContent: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedBlock: React.Dispatch<React.SetStateAction<{ id: string; meta?: any } | null>>;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<string[]>>;
  setUnsavedContent: React.Dispatch<React.SetStateAction<string | null>>;
  setIsModified: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSaveIndicator: React.Dispatch<React.SetStateAction<boolean>>;
  setExternalStylesMap: React.Dispatch<React.SetStateAction<Record<string, { path: string; type: string }>>>;
};

export function useFileOperations({
  filePath,
  fileType,
  monacoEditorRef,
  unsavedContent,
  fileContent,
  isUpdatingFromFileRef,
  autoSaveTimeoutRef,
  setLoading,
  setError,
  setFileContent,
  setSelectedBlock,
  setSelectedBlockIds,
  setUnsavedContent,
  setIsModified,
  setShowSaveIndicator,
  setExternalStylesMap,
}: UseFileOperationsParams) {
  const writeFile = useCallback(async (targetPath: string, content: string, options: any = { backup: true }) => {
    const formatted = formatContentForWrite(targetPath, content);
    return writeFileRaw(targetPath, formatted, options);
  }, []);

  const handleEditorChange = useCallback((newValue: string) => {
    if (isUpdatingFromFileRef.current) {
      return;
    }
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    setUnsavedContent(newValue);
    setIsModified(true);
  }, [autoSaveTimeoutRef, isUpdatingFromFileRef, setIsModified, setUnsavedContent]);

  const saveFile = useCallback(async (contentToSave: string | null = null) => {
    if (!filePath) {
      return;
    }

    let content = contentToSave;
    if (content === null || content === undefined) {
      if (monacoEditorRef?.current) {
        try {
          content = monacoEditorRef.current.getValue();
        } catch {}
      }
      if (content === null || content === undefined) {
        content = unsavedContent !== null ? unsavedContent : fileContent;
      }
    }

    if (content === null || content === undefined) {
      return;
    }

    try {
      const writeRes = await writeFile(filePath, content, { backup: true });
      if (writeRes?.success) {
        setFileContent(content);
        setUnsavedContent(null);
        setIsModified(false);
        setShowSaveIndicator(true);
        setTimeout(() => setShowSaveIndicator(false), 2000);

        if (fileType === 'react' || fileType === 'react-native') {
          const imports = parseStyleImports(content) as Record<string, { path: string; type: string }>;
          setExternalStylesMap(imports);
        }
      } else {
        const errorMsg = `File save error: ${writeRes?.error || 'Unknown error'}`;
        setError(errorMsg);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`File save error: ${errorMessage}`);
    }
  }, [
    fileContent,
    filePath,
    fileType,
    monacoEditorRef,
    setError,
    setExternalStylesMap,
    setFileContent,
    setIsModified,
    setShowSaveIndicator,
    setUnsavedContent,
    unsavedContent,
    writeFile,
  ]);

  const loadFile = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setFileContent(null);
    setSelectedBlock(null);
    setSelectedBlockIds([]);
    setUnsavedContent(null);
    setIsModified(false);

    try {
      const result = await readFile(path);
      if (result.success) {
        setFileContent(result.content || '');
        setUnsavedContent(null);
        setIsModified(false);

        const type = getFileType(path, result.content);
        if (type === 'react' || type === 'react-native') {
          const imports = parseStyleImports(result.content || '') as Record<string, { path: string; type: string }>;
          setExternalStylesMap(imports);
        } else {
          setExternalStylesMap({});
        }
      } else {
        setError(`File read error: ${result.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [
    setLoading,
    setError,
    setFileContent,
    setSelectedBlock,
    setSelectedBlockIds,
    setUnsavedContent,
    setIsModified,
    setExternalStylesMap,
  ]);

  return {
    writeFile,
    handleEditorChange,
    saveFile,
    loadFile,
  };
}
