import { useEffect } from 'react';
import { createFramework } from '../../../frameworks/FrameworkFactory';

type UsePreviewGenerationParams = {
  fileType: string | null;
  filePath: string;
  fileContent: string | null;
  previewSourceCode: string;
  viewMode: 'preview' | 'split' | 'changes';
  projectRoot: string | null;
  selectedComponentName?: string | null;
  aggressivePreviewMode?: boolean;
  setIsProcessingReact: React.Dispatch<React.SetStateAction<boolean>>;
  setReactHTML: React.Dispatch<React.SetStateAction<string>>;
  setDependencyPaths: React.Dispatch<React.SetStateAction<string[]>>;
  setBlockMap: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setBlockMapForFile: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setPreviewOpenError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsProcessingReactNative: React.Dispatch<React.SetStateAction<boolean>>;
  setReactNativeHTML: React.Dispatch<React.SetStateAction<string>>;
  setIsProcessingHTML: React.Dispatch<React.SetStateAction<boolean>>;
  setProcessedHTML: React.Dispatch<React.SetStateAction<string>>;
  setHtmlDependencyPaths: React.Dispatch<React.SetStateAction<string[]>>;
};

export function usePreviewGeneration({
  fileType,
  filePath,
  fileContent,
  previewSourceCode,
  viewMode,
  projectRoot,
  selectedComponentName,
  aggressivePreviewMode = false,
  setIsProcessingReact,
  setReactHTML,
  setDependencyPaths,
  setBlockMap,
  setBlockMapForFile,
  setPreviewOpenError,
  setIsProcessingReactNative,
  setReactNativeHTML,
  setIsProcessingHTML,
  setProcessedHTML,
  setHtmlDependencyPaths,
}: UsePreviewGenerationParams) {
  useEffect(() => {
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
      void generateHTML();
    } else {
      setReactHTML('');
      setIsProcessingReact(false);
      setDependencyPaths([]);
    }
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
    if (fileType === 'html' && fileContent && filePath) {
      const processHTML = async () => {
        setIsProcessingHTML(true);
        try {
          const framework = createFramework('html', filePath);
          const result = await framework.generateHTML(fileContent, filePath, { viewMode, projectRoot: '' });
          setProcessedHTML(result.html);
          setHtmlDependencyPaths(result.dependencyPaths);
          setBlockMap(result.blockMapForEditor || {});
          setBlockMapForFile(result.blockMapForFile || {});
        } catch {
          setProcessedHTML(fileContent);
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
  }, [fileType, fileContent, filePath, viewMode, setBlockMap, setBlockMapForFile, setHtmlDependencyPaths, setIsProcessingHTML, setProcessedHTML]);
}

