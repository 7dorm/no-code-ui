/**
 * Применяет патч к внешнему файлу стилей, создавая новый стиль
 * вместо изменения существующего
 */

function findMatching(src, from, openCh, closeCh) {
  let i = from;
  let depth = 0;
  let inS = null; // ', ", `
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

function parseSimpleObjectLiteral(text) {
  const src = String(text || '').trim();
  const map = {};
  if (!src) return map;

  let i = 0;
  let key = '';
  let val = '';
  let mode = 'key';
  let inS = null;
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
        (mode === 'key' ? (key += ch + (next || '')) : (val += ch + (next || '')));
        i += 2;
        continue;
      }
      (mode === 'key' ? (key += ch) : (val += ch));
      if (ch === inS) inS = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inS = ch;
      (mode === 'key' ? (key += ch) : (val += ch));
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

    (mode === 'key' ? (key += ch) : (val += ch));
    i++;
  }
  if (key.trim()) flush();
  return map;
}

function jsValueLiteral(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v == null) return 'null';
  const s = String(v);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s;
  return JSON.stringify(s);
}

function serializeObjectLiteral(map) {
  const parts = Object.entries(map).map(([k, v]) => `${k}: ${v}`);
  return parts.join(', ');
}

/**
 * Находит StyleSheet.create в коде и возвращает диапазон объекта
 */
function findStyleSheetCreateRange(code) {
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

/**
 * Находит существующий стиль в StyleSheet.create
 */
function findStyleInSheet(code, styleKey) {
  const range = findStyleSheetCreateRange(code);
  if (!range) return null;
  
  const objText = code.slice(range.objStart, range.objEnd);
  const keyRe = new RegExp(`\\b${styleKey}\\s*:\\s*\\{`, 'm');
  const m = objText.match(keyRe);
  if (!m || m.index == null) return null;
  
  const braceStart = range.objStart + m.index + m[0].lastIndexOf('{');
  const braceEnd = findMatching(code, braceStart, '{', '}');
  if (braceEnd < 0) return null;
  
  const inner = code.slice(braceStart + 1, braceEnd);
  const styleObj = parseSimpleObjectLiteral(inner);
  
  return {
    range: { start: braceStart + 1, end: braceEnd },
    styleObj,
  };
}

/**
 * Генерирует уникальное имя для нового стиля
 */
function generateNewStyleName(baseName, existingNames) {
  const namesSet = new Set(existingNames);
  let counter = 1;
  let newName = `${baseName}Mrpak${counter}`;
  
  while (namesSet.has(newName)) {
    counter++;
    newName = `${baseName}Mrpak${counter}`;
  }
  
  return newName;
}

/**
 * Получает все имена стилей из StyleSheet.create
 */
function getAllStyleNames(code) {
  const range = findStyleSheetCreateRange(code);
  if (!range) return [];
  
  const objText = code.slice(range.objStart + 1, range.objEnd - 1);
  const names = [];
  const nameRegex = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*\{/g;
  let match;
  
  while ((match = nameRegex.exec(objText)) !== null) {
    names.push(match[1]);
  }
  
  return names;
}

/**
 * Применяет патч к внешнему файлу стилей, создавая новый стиль
 * 
 * @param {Object} params
 * @param {string} params.code - исходный код файла стилей
 * @param {string} params.styleKey - имя существующего стиля (например, 'spacing')
 * @param {Object} params.patch - объект с изменениями стиля { left: 10, top: 20 }
 * @returns {Object} { ok: boolean, code?: string, newStyleName?: string, error?: string }
 */
export function applyExternalStylePatch({ code, styleKey, patch }) {
  const source = String(code ?? '');
  
  if (!styleKey || !patch || Object.keys(patch).length === 0) {
    return { ok: false, error: 'applyExternalStylePatch: styleKey and patch are required' };
  }
  
  // Находим существующий стиль
  const existingStyle = findStyleInSheet(source, styleKey);
  if (!existingStyle) {
    return { ok: false, error: `Style '${styleKey}' not found in StyleSheet.create` };
  }
  
  // Получаем все имена стилей для генерации уникального имени
  const allNames = getAllStyleNames(source);
  const newStyleName = generateNewStyleName(styleKey, allNames);
  
  // Создаём новый стиль на основе существующего с применением патча
  const mergedStyle = { ...existingStyle.styleObj };
  for (const [k, v] of Object.entries(patch || {})) {
    mergedStyle[k] = jsValueLiteral(v);
  }
  
  const newStyleText = serializeObjectLiteral(mergedStyle);
  
  // Находим место для вставки нового стиля (после последнего стиля в StyleSheet.create)
  const range = findStyleSheetCreateRange(source);
  if (!range) {
    return { ok: false, error: 'StyleSheet.create not found' };
  }
  
  // Находим конец объекта StyleSheet.create (перед закрывающей скобкой)
  const objEnd = range.objEnd - 1;
  const beforeClose = source.slice(0, objEnd);
  
  // Определяем, нужна ли запятая перед новым стилем
  const needsComma = !beforeClose.trim().endsWith('{') && !beforeClose.trim().endsWith(',');
  const comma = needsComma ? ', ' : '';
  
  // Вставляем новый стиль перед закрывающей скобкой
  const newCode = beforeClose + comma + `${newStyleName}: {${newStyleText}}` + source.slice(objEnd);
  
  return {
    ok: true,
    code: newCode,
    newStyleName,
    changed: true,
  };
}

