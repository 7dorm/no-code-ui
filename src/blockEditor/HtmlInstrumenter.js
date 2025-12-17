function safeBasename(path) {
  try {
    const norm = String(path || '').replace(/\\/g, '/');
    return norm.split('/').pop() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function makeSelectorForElement(el) {
  // Строим достаточно стабильный и уникальный селектор через цепочку :nth-child
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1) {
    const tag = cur.tagName.toLowerCase();
    const parent = cur.parentElement;
    if (!parent) {
      parts.push(tag);
      break;
    }
    const children = Array.from(parent.children);
    const idx = children.indexOf(cur);
    const nth = idx >= 0 ? idx + 1 : 1;
    parts.push(`${tag}:nth-child(${nth})`);
    cur = parent;
  }
  return parts.reverse().join(' > ');
}

function makeMrpakId({ filePath, selector, tagName }) {
  const base = safeBasename(filePath);
  return `mrpak:${base}:${tagName || 'el'}:${selector}`;
}

export function instrumentHtml(html, filePath) {
  const source = String(html ?? '');
  const hasDoctype = /^\s*<!doctype/i.test(source);

  // DOMParser доступен в рендерере (Vite/Electron)
  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'text/html');

  const map = {};
  const used = new Set();

  const all = doc.querySelectorAll('*');
  all.forEach((el) => {
    const existingNew = el.getAttribute('data-no-code-ui-id');
    const existingOld = el.getAttribute('data-mrpak-id');
    const existing = existingNew || existingOld;
    const selector = makeSelectorForElement(el);
    const tagName = el.tagName ? el.tagName.toLowerCase() : 'el';
    
    if (existing) {
      // Элемент уже имеет id - нормализуем атрибут на data-no-code-ui-id и обновляем карту
      if (!existingNew) {
        el.setAttribute('data-no-code-ui-id', existing);
      }
      if (existingOld) {
        try {
          el.removeAttribute('data-mrpak-id');
        } catch {}
      }
      map[existing] = {
        filePath,
        selector,
        tagName,
        kind: 'html-element',
      };
      used.add(existing);
      return;
    }

    // Создаём новый data-no-code-ui-id для элемента без него
    let id = makeMrpakId({ filePath, selector, tagName });
    if (used.has(id)) {
      let i = 2;
      while (used.has(`${id}:${i}`)) i += 1;
      id = `${id}:${i}`;
    }
    used.add(id);

    el.setAttribute('data-no-code-ui-id', id);
    map[id] = {
      filePath,
      selector,
      tagName,
      kind: 'html-element',
    };
  });

  const serialized = `${hasDoctype ? '<!DOCTYPE html>\\n' : ''}${doc.documentElement.outerHTML}`;
  return { html: serialized, map };
}


