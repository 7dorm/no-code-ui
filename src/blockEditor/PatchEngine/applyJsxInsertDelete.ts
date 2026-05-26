type JsxMapEntry = {
  start: number;
  end: number;
  tagName: string;
  [key: string]: unknown;
};

type ComponentInfo = {
  type: 'function' | 'arrow' | 'class';
  name: string;
  bodyStart: number;
  bodyEnd: number;
};

type PatchResult =
  | { ok: true; code: string; changed: true }
  | { ok: false; error: string };

function isTagChar(ch: string) {
  return /[A-Za-z0-9_$.-]/.test(ch);
}

function findMatchingBrace(src: string, from: number, openCh: string, closeCh: string) {
  let i = from;
  let depth = 0;
  let inS: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (inS) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inS) inS = null;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inS = ch;
      i++;
      continue;
    }

    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }

    i++;
  }

  return -1;
}

function findContainingComponent(code: string, position: number): ComponentInfo | null {
  const src = String(code || '');
  if (position < 0 || position > src.length) return null;

  let bestMatch: ComponentInfo | null = null;
  let bestStart = -1;
  let match: RegExpExecArray | null;

  const functionRegex = /function\s+([A-Z][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g;
  while ((match = functionRegex.exec(src)) !== null) {
    const funcStart = match.index;
    const bodyStart = src.indexOf('{', funcStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    const bodyEnd = findMatchingBrace(src, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    if (funcStart < position && position < bodyEnd && funcStart > bestStart) {
      bestMatch = { type: 'function', name: match[1], bodyStart: bodyStart + 1, bodyEnd };
      bestStart = funcStart;
    }
  }

  const arrowRegex = /const\s+([A-Z][A-Za-z0-9_$]*)\s*=\s*\([^)]*\)\s*=>\s*\{/g;
  while ((match = arrowRegex.exec(src)) !== null) {
    const arrowStart = match.index;
    const bodyStart = src.indexOf('{', arrowStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    const bodyEnd = findMatchingBrace(src, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    if (arrowStart < position && position < bodyEnd && arrowStart > bestStart) {
      bestMatch = { type: 'arrow', name: match[1], bodyStart: bodyStart + 1, bodyEnd };
      bestStart = arrowStart;
    }
  }

  const constFunctionRegex = /const\s+([A-Z][A-Za-z0-9_$]*)\s*=\s*function\s*\([^)]*\)\s*\{/g;
  while ((match = constFunctionRegex.exec(src)) !== null) {
    const funcStart = match.index;
    const bodyStart = src.indexOf('{', funcStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    const bodyEnd = findMatchingBrace(src, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    if (funcStart < position && position < bodyEnd && funcStart > bestStart) {
      bestMatch = { type: 'function', name: match[1], bodyStart: bodyStart + 1, bodyEnd };
      bestStart = funcStart;
    }
  }

  const classRegex = /class\s+([A-Z][A-Za-z0-9_$]*)\s*\{/g;
  while ((match = classRegex.exec(src)) !== null) {
    const classStart = match.index;
    const bodyStart = src.indexOf('{', classStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    const bodyEnd = findMatchingBrace(src, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    if (classStart < position && position < bodyEnd && classStart > bestStart) {
      bestMatch = { type: 'class', name: match[1], bodyStart: bodyStart + 1, bodyEnd };
      bestStart = classStart;
    }
  }

  return bestMatch;
}

function findNextLt(src: string, from: number) {
  let i = from;
  let inS: string | null = null;
  let inLine = false;
  let inBlock = false;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (inLine) {
      if (ch === '\n') inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inS) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inS) inS = null;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inS = ch;
      i++;
      continue;
    }
    if (ch === '<') return i;
    i++;
  }
  return -1;
}

function readTagName(src: string, ltIndex: number): { name: string; closing: boolean } | null {
  let i = ltIndex + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  let closing = false;
  if (src[i] === '/') {
    closing = true;
    i++;
    while (i < src.length && /\s/.test(src[i])) i++;
  }
  const start = i;
  if (!/[A-Za-z_$]/.test(src[i])) return null;
  i++;
  while (i < src.length && isTagChar(src[i])) i++;
  const name = src.slice(start, i);
  return { name, closing };
}

function isSelfClosing(openTagText: string) {
  return /\/>\s*$/.test(openTagText);
}

function findMatchingCloseTag(src: string, openEnd: number, tagName: string) {
  let depth = 1;
  let i = openEnd;
  while (i < src.length) {
    const lt = findNextLt(src, i);
    if (lt < 0) return -1;
    const info = readTagName(src, lt);
    if (!info || info.name !== tagName) {
      i = lt + 1;
      continue;
    }
    if (info.closing) {
      depth--;
      if (depth === 0) {
        const gt = src.indexOf('>', lt);
        return gt >= 0 ? gt + 1 : -1;
      }
    } else {
      const gt = src.indexOf('>', lt);
      if (gt < 0) return -1;
      const openTag = src.slice(lt, gt + 1);
      if (!isSelfClosing(openTag)) depth++;
    }
    i = lt + 1;
  }
  return -1;
}

export function findJsxElementRange({ code, entry }: { code: string; entry: JsxMapEntry | null | undefined }) {
  const src = String(code ?? '');
  const start = entry?.start;
  const end = entry?.end;
  const tagName = entry?.tagName;
  if (typeof start !== 'number' || typeof end !== 'number' || !tagName) return null;
  const openTag = src.slice(start, end);
  if (isSelfClosing(openTag)) return { start, end };
  const closeEnd = findMatchingCloseTag(src, end, tagName);
  if (closeEnd < 0) return null;
  return { start, end: closeEnd };
}

export function applyJsxDelete({ code, entry }: { code: string; entry: JsxMapEntry | null | undefined }): PatchResult {
  const src = String(code ?? '');
  const range = findJsxElementRange({ code: src, entry });
  if (!range) return { ok: false, error: 'applyJsxDelete: cannot find element range' };
  const out = src.slice(0, range.start) + src.slice(range.end);
  return { ok: true, code: out, changed: true };
}

function extractHandlerName(snippet: string) {
  const snip = String(snippet || '');
  const onClickMatch = snip.match(/\bonClick\s*=\s*\{([A-Za-z_$][A-Za-z0-9_$]*)\}/);
  if (onClickMatch) return onClickMatch[1];
  const onPressMatch = snip.match(/\bonPress\s*=\s*\{([A-Za-z_$][A-Za-z0-9_$]*)\}/);
  if (onPressMatch) return onPressMatch[1];
  return null;
}

function findReturnPosition(src: string, bodyStart: number, bodyEnd: number) {
  let i = bodyStart;
  let inS: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < bodyEnd) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (inS) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inS) inS = null;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inS = ch;
      i++;
      continue;
    }

    if (
      src.slice(i, i + 6) === 'return' &&
      (i === bodyStart || /\s/.test(src[i - 1])) &&
      (i + 6 >= bodyEnd || /[\s(]/.test(src[i + 6]))
    ) {
      return i;
    }

    i++;
  }

  return -1;
}

export function applyJsxInsert({
  code,
  entry,
  mode,
  snippet,
}: {
  code: string;
  entry: JsxMapEntry;
  mode: 'child' | 'sibling';
  snippet: string;
}): PatchResult {
  const src = String(code ?? '');
  const handlerName = extractHandlerName(snippet);
  let newCode = src;
  let handlerOffset = 0;
  let handlerInsertPos = -1;

  if (handlerName) {
    const initialRange = findJsxElementRange({ code: src, entry });
    if (initialRange) {
      const searchPosition = mode === 'sibling' ? initialRange.end : initialRange.start;
      const component = findContainingComponent(src, searchPosition);

      if (component) {
        const handlerRegex = new RegExp(`(?:const|let|var|function)\\s+${handlerName}\\s*[=(]`);
        if (!handlerRegex.test(src.slice(component.bodyStart, component.bodyEnd))) {
          const returnPos = findReturnPosition(src, component.bodyStart, component.bodyEnd);
          let insertPos: number;
          let handlerCode: string;

          if (returnPos >= 0) {
            insertPos = returnPos;
            handlerCode = `  const ${handlerName} = () => {\n    // TODO: реализовать обработчик\n  };\n\n`;
          } else {
            insertPos = component.bodyStart;
            handlerCode = `  const ${handlerName} = () => {\n    // TODO: реализовать обработчик\n  };\n\n  `;
          }

          handlerInsertPos = insertPos;
          newCode = newCode.slice(0, insertPos) + handlerCode + newCode.slice(insertPos);
          handlerOffset = handlerCode.length;
        }
      }
    }
  }

  let adjustedEntry = entry;
  if (handlerOffset > 0 && handlerInsertPos >= 0 && handlerInsertPos < entry.start) {
    adjustedEntry = {
      ...entry,
      start: entry.start + handlerOffset,
      end: entry.end + handlerOffset,
    };
  }

  let range = findJsxElementRange({ code: newCode, entry: adjustedEntry });
  if (!range) {
    range = findJsxElementRange({ code: newCode, entry });
    if (!range) return { ok: false, error: 'applyJsxInsert: cannot find element range after handler insertion' };
    adjustedEntry = entry;
  }

  const openTag = newCode.slice(adjustedEntry.start, adjustedEntry.end);
  if (isSelfClosing(openTag) && mode === 'child') {
    return { ok: false, error: 'applyJsxInsert: cannot insert child into self-closing tag' };
  }

  const insertText = `\n${String(snippet || '').trim()}\n`;
  if (mode === 'sibling') {
    const out = newCode.slice(0, range.end) + insertText + newCode.slice(range.end);
    return { ok: true, code: out, changed: true };
  }

  const closeTagStart = newCode.lastIndexOf(`</${adjustedEntry.tagName}`, range.end);
  if (closeTagStart < 0) return { ok: false, error: 'applyJsxInsert: closing tag not found' };
  const out = newCode.slice(0, closeTagStart) + insertText + newCode.slice(closeTagStart);
  return { ok: true, code: out, changed: true };
}

export function applyJsxReparent({
  code,
  sourceEntry,
  targetEntry,
  targetBeforeEntry,
  targetBeforeId,
}: {
  code: string;
  sourceEntry: JsxMapEntry;
  targetEntry: JsxMapEntry;
  targetBeforeEntry?: JsxMapEntry | null;
  targetBeforeId?: string | null;
}): PatchResult {
  const src = String(code ?? '');
  const sourceRange = findJsxElementRange({ code: src, entry: sourceEntry });
  const targetRange = findJsxElementRange({ code: src, entry: targetEntry });
  const beforeRange = targetBeforeEntry ? findJsxElementRange({ code: src, entry: targetBeforeEntry }) : null;
  if (!sourceRange || !targetRange) return { ok: false, error: 'applyJsxReparent: cannot resolve ranges' };
  if (targetBeforeId && !beforeRange) return { ok: false, error: 'applyJsxReparent: targetBefore range not found' };
  if (targetRange.start >= sourceRange.start && targetRange.end <= sourceRange.end) {
    return { ok: false, error: 'applyJsxReparent: cannot move into own descendant' };
  }

  const extracted = src.slice(sourceRange.start, sourceRange.end);
  const removed = src.slice(0, sourceRange.start) + src.slice(sourceRange.end);

  let insertPosOriginal = -1;
  if (beforeRange) {
    insertPosOriginal = beforeRange.start;
  } else {
    const closeTagStart = src.lastIndexOf(`</${targetEntry.tagName}`, targetRange.end);
    if (closeTagStart < 0) return { ok: false, error: 'applyJsxReparent: target closing tag not found' };
    insertPosOriginal = closeTagStart;
  }

  const delta = sourceRange.end - sourceRange.start;
  const insertPos = sourceRange.start < insertPosOriginal ? insertPosOriginal - delta : insertPosOriginal;
  const insertText = `\n${extracted}\n`;
  const out = removed.slice(0, insertPos) + insertText + removed.slice(insertPos);
  return { ok: true, code: out, changed: true };
}

export function applyJsxSetText({
  code,
  entry,
  text,
}: {
  code: string;
  entry: JsxMapEntry;
  text: string;
}): PatchResult {
  const source = String(code ?? '');
  const start = entry?.start;
  const end = entry?.end;
  if (typeof start !== 'number' || typeof end !== 'number') {
    return { ok: false, error: 'applyJsxSetText: invalid entry {start,end}' };
  }
  if (start < 0 || end > source.length || start >= end) {
    return { ok: false, error: 'applyJsxSetText: entry range out of bounds' };
  }

  const openTag = source.slice(start, end);
  if (!openTag.startsWith('<')) return { ok: false, error: 'applyJsxSetText: entry is not an opening tag' };
  if (openTag.trim().endsWith('/>')) {
    return { ok: false, error: 'applyJsxSetText: self-closing tag has no text content' };
  }

  const tagMatch = openTag.match(/^<([A-Za-z][A-Za-z0-9]*)/);
  if (!tagMatch) return { ok: false, error: 'applyJsxSetText: cannot parse tag name' };
  const tagName = tagMatch[1];

  let pos = end;
  let depth = 1;
  while (pos < source.length && depth > 0) {
    const nextOpen = source.indexOf(`<${tagName}`, pos);
    const nextClose = source.indexOf(`</${tagName}`, pos);

    if (nextClose === -1) return { ok: false, error: 'applyJsxSetText: closing tag not found' };

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 1;
    } else {
      depth--;
      if (depth === 0) {
        const newText = String(text ?? '').trim();
        const out = source.slice(0, end) + newText + source.slice(nextClose);
        return { ok: true, code: out, changed: true };
      }
      pos = nextClose + 1;
    }
  }

  return { ok: false, error: 'applyJsxSetText: cannot find text content range' };
}
