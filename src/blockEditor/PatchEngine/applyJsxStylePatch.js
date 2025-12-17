import { extractStyleReference } from './parseStyleImports';

function isIdentChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

function findMatching(src, from, openCh, closeCh) {
  let i = from;
  let depth = 0;
  let inS = null; // ', ", `
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inS) {
      if (ch === '\\\\') {
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

function parseSimpleObjectLiteral(text) {
  // очень простой парсер плоского объекта: key: value, ...
  const src = String(text || '').trim();
  const map = {};
  if (!src) return map;

  let i = 0;
  let key = '';
  let val = '';
  let mode = 'key'; // key|val
  let inS = null;
  let depth = 0; // для скобок/функций — не поддерживаем, но поможет не ломаться

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
      if (ch === '\\\\') {
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

function serializeObjectLiteral(map) {
  const parts = Object.entries(map).map(([k, v]) => `${k}: ${v}`);
  return parts.join(', ');
}

function jsValueLiteral(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v == null) return 'null';
  const s = String(v);
  // если уже похоже на строковый литерал
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s;
  return JSON.stringify(s);
}

function upsertIntoObjectText(objectInner, patch) {
  const obj = parseSimpleObjectLiteral(objectInner);
  for (const [k, v] of Object.entries(patch || {})) {
    obj[k] = jsValueLiteral(v);
  }
  return serializeObjectLiteral(obj);
}

function findStyleAttrRangeInOpeningTag(openTagText) {
  // ищем style={{ ... }} или style={styles.foo}
  const idx = openTagText.search(/\bstyle\s*=/);
  if (idx < 0) return null;
  // находим начало значения после '='
  let i = idx;
  while (i < openTagText.length && openTagText[i] !== '=') i++;
  if (i >= openTagText.length) return null;
  i++; // после '='
  while (i < openTagText.length && /\s/.test(openTagText[i])) i++;
  const valStart = i;

  if (openTagText[valStart] === '{') {
    const end = findMatching(openTagText, valStart, '{', '}');
    if (end < 0) return null;
    return { attrStart: idx, valueStart: valStart, valueEnd: end + 1 };
  }
  return null;
}

function patchOpeningTagStyle(openTagText, patch) {
  // 1) style={{...}}
  // Важно: сохраняем все другие атрибуты (onClick, onPress и т.д.) при изменении style
  const range = findStyleAttrRangeInOpeningTag(openTagText);
  if (range) {
    const valueText = openTagText.slice(range.valueStart, range.valueEnd); // {...}
    // style={{ ... }} -> значение начинается с '{' и внутри может быть '{...}'
    const dbl = valueText.match(/^\{\s*\{([\s\S]*)\}\s*\}$/);
    if (dbl) {
      const inner = dbl[1];
      const newInner = upsertIntoObjectText(inner, patch);
      const newValue = `{{${newInner}}}`;
      // Сохраняем текст до style (включая onClick, onPress и другие атрибуты)
      // и текст после style
      return { ok: true, text: openTagText.slice(0, range.valueStart) + newValue + openTagText.slice(range.valueEnd) };
    }
  }

  // 2) нет style -> добавляем style={{...}} перед закрытием
  // Сохраняем все существующие атрибуты (onClick, onPress и т.д.)
  const insertAt = openTagText.lastIndexOf('>');
  if (insertAt < 0) return { ok: false, error: 'Opening tag malformed' };
  const beforeClose = openTagText.slice(0, insertAt); // Сохраняет все атрибуты до '>'
  const close = openTagText.slice(insertAt);
  const objInner = upsertIntoObjectText('', patch);
  // Вставляем style перед '>', сохраняя все другие атрибуты
  return { ok: true, text: `${beforeClose} style={{${objInner}}}${close}` };
}

function findStyleSheetCreateRange(code) {
  // ищем "StyleSheet.create(" и возвращаем диапазон объекта внутри скобок
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

function patchStyleSheetCreate(code, styleKey, patch) {
  const range = findStyleSheetCreateRange(code);
  if (!range) return { ok: false, error: 'StyleSheet.create(...) not found' };
  const objText = code.slice(range.objStart, range.objEnd); // { ... }

  // находим "styleKey:" на верхнем уровне (грубо)
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

/**
 * Заменяет ссылку на стиль в JSX теге
 * @param {string} openTagText - текст открывающего тега
 * @param {string} oldStyleRef - старая ссылка (например, 'commonStyles.spacing')
 * @param {string} newStyleRef - новая ссылка (например, 'commonStyles.spacingMrpak1')
 * @param {boolean} isArray - является ли стиль частью массива
 * @returns {Object} { ok: boolean, text?: string, error?: string }
 */
function replaceStyleReference(openTagText, oldStyleRef, newStyleRef, isArray) {
  const oldPattern = oldStyleRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  if (isArray) {
    // Для массива: style={[commonStyles.spacing, ...]} -> style={[commonStyles.spacingMrpak1, ...]}
    const arrayPattern = new RegExp(`(\\[\\s*)${oldPattern}(\\s*[,}])`, 'g');
    if (arrayPattern.test(openTagText)) {
      const newText = openTagText.replace(arrayPattern, `$1${newStyleRef}$2`);
      return { ok: true, text: newText };
    }
  } else {
    // Для простой ссылки: style={commonStyles.spacing} -> style={commonStyles.spacingMrpak1}
    const simplePattern = new RegExp(`(\\{\\s*)${oldPattern}(\\s*\\})`, 'g');
    if (simplePattern.test(openTagText)) {
      const newText = openTagText.replace(simplePattern, `$1${newStyleRef}$2`);
      return { ok: true, text: newText };
    }
  }
  
  return { ok: false, error: 'Style reference not found in tag' };
}

/**
 * patch: { [camelCaseKey]: string|number|boolean|null }
 * target: { start: number, end: number }
 * externalStylesMap: { [varName]: { path: string, type: string } } - маппинг внешних стилей
 */
export function applyJsxStylePatch({ code, target, patch, externalStylesMap }) {
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

  // Проверяем, используется ли внешний стиль
  const styleRef = extractStyleReference(openTag);
  const hasInline = /\bstyle\s*=\s*\{\s*\{/.test(openTag);
  
  if (styleRef && !hasInline && externalStylesMap) {
    const { stylesVar, styleKey } = styleRef;
    const externalStyle = externalStylesMap[stylesVar];
    
    // Если это внешний стиль, возвращаем информацию для патчинга внешнего файла
    if (externalStyle) {
      return {
        ok: true,
        needsExternalPatch: true,
        externalStylePath: externalStyle.path,
        styleKey,
        patch,
        // Сохраняем информацию для замены ссылки
        styleReference: {
          stylesVar,
          styleKey,
          isArray: styleRef.isArray,
        },
      };
    }
  }

  // если есть style={styles.foo} и нет style={{...}}, пробуем патчить StyleSheet.create в том же файле
  if (styleRef && !hasInline) {
    const stylesVar = styleRef.stylesVar;
    const styleKey = styleRef.styleKey;
    // MVP: поддерживаем только "styles" как переменную стилей (локальный StyleSheet)
    if (stylesVar === 'styles') {
      const ss = patchStyleSheetCreate(source, styleKey, patch);
      if (ss.ok) return ss;
    }
  }

  // Если нет внешнего стиля или есть inline-стиль, применяем патч как обычно
  const patched = patchOpeningTagStyle(openTag, patch);
  if (!patched.ok) return { ok: false, error: patched.error || 'Failed to patch opening tag' };
  const newCode = source.slice(0, start) + patched.text + source.slice(end);
  return { ok: true, code: newCode, changed: true };
}

/**
 * Заменяет ссылку на стиль в JSX коде
 * @param {string} code - исходный код
 * @param {Object} target - { start: number, end: number } - диапазон открывающего тега
 * @param {string} oldStyleRef - старая ссылка (например, 'commonStyles.spacing')
 * @param {string} newStyleRef - новая ссылка (например, 'commonStyles.spacingMrpak1')
 * @param {boolean} isArray - является ли стиль частью массива
 * @returns {Object} { ok: boolean, code?: string, error?: string }
 */
export function replaceStyleReferenceInJsx({ code, target, oldStyleRef, newStyleRef, isArray }) {
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
  if (!replaced.ok) {
    return { ok: false, error: replaced.error || 'Failed to replace style reference' };
  }

  const newCode = source.slice(0, start) + replaced.text + source.slice(end);
  return { ok: true, code: newCode, changed: true };
}


