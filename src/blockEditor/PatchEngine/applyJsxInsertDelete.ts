function isTagChar(ch: any) {
  return /[A-Za-z0-9_$.-]/.test(ch);
}

/**
 * РќР°С…РѕРґРёС‚ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰СѓСЋ Р·Р°РєСЂС‹РІР°СЋС‰СѓСЋ СЃРєРѕР±РєСѓ, СѓС‡РёС‚С‹РІР°СЏ СЃС‚СЂРѕРєРё Рё РєРѕРјРјРµРЅС‚Р°СЂРёРё
 */
function findMatchingBrace(src: any, from: any, openCh: any, closeCh: any) {
  let i = from;
  let depth = 0;
  let inS: any = null; // ', ", `
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
 * РќР°С…РѕРґРёС‚ РєРѕРјРїРѕРЅРµРЅС‚ (function, arrow function, class), СЃРѕРґРµСЂР¶Р°С‰РёР№ Р·Р°РґР°РЅРЅСѓСЋ РїРѕР·РёС†РёСЋ РІ РєРѕРґРµ
 * @param {string} code - РёСЃС…РѕРґРЅС‹Р№ РєРѕРґ
 * @param {number} position - РїРѕР·РёС†РёСЏ РІ РєРѕРґРµ
 * @returns {Object|null} { type: 'function'|'arrow'|'class', name: string, bodyStart: number, bodyEnd: number } РёР»Рё null
 */
function findContainingComponent(code: any, position: any) {
  const src = String(code || '');
  if (position < 0 || position > src.length) return null;

  // РС‰РµРј РЅР°Р·Р°Рґ РѕС‚ РїРѕР·РёС†РёРё, С‡С‚РѕР±С‹ РЅР°Р№С‚Рё РѕР±СЉСЏРІР»РµРЅРёРµ РєРѕРјРїРѕРЅРµРЅС‚Р°
  // РџСЂРѕРІРµСЂСЏРµРј РЅРµСЃРєРѕР»СЊРєРѕ РїР°С‚С‚РµСЂРЅРѕРІ:
  // 1. function ComponentName() { ... }
  // 2. const ComponentName = () => { ... }
  // 3. const ComponentName = function() { ... }
  // 4. class ComponentName { ... }

  let bestMatch: any = null;
  let bestStart = -1;

  // 1. function ComponentName() { ... }
  const functionRegex = /function\s+([A-Z][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g;
  let match: any;
  while ((match = functionRegex.exec(src)) !== null) {
    const funcStart = match.index;
    const bodyStart = src.indexOf('{', funcStart + match[0].length - 1);
    if (bodyStart < 0) continue;
    
    // РќР°С…РѕРґРёРј СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰СѓСЋ Р·Р°РєСЂС‹РІР°СЋС‰СѓСЋ СЃРєРѕР±РєСѓ СЃ СѓС‡РµС‚РѕРј СЃС‚СЂРѕРє Рё РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ
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

function findNextLt(src: any, from: any) {
  // РіСЂСѓР±Рѕ РїСЂРѕРїСѓСЃРєР°РµРј СЃС‚СЂРѕРєРё/РєРѕРјРјРµРЅС‚С‹
  let i = from;
  let inS: any = null;
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

function readTagName(src: any, ltIndex: any) {
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

function isSelfClosing(openTagText: any) {
  // РїСЂРµРґРїРѕР»Р°РіР°РµРј, С‡С‚Рѕ openTagText Р·Р°РєР°РЅС‡РёРІР°РµС‚СЃСЏ РЅР° '>' РёР»Рё '/>'
  return /\/>\s*$/.test(openTagText);
}

function findMatchingCloseTag(src: any, openEnd: any, tagName: any) {
  // РС‰РµРј </tagName> СЃ СѓС‡С‘С‚РѕРј РІР»РѕР¶РµРЅРЅРѕСЃС‚Рё РѕРґРёРЅР°РєРѕРІС‹С… С‚РµРіРѕРІ
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
        // РЅР°Р№С‚Рё РєРѕРЅРµС† Р·Р°РєСЂС‹РІР°СЋС‰РµРіРѕ С‚РµРіР° '>'
        const gt = src.indexOf('>', lt);
        return gt >= 0 ? gt + 1 : -1;
      }
    } else {
      // РѕС‚РєСЂС‹РІР°СЋС‰РёР№ С‚РµРі: РµСЃР»Рё РѕРЅ self-closing, depth РЅРµ РјРµРЅСЏРµРј
      const gt = src.indexOf('>', lt);
      if (gt < 0) return -1;
      const openTag = src.slice(lt, gt + 1);
      if (!isSelfClosing(openTag)) depth++;
    }
    i = lt + 1;
  }
  return -1;
}

export function findJsxElementRange({ code, entry }: any) {
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

export function applyJsxDelete({ code, entry }: any) {
  const src = String(code ?? '');
  const range = findJsxElementRange({ code: src, entry });
  if (!range) return { ok: false, error: 'applyJsxDelete: cannot find element range' };
  const out = src.slice(0, range.start) + src.slice(range.end);
  return { ok: true, code: out, changed: true };
}

/**
 * РР·РІР»РµРєР°РµС‚ РёРјСЏ РѕР±СЂР°Р±РѕС‚С‡РёРєР° РёР· СЃРЅРёРїРїРµС‚Р° (onClick РёР»Рё onPress)
 */
function extractHandlerName(snippet: any) {
  const snip = String(snippet || '');
  // РС‰РµРј onClick={handlerName} РёР»Рё onPress={handlerName}
  const onClickMatch = snip.match(/\bonClick\s*=\s*\{([A-Za-z_$][A-Za-z0-9_$]*)\}/);
  if (onClickMatch) return onClickMatch[1];
  
  const onPressMatch = snip.match(/\bonPress\s*=\s*\{([A-Za-z_$][A-Za-z0-9_$]*)\}/);
  if (onPressMatch) return onPressMatch[1];
  
  return null;
}

/**
 * РќР°С…РѕРґРёС‚ РїРѕР·РёС†РёСЋ return РІ С‚РµР»Рµ РєРѕРјРїРѕРЅРµРЅС‚Р°
 */
function findReturnPosition(src: any, bodyStart: any, bodyEnd: any) {
  // РС‰РµРј return РІ С‚РµР»Рµ РєРѕРјРїРѕРЅРµРЅС‚Р° (РЅРµ РІ СЃС‚СЂРѕРєР°С…/РєРѕРјРјРµРЅС‚Р°СЂРёСЏС…)
  let i = bodyStart;
  let inS: any = null;
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
    
    // РџСЂРѕРІРµСЂСЏРµРј РЅР° return
    if (src.slice(i, i + 6) === 'return' && 
        (i === bodyStart || /\s/.test(src[i - 1])) &&
        (i + 6 >= bodyEnd || /[\s(]/.test(src[i + 6]))) {
      return i;
    }
    
    i++;
  }
  
  return -1;
}

export function applyJsxInsert({ code, entry, mode, snippet }: any) {
  const src = String(code ?? '');
  
  // РџСЂРѕРІРµСЂСЏРµРј, РµСЃС‚СЊ Р»Рё РѕР±СЂР°Р±РѕС‚С‡РёРє СЃРѕР±С‹С‚РёР№ РІ СЃРЅРёРїРїРµС‚Рµ
  const handlerName = extractHandlerName(snippet);
  let newCode = src;
  let handlerOffset = 0;
  let handlerInsertPos = -1;
  
  // Р•СЃР»Рё РµСЃС‚СЊ РѕР±СЂР°Р±РѕС‚С‡РёРє, РЅСѓР¶РЅРѕ СЃРѕР·РґР°С‚СЊ С„СѓРЅРєС†РёСЋ РІ РєРѕРјРїРѕРЅРµРЅС‚Рµ
  if (handlerName) {
    // РЎРЅР°С‡Р°Р»Р° РЅР°С…РѕРґРёРј РґРёР°РїР°Р·РѕРЅ СЌР»РµРјРµРЅС‚Р° РґР»СЏ РѕРїСЂРµРґРµР»РµРЅРёСЏ РїРѕР·РёС†РёРё РїРѕРёСЃРєР° РєРѕРјРїРѕРЅРµРЅС‚Р°
    const initialRange = findJsxElementRange({ code: src, entry });
    if (initialRange) {
      // РћРїСЂРµРґРµР»СЏРµРј РїРѕР·РёС†РёСЋ РґР»СЏ РїРѕРёСЃРєР° РєРѕРјРїРѕРЅРµРЅС‚Р° (РїРµСЂРµРґ РІСЃС‚Р°РІРєРѕР№)
      const searchPosition = mode === 'sibling' ? initialRange.end : initialRange.start;
      
      // РќР°С…РѕРґРёРј РєРѕРјРїРѕРЅРµРЅС‚, СЃРѕРґРµСЂР¶Р°С‰РёР№ СЌС‚Сѓ РїРѕР·РёС†РёСЋ
      const component = findContainingComponent(src, searchPosition);
      
      if (component) {
        // РџСЂРѕРІРµСЂСЏРµРј, РЅРµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ Р»Рё СѓР¶Рµ С„СѓРЅРєС†РёСЏ СЃ С‚Р°РєРёРј РёРјРµРЅРµРј
        const handlerRegex = new RegExp(`(?:const|let|var|function)\\s+${handlerName}\\s*[=(]`);
        if (!handlerRegex.test(src.slice(component.bodyStart, component.bodyEnd))) {
          // РС‰РµРј РїРѕР·РёС†РёСЋ return РІ С‚РµР»Рµ РєРѕРјРїРѕРЅРµРЅС‚Р°
          const returnPos = findReturnPosition(src, component.bodyStart, component.bodyEnd);
          
          let insertPos: any;
          let handlerCode: any;
          
          if (returnPos >= 0) {
            // Р’СЃС‚Р°РІР»СЏРµРј РїРµСЂРµРґ return
            insertPos = returnPos;
            handlerCode = `  const ${handlerName} = () => {\n    // TODO: СЂРµР°Р»РёР·РѕРІР°С‚СЊ РѕР±СЂР°Р±РѕС‚С‡РёРє\n  };\n\n`;
          } else {
            // Р’СЃС‚Р°РІР»СЏРµРј РІ РЅР°С‡Р°Р»Рѕ С‚РµР»Р° РєРѕРјРїРѕРЅРµРЅС‚Р°
            insertPos = component.bodyStart;
            handlerCode = `  const ${handlerName} = () => {\n    // TODO: СЂРµР°Р»РёР·РѕРІР°С‚СЊ РѕР±СЂР°Р±РѕС‚С‡РёРє\n  };\n\n  `;
          }
          
          handlerInsertPos = insertPos;
          
          // Р’СЃС‚Р°РІР»СЏРµРј С„СѓРЅРєС†РёСЋ
          newCode = newCode.slice(0, insertPos) + handlerCode + newCode.slice(insertPos);
          handlerOffset = handlerCode.length;
        }
      }
    }
  }
  
  // РџРµСЂРµСЃС‡РёС‚С‹РІР°РµРј РїРѕР·РёС†РёРё entry, РµСЃР»Рё С„СѓРЅРєС†РёСЏ Р±С‹Р»Р° РІСЃС‚Р°РІР»РµРЅР° РїРµСЂРµРґ РЅРёРјРё
  let adjustedEntry = entry;
  if (handlerOffset > 0 && handlerInsertPos >= 0) {
    if (handlerInsertPos < entry.start) {
      // Р¤СѓРЅРєС†РёСЏ РІСЃС‚Р°РІР»РµРЅР° РїРµСЂРµРґ СЌР»РµРјРµРЅС‚РѕРј - РЅСѓР¶РЅРѕ СЃРґРІРёРЅСѓС‚СЊ РїРѕР·РёС†РёРё
      adjustedEntry = {
        ...entry,
        start: entry.start + handlerOffset,
        end: entry.end + handlerOffset,
      };
    }
  }

  // РўРµРїРµСЂСЊ РёСЃРїРѕР»СЊР·СѓРµРј СЃРєРѕСЂСЂРµРєС‚РёСЂРѕРІР°РЅРЅС‹Рµ РїРѕР·РёС†РёРё РґР»СЏ РїРѕРёСЃРєР° РґРёР°РїР°Р·РѕРЅР° РІ РЅРѕРІРѕРј РєРѕРґРµ
  let range = findJsxElementRange({ code: newCode, entry: adjustedEntry });
  if (!range) {
    // Р•СЃР»Рё РЅРµ РЅР°С€Р»Рё СЌР»РµРјРµРЅС‚ СЃРѕ СЃРєРѕСЂСЂРµРєС‚РёСЂРѕРІР°РЅРЅС‹РјРё РїРѕР·РёС†РёСЏРјРё, РїСЂРѕР±СѓРµРј РёСЃС…РѕРґРЅС‹Рµ РїРѕР·РёС†РёРё
    range = findJsxElementRange({ code: newCode, entry });
    if (!range) {
      // Р•СЃР»Рё РІСЃРµ РµС‰Рµ РЅРµ РЅР°С€Р»Рё, РІРѕР·РІСЂР°С‰Р°РµРј РѕС€РёР±РєСѓ
      return { ok: false, error: 'applyJsxInsert: cannot find element range after handler insertion' };
    }
    // Р•СЃР»Рё РЅР°С€Р»Рё СЃ РёСЃС…РѕРґРЅС‹РјРё РїРѕР·РёС†РёСЏРјРё, РёСЃРїРѕР»СЊР·СѓРµРј РёС… (С„СѓРЅРєС†РёСЏ Р±С‹Р»Р° РІСЃС‚Р°РІР»РµРЅР° РїРѕСЃР»Рµ СЌР»РµРјРµРЅС‚Р°)
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

  // child: РІСЃС‚Р°РІР»СЏРµРј РїРµСЂРµРґ </Tag>
  const closeTagStart = newCode.lastIndexOf(`</${adjustedEntry.tagName}`, range.end);
  if (closeTagStart < 0) return { ok: false, error: 'applyJsxInsert: closing tag not found' };
  const out = newCode.slice(0, closeTagStart) + insertText + newCode.slice(closeTagStart);
  return { ok: true, code: out, changed: true };
}

export function applyJsxReparent({ code, sourceEntry, targetEntry, targetBeforeEntry, targetBeforeId }: any) {
  const src = String(code ?? '');
  const sourceRange = findJsxElementRange({ code: src, entry: sourceEntry });
  const targetRange = findJsxElementRange({ code: src, entry: targetEntry });
  const beforeRange = targetBeforeEntry ? findJsxElementRange({ code: src, entry: targetBeforeEntry }) : null;
  if (!sourceRange || !targetRange) {
    return { ok: false, error: 'applyJsxReparent: cannot resolve ranges' };
  }
  if (targetBeforeId && !beforeRange) {
    return { ok: false, error: 'applyJsxReparent: targetBefore range not found' };
  }
  // Disallow only cyclic move: target is inside source subtree.
  if (targetRange.start >= sourceRange.start && targetRange.end <= sourceRange.end) {
    return { ok: false, error: 'applyJsxReparent: cannot move into own descendant' };
  }

  const extracted = src.slice(sourceRange.start, sourceRange.end);
  const removed = src.slice(0, sourceRange.start) + src.slice(sourceRange.end);

  // С‚РѕС‡РєР° РІСЃС‚Р°РІРєРё: РїРµСЂРµРґ Р·Р°РєСЂС‹РІР°СЋС‰РёРј С‚РµРіРѕРј target РІ РћР РР“РРќРђР›Р•
  let insertPosOriginal = -1;
  if (beforeRange) {
    insertPosOriginal = beforeRange.start;
  } else {
    const targetTag = targetEntry.tagName;
    const closeTagStart = src.lastIndexOf(`</${targetTag}`, targetRange.end);
    if (closeTagStart < 0) {
      return { ok: false, error: 'applyJsxReparent: target closing tag not found' };
    }
    insertPosOriginal = closeTagStart;
  }

  // РєРѕСЂСЂРµРєС‚РёСЂСѓРµРј РїРѕР·РёС†РёСЋ РїРѕСЃР»Рµ СѓРґР°Р»РµРЅРёСЏ
  const delta = sourceRange.end - sourceRange.start;
  const insertPos = sourceRange.start < insertPosOriginal ? insertPosOriginal - delta : insertPosOriginal;

  const insertText = `\n${extracted}\n`;
  const out = removed.slice(0, insertPos) + insertText + removed.slice(insertPos);
  return { ok: true, code: out, changed: true };
}

/**
 * РР·РјРµРЅСЏРµС‚ С‚РµРєСЃС‚РѕРІРѕРµ СЃРѕРґРµСЂР¶РёРјРѕРµ JSX СЌР»РµРјРµРЅС‚Р°
 * entry: { start, end } - РїРѕР·РёС†РёСЏ РѕС‚РєСЂС‹РІР°СЋС‰РµРіРѕ С‚РµРіР°
 */
export function applyJsxSetText({ code, entry, text }: any) {
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

  // РќР°С…РѕРґРёРј Р·Р°РєСЂС‹РІР°СЋС‰РёР№ С‚РµРі
  const tagMatch = openTag.match(/^<([A-Za-z][A-Za-z0-9]*)/);
  if (!tagMatch) {
    return { ok: false, error: 'applyJsxSetText: cannot parse tag name' };
  }
  const tagName = tagMatch[1];

  // РС‰РµРј Р·Р°РєСЂС‹РІР°СЋС‰РёР№ С‚РµРі </tagName>
  if (openTag.trim().endsWith('/>')) {
    // РЎР°РјРѕР·Р°РєСЂС‹РІР°СЋС‰РёР№СЃСЏ С‚РµРі - РЅРµ РјРѕР¶РµРј РёР·РјРµРЅРёС‚СЊ С‚РµРєСЃС‚
    return { ok: false, error: 'applyJsxSetText: self-closing tag has no text content' };
  }

  // РС‰РµРј Р·Р°РєСЂС‹РІР°СЋС‰РёР№ С‚РµРі </tagName>
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
        // РќР°С€Р»Рё Р·Р°РєСЂС‹РІР°СЋС‰РёР№ С‚РµРі
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

