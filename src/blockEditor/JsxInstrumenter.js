function safeBasename(path) {
  try {
    const norm = String(path || '').replace(/\\/g, '/');
    return norm.split('/').pop() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function makeMrpakId({ filePath, start, end, tagName }) {
  // Стабильность обеспечиваем через позиции в исходнике (до инструментирования).
  // При изменениях файла map пересобирается заново.
  const base = safeBasename(filePath);
  return `mrpak:${base}:${start}:${end}:${tagName || 'node'}`;
}

function isIdentStart(ch) {
  return /[A-Za-z_$]/.test(ch);
}
function isIdentPart(ch) {
  return /[A-Za-z0-9_$.-]/.test(ch);
}

function scanJsxOpeningEnd(src, fromIndex) {
  // fromIndex указывает на '<'
  let i = fromIndex + 1;

  // пропуск пробелов
  while (i < src.length && /\s/.test(src[i])) i++;
  if (i >= src.length) return null;

  // закрывающий / комментарий / doctype
  if (src[i] === '/' || src[i] === '!' || src[i] === '?') return null;

  if (!isIdentStart(src[i])) return null;

  // читаем имя тега
  const nameStart = i;
  i++;
  while (i < src.length && isIdentPart(src[i])) i++;
  const tagName = src.slice(nameStart, i);

  // теперь парсим атрибуты до '>' или '/>'
  let inQuote = null; // ' или "
  let braceDepth = 0; // для {...}

  while (i < src.length) {
    const ch = src[i];

    if (inQuote) {
      if (ch === '\\\\') {
        i += 2;
        continue;
      }
      if (ch === inQuote) {
        inQuote = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      i++;
      continue;
    }

    if (ch === '{') {
      braceDepth++;
      i++;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      i++;
      continue;
    }

    if (braceDepth === 0) {
      if (ch === '>') {
        return { end: i + 1, tagName };
      }
      if (ch === '/' && src[i + 1] === '>') {
        return { end: i + 2, tagName };
      }
    }

    i++;
  }

  return null;
}

function findNextInteresting(src, from) {
  // Сканер, который пропускает строки/комменты и возвращает индекс следующего '<'
  let i = from;
  let inS = null; // ', ", `
  let inLineComment = false;
  let inBlockComment = false;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\\n') inLineComment = false;
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
      if (ch === '\\\\') {
        i += 2;
        continue;
      }
      if (ch === inS) {
        inS = null;
        i++;
        continue;
      }
      // template literal: пропускаем ${...} грубо
      if (inS === '`' && ch === '$' && next === '{') {
        // ныряем в выражение до ближайшей '}' с учетом вложенности
        let depth = 1;
        i += 2;
        while (i < src.length && depth > 0) {
          const c = src[i];
          if (c === '\\\\') {
            i += 2;
            continue;
          }
          if (c === '{') depth++;
          else if (c === '}') depth--;
          i++;
        }
        continue;
      }
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

    if (ch === '<') return i;
    i++;
  }
  return -1;
}

export function instrumentJsx(code, filePath, opts = {}) {
  const source = String(code ?? '');

  const map = {};
  const usedIds = new Set();

  let out = '';
  let last = 0;
  let i = 0;
  while (true) {
    const lt = findNextInteresting(source, i);
    if (lt < 0) break;

    const parsed = scanJsxOpeningEnd(source, lt);
    if (!parsed) {
      i = lt + 1;
      continue;
    }

    const start = lt;
    const end = parsed.end;
    const tagName = parsed.tagName;
    const chunk = source.slice(start, end);

    const hasNewAttr = /\bdata-no-code-ui-id\s*=/.test(chunk);
    const hasOldAttr = /\bdata-mrpak-id\s*=/.test(chunk);
    // если уже есть data-no-code-ui-id или legacy data-mrpak-id
    if (hasNewAttr || hasOldAttr) {
      const mNew = chunk.match(/\bdata-no-code-ui-id\s*=\s*["']([^"']+)["']/);
      const mOld = chunk.match(/\bdata-mrpak-id\s*=\s*["']([^"']+)["']/);
      const existingId = (mNew && mNew[1]) || (mOld && mOld[1]) || null;

      if (existingId && !usedIds.has(existingId)) {
        usedIds.add(existingId);
        map[existingId] = { filePath, start, end, tagName, kind: 'jsx-opening-element' };
      }

      // Нормализуем: если есть legacy data-mrpak-id, переименуем атрибут на data-no-code-ui-id в output
      if (!hasNewAttr && hasOldAttr) {
        const normalizedChunk = chunk.replace(/\bdata-mrpak-id\b/g, 'data-no-code-ui-id');
        out += source.slice(last, start);
        out += normalizedChunk;
        last = end;
      }

      i = end;
      continue;
    }

    let id = makeMrpakId({ filePath, start, end, tagName });
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}:${n}`)) n += 1;
      id = `${id}:${n}`;
    }
    usedIds.add(id);
    map[id] = { filePath, start, end, tagName, kind: 'jsx-opening-element' };

    // Вставка атрибута сразу после имени тега
    const afterNameIdx = (() => {
      // позиция после '<' + пробелы + tagName
      let p = start + 1;
      while (p < end && /\s/.test(source[p])) p++;
      return p + tagName.length;
    })();

    out += source.slice(last, afterNameIdx);
    out += ` data-no-code-ui-id="${id}"`;
    out += source.slice(afterNameIdx, end);
    last = end;
    i = end;
  }

  out += source.slice(last);
  return { code: out, map };
}


