import { extractStyleReference } from './parseStyleImports';

type StylePatch = Record<string, unknown>;
type StyleTarget = { start: number; end: number };
type ExternalStylesMap = Record<string, { path: string; type: string }>;

type PatchOk = { ok: true; code: string; changed: true };
type PatchErr = { ok: false; error: string };
type PatchRes = PatchOk | PatchErr;

function findMatching(src: string, from: number, openCh: string, closeCh: string) {
  let i = from;
  let depth = 0;
  let inS: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inS) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inS) {
        inS = null;
        i++;
        continue;
      }
      if (inS === '`' && ch === '$' && next === '{') {
        const endExpr = findMatching(src, i + 2, '{', '}');
        if (endExpr < 0) return -1;
        i = endExpr + 1;
        continue;
      }
      i++;
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

function parseSimpleObjectLiteral(text: string) {
  const src = String(text || '').trim();
  const map: Record<string, string> = {};
  if (!src) return map;

  let i = 0;
  let key = '';
  let val = '';
  let mode: 'key' | 'val' = 'key';
  let inS: string | null = null;
  let depth = 0;

  const flush = () => {
    const k = key.trim().replace(/^['"]|['"]$/g, '');
    const v = val.trim();
    if (k) map[k] = v;
    key = '';
    val = '';
    mode = 'key';
  };

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inS) {
      if (ch === '\\') {
        if (mode === 'key') key += ch + (next || '');
        else val += ch + (next || '');
        i += 2;
        continue;
      }
      if (mode === 'key') key += ch;
      else val += ch;
      if (ch === inS) inS = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inS = ch;
      if (mode === 'key') key += ch;
      else val += ch;
      i++;
      continue;
    }

    if (ch === '{' || ch === '[' || ch === '(') depth++;
    if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1);

    if (depth === 0 && mode === 'key' && ch === ':') {
      mode = 'val';
      i++;
      continue;
    }

    if (depth === 0 && mode === 'val' && ch === ',') {
      flush();
      i++;
      continue;
    }

    if (mode === 'key') key += ch;
    else val += ch;
    i++;
  }
  if (key.trim()) flush();
  return map;
}

function serializeObjectLiteral(map: Record<string, string>) {
  return Object.entries(map).map(([k, v]) => `${k}: ${v}`).join(', ');
}

function jsValueLiteral(v: unknown) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v == null) return 'null';
  const s = String(v);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s;
  return JSON.stringify(s);
}

function upsertIntoObjectText(objectInner: string, patch: StylePatch) {
  const obj = parseSimpleObjectLiteral(objectInner);
  for (const [k, v] of Object.entries(patch || {})) {
    obj[k] = jsValueLiteral(v);
  }
  return serializeObjectLiteral(obj);
}

function findStyleAttrRangeInOpeningTag(openTagText: string) {
  const idx = openTagText.search(/\bstyle\s*=/);
  if (idx < 0) return null;

  let i = idx;
  while (i < openTagText.length && openTagText[i] !== '=') i++;
  if (i >= openTagText.length) return null;
  i++;
  while (i < openTagText.length && /\s/.test(openTagText[i])) i++;
  const valStart = i;

  if (openTagText[valStart] === '{') {
    const end = findMatching(openTagText, valStart, '{', '}');
    if (end < 0) return null;
    return { attrStart: idx, valueStart: valStart, valueEnd: end + 1 };
  }
  return null;
}

function patchOpeningTagStyle(openTagText: string, patch: StylePatch): { ok: true; text: string } | PatchErr {
  const range = findStyleAttrRangeInOpeningTag(openTagText);
  if (range) {
    const valueText = openTagText.slice(range.valueStart, range.valueEnd);
    const dbl = valueText.match(/^\{\s*\{([\s\S]*)\}\s*\}$/);
    if (dbl) {
      const newInner = upsertIntoObjectText(dbl[1], patch);
      const newValue = `{{${newInner}}}`;
      return { ok: true, text: openTagText.slice(0, range.valueStart) + newValue + openTagText.slice(range.valueEnd) };
    }
  }

  const insertAt = openTagText.lastIndexOf('>');
  if (insertAt < 0) return { ok: false, error: 'Opening tag malformed' };
  let attrsEnd = insertAt;
  let scan = insertAt - 1;
  while (scan >= 0 && /\s/.test(openTagText[scan])) scan--;
  if (scan >= 0 && openTagText[scan] === '/') attrsEnd = scan;

  const beforeClose = openTagText.slice(0, attrsEnd);
  const close = openTagText.slice(attrsEnd);
  const objInner = upsertIntoObjectText('', patch);
  return { ok: true, text: `${beforeClose} style={{${objInner}}}${close}` };
}

function findStyleSheetCreateRange(code: string) {
  const idx = code.indexOf('StyleSheet.create');
  if (idx < 0) return null;
  const openParen = code.indexOf('(', idx);
  if (openParen < 0) return null;
  const openBrace = code.indexOf('{', openParen);
  if (openBrace < 0) return null;
  const closeBrace = findMatching(code, openBrace, '{', '}');
  if (closeBrace < 0) return null;
  return { objStart: openBrace, objEnd: closeBrace + 1 };
}

