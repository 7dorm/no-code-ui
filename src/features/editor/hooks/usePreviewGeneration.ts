import { useEffect } from 'react';
import { createFramework } from '../../../frameworks/FrameworkFactory';
import { useEditorStore } from '../../../store/editorStore';

type UsePreviewGenerationParams = {
  filePath: string;
  previewSourceCode: string;
  selectedComponentName?: string | null;
  aggressivePreviewMode?: boolean;
  setIsProcessingReact: React.Dispatch<React.SetStateAction<boolean>>;
  setReactHTML: React.Dispatch<React.SetStateAction<string>>;
  setDependencyPaths: React.Dispatch<React.SetStateAction<string[]>>;
  setPreviewOpenError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsProcessingReactNative: React.Dispatch<React.SetStateAction<boolean>>;
  setReactNativeHTML: React.Dispatch<React.SetStateAction<string>>;
  setIsProcessingHTML: React.Dispatch<React.SetStateAction<boolean>>;
  setProcessedHTML: React.Dispatch<React.SetStateAction<string>>;
  setHtmlDependencyPaths: React.Dispatch<React.SetStateAction<string[]>>;
};

export function usePreviewGeneration({
  filePath,
  previewSourceCode,
  selectedComponentName,
  aggressivePreviewMode = false,
  setIsProcessingReact,
  setReactHTML,
  setDependencyPaths,
  setPreviewOpenError,
  setIsProcessingReactNative,
  setReactNativeHTML,
  setIsProcessingHTML,
  setProcessedHTML,
  setHtmlDependencyPaths,
}: UsePreviewGenerationParams) {
  const {
    fileType,
    fileContent,
    viewMode,
    projectRoot,
    setBlockMap,
    setBlockMapForFile,
  } = useEditorStore();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    
    if (fileType === 'react' && previewSourceCode && filePath) {
      const generateHTML = async () => {
        setIsProcessingReact(true);
        try {
          const framework = createFramework('react', filePath);
          const result = await framework.generateHTML(previewSourceCode, filePath, {
            viewMode,
            projectRoot: projectRoot || undefined,
            selectedComponentName,
            aggressivePreviewMode,
          });
          setReactHTML(result.html);
          setBlockMap(result.blockMapForEditor || {});
          setBlockMapForFile(result.blockMapForFile || {});
          setDependencyPaths(result.dependencyPaths);
          setPreviewOpenError(null);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setPreviewOpenError(errorMessage);
          setReactHTML(`<html><body><div class="error">Processing error: ${errorMessage}</div></body></html>`);
          setDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingReact(false);
        }
      };
      
      // Keep split-mode preview reactive while still avoiding constant iframe reloads.
      const debounceMs = viewMode === 'split' ? 120 : 350;
      timer = setTimeout(() => {
        const state = useEditorStore.getState();
        if (state.skipPreviewGeneration) {
          useEditorStore.setState({ skipPreviewGeneration: false });
          return;
        }
        void generateHTML();
      }, debounceMs);
    } else {
      setReactHTML('');
      setIsProcessingReact(false);
      setDependencyPaths([]);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [fileType, previewSourceCode, filePath, viewMode, projectRoot, selectedComponentName, aggressivePreviewMode, setBlockMap, setBlockMapForFile, setDependencyPaths, setIsProcessingReact, setPreviewOpenError, setReactHTML]);

  useEffect(() => {
    if (fileType === 'react-native' && previewSourceCode && filePath) {
      const generateHTML = async () => {
        setIsProcessingReactNative(true);
        try {
          const framework = createFramework('react-native', filePath);
          const result = await framework.generateHTML(previewSourceCode, filePath, {
            viewMode,
            projectRoot: projectRoot || undefined,
            selectedComponentName,
            aggressivePreviewMode,
          });
          setReactNativeHTML(result.html);
          setBlockMap(result.blockMapForEditor || {});
          setBlockMapForFile(result.blockMapForFile || {});
          setDependencyPaths(result.dependencyPaths);
          setPreviewOpenError(null);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setPreviewOpenError(errorMessage);
          setReactNativeHTML(`<html><body><div class="error">Processing error: ${errorMessage}</div></body></html>`);
          setDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingReactNative(false);
        }
      };
      void generateHTML();
    } else {
      setReactNativeHTML('');
      setIsProcessingReactNative(false);
      setDependencyPaths([]);
    }
  }, [fileType, previewSourceCode, filePath, viewMode, projectRoot, selectedComponentName, aggressivePreviewMode, setBlockMap, setBlockMapForFile, setDependencyPaths, setIsProcessingReactNative, setPreviewOpenError, setReactNativeHTML]);

  useEffect(() => {
    if (fileType === 'html' && previewSourceCode && filePath) {
      const processHTML = async () => {
        setIsProcessingHTML(true);
        try {
          const framework = createFramework('html', filePath);
          const result = await framework.generateHTML(previewSourceCode, filePath, { viewMode, projectRoot: '' });
          setProcessedHTML(result.html);
          setHtmlDependencyPaths(result.dependencyPaths);
          setBlockMap(result.blockMapForEditor || {});
          setBlockMapForFile(result.blockMapForFile || {});
        } catch {
          setProcessedHTML(previewSourceCode);
          setHtmlDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingHTML(false);
        }
      };
      void processHTML();
    } else {
      setProcessedHTML('');
      setHtmlDependencyPaths([]);
      setIsProcessingHTML(false);
    }
  }, [fileType, previewSourceCode, filePath, viewMode, setBlockMap, setBlockMapForFile, setHtmlDependencyPaths, setIsProcessingHTML, setProcessedHTML]);
}
