import { useEffect } from 'react';
import { instrumentHtml } from '../../../blockEditor/HtmlInstrumenter';
import { useEditorStore } from '../../../store/editorStore';
import { injectBlockEditorScript } from '../lib/block-editor-script';
import { getPathBasename } from '../utils';

type UseSplitEditorHtmlParams = {
  filePath: string;
  processedHTML: string;
  reactHTML: string;
  reactNativeHTML: string;
};

export function useSplitEditorHtml({
  filePath,
  processedHTML,
  reactHTML,
  reactNativeHTML,
}: UseSplitEditorHtmlParams) {
  const {
    viewMode,
    fileType,
    fileContent,
    setEditorHTML,
    setBlockMap,
    setBlockMapForFile,
  } = useEditorStore();

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
        setEditorHTML(nextHtml);
        return;
      }

      if (fileType === 'react' && reactHTML) {
        const nextHtml = injectBlockEditorScript(reactHTML, 'react', 'edit', getPathBasename(filePath));
        setEditorHTML(nextHtml);
        return;
      }

      if (fileType === 'react-native' && reactNativeHTML) {
        const nextHtml = injectBlockEditorScript(reactNativeHTML, 'react-native', 'edit', getPathBasename(filePath));
        setEditorHTML(nextHtml);
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
