import { useEffect } from 'react';
import { instrumentHtml } from '../../../blockEditor/HtmlInstrumenter';
import { injectBlockEditorScript } from '../lib/block-editor-script';
import { getPathBasename } from '../utils';

type UseSplitEditorHtmlParams = {
  viewMode: 'preview' | 'split' | 'changes';
  fileType: string | null;
  filePath: string;
  fileContent: string | null;
  processedHTML: string;
  reactHTML: string;
  reactNativeHTML: string;
  setEditorHTML: React.Dispatch<React.SetStateAction<string>>;
  setBlockMap: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setBlockMapForFile: React.Dispatch<React.SetStateAction<Record<string, any>>>;
};

export function useSplitEditorHtml({
  viewMode,
  fileType,
  filePath,
  fileContent,
  processedHTML,
  reactHTML,
  reactNativeHTML,
  setEditorHTML,
  setBlockMap,
  setBlockMapForFile,
}: UseSplitEditorHtmlParams) {
  useEffect(() => {
    if (viewMode !== 'split') {
      setEditorHTML('');
      return;
    }

    try {
      if (fileType === 'html') {
        const base = processedHTML || fileContent || '';
        const inst = instrumentHtml(base, filePath);
        setBlockMap(inst.map || {});
        setBlockMapForFile(inst.map || {});
        const nextHtml = injectBlockEditorScript(inst.html, 'html', 'edit', getPathBasename(filePath));
        setEditorHTML((prev) => (prev === nextHtml ? prev : nextHtml));
        return;
      }

      if (fileType === 'react' && reactHTML) {
        const nextHtml = injectBlockEditorScript(reactHTML, 'react', 'edit', getPathBasename(filePath));
        setEditorHTML((prev) => (prev === nextHtml ? prev : nextHtml));
        return;
      }

      if (fileType === 'react-native' && reactNativeHTML) {
        const nextHtml = injectBlockEditorScript(reactNativeHTML, 'react-native', 'edit', getPathBasename(filePath));
        setEditorHTML((prev) => (prev === nextHtml ? prev : nextHtml));
        return;
      }
    } catch {
      setEditorHTML('');
    }
  }, [
    viewMode,
    fileType,
    filePath,
    fileContent,
    processedHTML,
    reactHTML,
    reactNativeHTML,
    setEditorHTML,
    setBlockMap,
    setBlockMapForFile,
  ]);
}

