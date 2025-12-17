function isTagChar(ch) {
  return /[A-Za-z0-9_$.-]/.test(ch);
}

/**
 * Находит соответствующую закрывающую скобку, учитывая строки и комментарии
 */
function findMatchingBrace(src, from, openCh, closeCh) {
  let i = from;
  let depth = 0;
  let inS = null; // ', ", `
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
    
    if (ch === openCh) {
      depth++;
    } else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
    
    i++;
  }
  
  return -1;
}

/**
 * Находит компонент (function, arrow function, class), содержащий заданную позицию в коде
 * @param {string} code - исходный код
 * @param {number} position - позиция в коде
 * @returns {Object|null} { type: 'function'|'arrow'|'class', name: string, bodyStart: number, bodyEnd: number } или null
 */
function findContainingComponent(code, position) {
  const src = String(code || '');
  if (position < 0 || position > src.length) return null;

  // Ищем назад от позиции, чтобы найти объявление компонента
  // Проверяем несколько паттернов:
  // 1. function ComponentName() { ... }
  // 2. const ComponentName = () => { ... }
  // 3. const ComponentName = function() { ... }
  // 4. class ComponentName { ... }

  let bestMatch = null;
  let bestStart = -1;

  // 1. function ComponentName() { ... }
  const functionRegex = /function\s+([A-Z][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = functionRegex.exec(src)) !== null) {
    const funcStart = match.index;
    const bodyStart = src.indexOf('{', funcStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    
    // Находим соответствующую закрывающую скобку с учетом строк и комментариев
    const bodyEnd = findMatchingBrace(src, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    
    if (funcStart < position && position < bodyEnd && funcStart > bestStart) {
      bestMatch = {
        type: 'function',
        name: match[1],
        bodyStart: bodyStart + 1,
        bodyEnd: bodyEnd,
      };
      bestStart = funcStart;
    }
  }

  // 2. const ComponentName = () => { ... }
  const arrowRegex = /const\s+([A-Z][A-Za-z0-9_$]*)\s*=\s*\([^)]*\)\s*=>\s*\{/g;
  while ((match = arrowRegex.exec(src)) !== null) {
    const arrowStart = match.index;
    const bodyStart = src.indexOf('{', arrowStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    
    const bodyEnd = findMatchingBrace(src, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    
    if (arrowStart < position && position < bodyEnd && arrowStart > bestStart) {
      bestMatch = {
        type: 'arrow',
        name: match[1],
        bodyStart: bodyStart + 1,
        bodyEnd: bodyEnd,
      };
      bestStart = arrowStart;
    }
  }

  // 3. const ComponentName = function() { ... }
  const constFunctionRegex = /const\s+([A-Z][A-Za-z0-9_$]*)\s*=\s*function\s*\([^)]*\)\s*\{/g;
  while ((match = constFunctionRegex.exec(src)) !== null) {
    const funcStart = match.index;
    const bodyStart = src.indexOf('{', funcStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    
    const bodyEnd = findMatchingBrace(src, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    
    if (funcStart < position && position < bodyEnd && funcStart > bestStart) {
      bestMatch = {
        type: 'function',
        name: match[1],
        bodyStart: bodyStart + 1,
        bodyEnd: bodyEnd,
      };
      bestStart = funcStart;
    }
  }

  // 4. class ComponentName { ... }
  const classRegex = /class\s+([A-Z][A-Za-z0-9_$]*)\s*\{/g;
  while ((match = classRegex.exec(src)) !== null) {
    const classStart = match.index;
    const bodyStart = src.indexOf('{', classStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    
    const bodyEnd = findMatchingBrace(src, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    
    if (classStart < position && position < bodyEnd && classStart > bestStart) {
      bestMatch = {
        type: 'class',
        name: match[1],
        bodyStart: bodyStart + 1,
        bodyEnd: bodyEnd,
      };
      bestStart = classStart;
    }
  }

  return bestMatch;
}

function findNextLt(src, from) {
  // грубо пропускаем строки/комменты
  let i = from;
  let inS = null;
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

function readTagName(src, ltIndex) {
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

function isSelfClosing(openTagText) {
  // предполагаем, что openTagText заканчивается на '>' или '/>'
  return /\/>\s*$/.test(openTagText);
}

function findMatchingCloseTag(src, openEnd, tagName) {
  // Ищем </tagName> с учётом вложенности одинаковых тегов
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
        // найти конец закрывающего тега '>'
        const gt = src.indexOf('>', lt);
        return gt >= 0 ? gt + 1 : -1;
      }
    } else {
      // открывающий тег: если он self-closing, depth не меняем
      const gt = src.indexOf('>', lt);
      if (gt < 0) return -1;
      const openTag = src.slice(lt, gt + 1);
      if (!isSelfClosing(openTag)) depth++;
    }
    i = lt + 1;
  }
  return -1;
}

export function findJsxElementRange({ code, entry }) {
  const src = String(code ?? '');
  const start = entry?.start;
  const end = entry?.end;
  const tagName = entry?.tagName;
  if (typeof start !== 'number' || typeof end !== 'number' || !tagName) return null;
  const openTag = src.slice(start, end);
  if (isSelfClosing(openTag)) {
    return { start, end };
  }
  const closeEnd = findMatchingCloseTag(src, end, tagName);
  if (closeEnd < 0) return null;
  return { start, end: closeEnd };
}

export function applyJsxDelete({ code, entry }) {
  const src = String(code ?? '');
  const range = findJsxElementRange({ code: src, entry });
  if (!range) return { ok: false, error: 'applyJsxDelete: cannot find element range' };
  const out = src.slice(0, range.start) + src.slice(range.end);
  return { ok: true, code: out, changed: true };
}

/**
 * Извлекает имя обработчика из сниппета (onClick или onPress)
 */
function extractHandlerName(snippet) {
  const snip = String(snippet || '');
  // Ищем onClick={handlerName} или onPress={handlerName}
  const onClickMatch = snip.match(/\bonClick\s*=\s*\{([A-Za-z_$][A-Za-z0-9_$]*)\}/);
  if (onClickMatch) return onClickMatch[1];
  
  const onPressMatch = snip.match(/\bonPress\s*=\s*\{([A-Za-z_$][A-Za-z0-9_$]*)\}/);
  if (onPressMatch) return onPressMatch[1];
  
  return null;
}

/**
 * Находит позицию return в теле компонента
 */
function findReturnPosition(src, bodyStart, bodyEnd) {
  // Ищем return в теле компонента (не в строках/комментариях)
  let i = bodyStart;
  let inS = null;
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
    
    // Проверяем на return
    if (src.slice(i, i + 6) === 'return' && 
        (i === bodyStart || /\s/.test(src[i - 1])) &&
        (i + 6 >= bodyEnd || /[\s(]/.test(src[i + 6]))) {
      return i;
    }
    
    i++;
  }
  
  return -1;
}

export function applyJsxInsert({ code, entry, mode, snippet }) {
  const src = String(code ?? '');
  
  // Проверяем, есть ли обработчик событий в сниппете
  const handlerName = extractHandlerName(snippet);
  let newCode = src;
  let handlerOffset = 0;
  let handlerInsertPos = -1;
  
  // Если есть обработчик, нужно создать функцию в компоненте
  if (handlerName) {
    // Сначала находим диапазон элемента для определения позиции поиска компонента
    const initialRange = findJsxElementRange({ code: src, entry });
    if (initialRange) {
      // Определяем позицию для поиска компонента (перед вставкой)
      const searchPosition = mode === 'sibling' ? initialRange.end : initialRange.start;
      
      // Находим компонент, содержащий эту позицию
      const component = findContainingComponent(src, searchPosition);
      
      if (component) {
        // Проверяем, не существует ли уже функция с таким именем
        const handlerRegex = new RegExp(`(?:const|let|var|function)\\s+${handlerName}\\s*[=(]`);
        if (!handlerRegex.test(src.slice(component.bodyStart, component.bodyEnd))) {
          // Ищем позицию return в теле компонента
          const returnPos = findReturnPosition(src, component.bodyStart, component.bodyEnd);
          
          let insertPos;
          let handlerCode;
          
          if (returnPos >= 0) {
            // Вставляем перед return
            insertPos = returnPos;
            handlerCode = `  const ${handlerName} = () => {\n    // TODO: реализовать обработчик\n  };\n\n`;
          } else {
            // Вставляем в начало тела компонента
            insertPos = component.bodyStart;
            handlerCode = `  const ${handlerName} = () => {\n    // TODO: реализовать обработчик\n  };\n\n  `;
          }
          
          handlerInsertPos = insertPos;
          
          // Вставляем функцию
          newCode = newCode.slice(0, insertPos) + handlerCode + newCode.slice(insertPos);
          handlerOffset = handlerCode.length;
        }
      }
    }
  }

  // Пересчитываем позиции entry, если функция была вставлена перед ними
  let adjustedEntry = entry;
  if (handlerOffset > 0 && handlerInsertPos >= 0) {
    if (handlerInsertPos < entry.start) {
      // Функция вставлена перед элементом - нужно сдвинуть позиции
      adjustedEntry = {
        ...entry,
        start: entry.start + handlerOffset,
        end: entry.end + handlerOffset,
      };
    }
  }

  // Теперь используем скорректированные позиции для поиска диапазона в новом коде
  let range = findJsxElementRange({ code: newCode, entry: adjustedEntry });
  if (!range) {
    // Если не нашли элемент со скорректированными позициями, пробуем исходные позиции
    range = findJsxElementRange({ code: newCode, entry });
    if (!range) {
      // Если все еще не нашли, возвращаем ошибку
      return { ok: false, error: 'applyJsxInsert: cannot find element range after handler insertion' };
    }
    // Если нашли с исходными позициями, используем их (функция была вставлена после элемента)
    adjustedEntry = entry;
  }

  const openStart = adjustedEntry.start;
  const openEnd = adjustedEntry.end;
  const openTag = newCode.slice(openStart, openEnd);
  if (isSelfClosing(openTag) && mode === 'child') {
    return { ok: false, error: 'applyJsxInsert: cannot insert child into self-closing tag' };
  }

  const insertText = `\n${String(snippet || '').trim()}\n`;

  if (mode === 'sibling') {
    const out = newCode.slice(0, range.end) + insertText + newCode.slice(range.end);
    return { ok: true, code: out, changed: true };
  }

  // child: вставляем перед </Tag>
  const closeTagStart = newCode.lastIndexOf(`</${adjustedEntry.tagName}`, range.end);
  if (closeTagStart < 0) return { ok: false, error: 'applyJsxInsert: closing tag not found' };
  const out = newCode.slice(0, closeTagStart) + insertText + newCode.slice(closeTagStart);
  return { ok: true, code: out, changed: true };
}

export function applyJsxReparent({ code, sourceEntry, targetEntry }) {
  const src = String(code ?? '');
  const sourceRange = findJsxElementRange({ code: src, entry: sourceEntry });
  const targetRange = findJsxElementRange({ code: src, entry: targetEntry });
  if (!sourceRange || !targetRange) {
    return { ok: false, error: 'applyJsxReparent: cannot resolve ranges' };
  }
  if (sourceRange.start >= targetRange.start && sourceRange.end <= targetRange.end) {
    return { ok: false, error: 'applyJsxReparent: нельзя перенести в своего потомка' };
  }

  const extracted = src.slice(sourceRange.start, sourceRange.end);
  const removed = src.slice(0, sourceRange.start) + src.slice(sourceRange.end);

  // точка вставки: перед закрывающим тегом target в ОРИГИНАЛЕ
  const targetTag = targetEntry.tagName;
  const closeTagStart = src.lastIndexOf(`</${targetTag}`, targetRange.end);
  if (closeTagStart < 0) {
    return { ok: false, error: 'applyJsxReparent: target closing tag not found' };
  }

  // корректируем позицию после удаления
  const delta = sourceRange.end - sourceRange.start;
  const insertPos = sourceRange.start < closeTagStart ? closeTagStart - delta : closeTagStart;

  const insertText = `\n${extracted}\n`;
  const out = removed.slice(0, insertPos) + insertText + removed.slice(insertPos);
  return { ok: true, code: out, changed: true };
}

/**
 * Изменяет текстовое содержимое JSX элемента
 * entry: { start, end } - позиция открывающего тега
 */
export function applyJsxSetText({ code, entry, text }) {
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
  if (!openTag.startsWith('<')) {
    return { ok: false, error: 'applyJsxSetText: entry is not an opening tag' };
  }

  // Находим закрывающий тег
  const tagMatch = openTag.match(/^<([A-Za-z][A-Za-z0-9]*)/);
  if (!tagMatch) {
    return { ok: false, error: 'applyJsxSetText: cannot parse tag name' };
  }
  const tagName = tagMatch[1];

  // Ищем закрывающий тег (самозакрывающийся или парный)
  if (openTag.trim().endsWith('/>')) {
    // Самозакрывающийся тег - не можем изменить текст
    return { ok: false, error: 'applyJsxSetText: self-closing tag has no text content' };
  }

  // Ищем закрывающий тег </tagName>
  let pos = end;
  let depth = 1;
  const closeTagPattern = new RegExp(`</${tagName}\\s*>`, 'g');
  closeTagPattern.lastIndex = end;
  
  while (pos < source.length && depth > 0) {
    const nextOpen = source.indexOf(`<${tagName}`, pos);
    const nextClose = source.indexOf(`</${tagName}`, pos);
    
    if (nextClose === -1) {
      return { ok: false, error: 'applyJsxSetText: closing tag not found' };
    }
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 1;
    } else {
      depth--;
      if (depth === 0) {
        // Нашли закрывающий тег
        const textStart = end;
        const textEnd = nextClose;
        const newText = String(text ?? '').trim();
        const out = source.slice(0, textStart) + newText + source.slice(textEnd);
        return { ok: true, code: out, changed: true };
      }
      pos = nextClose + 1;
    }
  }

  return { ok: false, error: 'applyJsxSetText: cannot find text content range' };
}