function patchStyleSheetCreate(code: string, styleKey: string, patch: StylePatch): PatchRes {
  const range = findStyleSheetCreateRange(code);
  if (!range) return { ok: false, error: 'StyleSheet.create(...) not found' };
  const objText = code.slice(range.objStart, range.objEnd);

  const keyRe = new RegExp(`\\b${styleKey}\\s*:\\s*\\{`, 'm');
  const m = objText.match(keyRe);
  if (!m || m.index == null) return { ok: false, error: `Style key not found: ${styleKey}` };

  const braceStart = range.objStart + m.index + m[0].lastIndexOf('{');
  const braceEnd = findMatching(code, braceStart, '{', '}');
  if (braceEnd < 0) return { ok: false, error: 'Style object not closed' };

  const inner = code.slice(braceStart + 1, braceEnd);
  const newInner = upsertIntoObjectText(inner, patch);
  const newCode = code.slice(0, braceStart + 1) + newInner + code.slice(braceEnd);
  return { ok: true, code: newCode, changed: true };
}

function replaceStyleReference(
  openTagText: string,
  oldStyleRef: string,
  newStyleRef: string,
  isArray: boolean
): { ok: true; text: string } | PatchErr {
  const oldPattern = oldStyleRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (isArray) {
    const arrayPattern = new RegExp(`(\\[\\s*)${oldPattern}(\\s*[,}])`, 'g');
    if (arrayPattern.test(openTagText)) {
      return { ok: true, text: openTagText.replace(arrayPattern, `$1${newStyleRef}$2`) };
    }
  } else {
    const simplePattern = new RegExp(`(\\{\\s*)${oldPattern}(\\s*\\})`, 'g');
    if (simplePattern.test(openTagText)) {
      return { ok: true, text: openTagText.replace(simplePattern, `$1${newStyleRef}$2`) };
    }
  }

  return { ok: false, error: 'Style reference not found in tag' };
}

export function applyJsxStylePatch({
  code,
  target,
  patch,
  externalStylesMap,
}: {
  code: string;
  target: StyleTarget;
  patch: StylePatch;
  externalStylesMap?: ExternalStylesMap;
}) {
  const source = String(code ?? '');
  const start = target?.start;
  const end = target?.end;
  if (typeof start !== 'number' || typeof end !== 'number') {
    return { ok: false, error: 'applyJsxStylePatch: invalid target {start,end}' };
  }
  if (start < 0 || end > source.length || start >= end) {
    return { ok: false, error: 'applyJsxStylePatch: target range out of bounds' };
  }

  const openTag = source.slice(start, end);
  if (!openTag.startsWith('<')) {
    return { ok: false, error: 'applyJsxStylePatch: target is not an opening tag' };
  }

  const styleRef = extractStyleReference(openTag) as
    | { stylesVar: string; styleKey: string; isArray: boolean }
    | null;
  const hasInline = /\bstyle\s*=\s*\{\s*\{/.test(openTag);

  if (styleRef && !hasInline && externalStylesMap) {
    const externalStyle = externalStylesMap[styleRef.stylesVar];
    if (externalStyle) {
      return {
        ok: true as const,
        needsExternalPatch: true,
        externalStylePath: externalStyle.path,
        styleKey: styleRef.styleKey,
        patch,
        styleReference: {
          stylesVar: styleRef.stylesVar,
          styleKey: styleRef.styleKey,
          isArray: styleRef.isArray,
        },
      };
    }
  }

  if (styleRef && !hasInline && styleRef.stylesVar === 'styles') {
    const ss = patchStyleSheetCreate(source, styleRef.styleKey, patch);
    if (ss.ok) return ss;
  }

  const patched = patchOpeningTagStyle(openTag, patch);
  if (!patched.ok) return { ok: false, error: patched.error || 'Failed to patch opening tag' };
  return { ok: true, code: source.slice(0, start) + patched.text + source.slice(end), changed: true };
}

export function replaceStyleReferenceInJsx({
  code,
  target,
  oldStyleRef,
  newStyleRef,
  isArray,
}: {
  code: string;
  target: StyleTarget;
  oldStyleRef: string;
  newStyleRef: string;
  isArray: boolean;
}): PatchRes {
  const source = String(code ?? '');
  const start = target?.start;
  const end = target?.end;
  if (typeof start !== 'number' || typeof end !== 'number') {
    return { ok: false, error: 'replaceStyleReferenceInJsx: invalid target {start,end}' };
  }
  if (start < 0 || end > source.length || start >= end) {
    return { ok: false, error: 'replaceStyleReferenceInJsx: target range out of bounds' };
  }

  const openTag = source.slice(start, end);
  if (!openTag.startsWith('<')) {
    return { ok: false, error: 'replaceStyleReferenceInJsx: target is not an opening tag' };
  }

  const replaced = replaceStyleReference(openTag, oldStyleRef, newStyleRef, isArray);
  if (!replaced.ok) return { ok: false, error: replaced.error || 'Failed to replace style reference' };
  return { ok: true, code: source.slice(0, start) + replaced.text + source.slice(end), changed: true };
}
