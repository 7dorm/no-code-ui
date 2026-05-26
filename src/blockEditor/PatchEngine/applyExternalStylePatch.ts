/**
 * Применяет патч к внешнему файлу стилей, создавая новый стиль
 * вместо изменения существующего
 */

type StylePatch = Record<string, unknown>;
type StyleLiteralMap = Record<string, string>;

type ExternalPatchResult =
  | { ok: true; code: string; newStyleName: string; changed: true }
  | { ok: false; error: string };

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
      if (ch === inS) inS = null;
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
  const map: StyleLiteralMap = {};
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

function jsValueLiteral(v: unknown) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v == null) return 'null';
  const s = String(v);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s;
  return JSON.stringify(s);
}

function serializeObjectLiteral(map: StyleLiteralMap) {
  const parts = Object.entries(map).map(([k, v]) => `${k}: ${v}`);
  return parts.join(', ');
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

function findStyleInSheet(code: string, styleKey: string) {
  const range = findStyleSheetCreateRange(code);
  if (!range) return null;

  const objText = code.slice(range.objStart, range.objEnd);
  const keyRe = new RegExp(`\\b${styleKey}\\s*:\\s*\\{`, 'm');
  const m = objText.match(keyRe);
  if (!m || m.index == null) return null;

  const braceStart = range.objStart + m.index + m[0].lastIndexOf('{');
  const braceEnd = findMatching(code, braceStart, '{', '}');
  if (braceEnd < 0) return null;

  return {
    range: { start: braceStart + 1, end: braceEnd },
    styleObj: parseSimpleObjectLiteral(code.slice(braceStart + 1, braceEnd)),
  };
}

function generateNewStyleName(baseName: string, existingNames: string[]) {
  const namesSet = new Set(existingNames);
  let counter = 1;
  let newName = `${baseName}Mrpak${counter}`;

  while (namesSet.has(newName)) {
    counter++;
    newName = `${baseName}Mrpak${counter}`;
  }
  return newName;
}

function getAllStyleNames(code: string) {
  const range = findStyleSheetCreateRange(code);
  if (!range) return [] as string[];

  const objText = code.slice(range.objStart + 1, range.objEnd - 1);
  const names: string[] = [];
  const nameRegex = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = nameRegex.exec(objText)) !== null) {
    names.push(match[1]);
  }
  return names;
}

export function applyExternalStylePatch({
  code,
  styleKey,
  patch,
}: {
  code: string;
  styleKey: string;
  patch: StylePatch;
}): ExternalPatchResult {
  const source = String(code ?? '');

  if (!styleKey || !patch || Object.keys(patch).length === 0) {
    return { ok: false, error: 'applyExternalStylePatch: styleKey and patch are required' };
  }

  const existingStyle = findStyleInSheet(source, styleKey);
  if (!existingStyle) {
    return { ok: false, error: `Style '${styleKey}' not found in StyleSheet.create` };
  }

  const allNames = getAllStyleNames(source);
  const newStyleName = generateNewStyleName(styleKey, allNames);

  const mergedStyle: StyleLiteralMap = { ...existingStyle.styleObj };
  for (const [k, v] of Object.entries(patch || {})) {
    mergedStyle[k] = jsValueLiteral(v);
  }

  const newStyleText = serializeObjectLiteral(mergedStyle);
  const range = findStyleSheetCreateRange(source);
  if (!range) return { ok: false, error: 'StyleSheet.create not found' };

  const objEnd = range.objEnd - 1;
  const beforeClose = source.slice(0, objEnd);
  const needsComma = !beforeClose.trim().endsWith('{') && !beforeClose.trim().endsWith(',');
  const comma = needsComma ? ', ' : '';

  const newCode = beforeClose + comma + `${newStyleName}: {${newStyleText}}` + source.slice(objEnd);
  return { ok: true, code: newCode, newStyleName, changed: true };
}
