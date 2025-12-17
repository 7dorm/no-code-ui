import { applyJsxStylePatch } from './applyJsxStylePatch';
import { applyHtmlStylePatch } from './applyHtmlStylePatch';
import { parseStyleImports } from './parseStyleImports';
import { applyExternalStylePatch } from './applyExternalStylePatch';

export function applyStylePatch({ fileType, fileContent, mapEntry, patch, externalStylesMap }) {
  if (!mapEntry) {
    return { ok: false, error: 'applyStylePatch: mapEntry is required' };
  }

  if (fileType === 'html') {
    return applyHtmlStylePatch({
      html: fileContent,
      selector: mapEntry.selector,
      patch,
    });
  }

  if (fileType === 'react' || fileType === 'react-native') {
    return applyJsxStylePatch({
      code: fileContent,
      target: { start: mapEntry.start, end: mapEntry.end },
      patch,
      externalStylesMap,
    });
  }

  return { ok: false, error: `applyStylePatch: unsupported fileType: ${fileType}` };
}

export { applyHtmlOp } from './applyHtmlInsertDelete';
export { applyJsxDelete, applyJsxInsert, applyJsxReparent, applyJsxSetText, findJsxElementRange } from './applyJsxInsertDelete';
export { parseStyleImports, extractStyleReference } from './parseStyleImports';
export { applyExternalStylePatch } from './applyExternalStylePatch';
export { replaceStyleReferenceInJsx } from './applyJsxStylePatch';


