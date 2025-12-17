/**
 * op:
 * - delete: { type:'delete', selector, id? }
 * - insert: { type:'insert', targetSelector, targetId?, mode:'child'|'sibling', html }
 * - reparent: { type:'reparent', sourceSelector, sourceId?, targetSelector, targetId? }
 */
function escapeCssSelector(str) {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(str);
  }
  // Fallback: экранируем специальные символы вручную
  return String(str).replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
}

function findElement(doc, { selector, id }) {
  // Приоритет 1: поиск по data-no-code-ui-id (самый надёжный), с поддержкой legacy data-mrpak-id
  if (id) {
    const escaped = escapeCssSelector(String(id));
    const byId =
      doc.querySelector(`[data-no-code-ui-id="${escaped}"]`) ||
      doc.querySelector(`[data-mrpak-id="${escaped}"]`);
    if (byId) return byId;
  }

  // Приоритет 2: прямой querySelector
  if (selector) {
    try {
      const direct = doc.querySelector(selector);
      if (direct) return direct;
    } catch (e) {
      // ignore invalid selector
    }
  }

  // Приоритет 3: разбор цепочки tag:nth-child(N) > ... (fallback)
  if (!selector) return null;
  const parts = String(selector)
    .split('>')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  let current = doc.documentElement; // <html>
  const first = parts[0];
  const firstMatch = first.match(/^([a-zA-Z0-9_-]+)(?:\:nth-child\((\d+)\))?$/);
  if (!firstMatch) return null;
  if (firstMatch[1].toLowerCase() !== 'html') {
    parts.unshift('html:nth-child(1)');
  }

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const m = part.match(/^([a-zA-Z0-9_-]+)(?:\:nth-child\((\d+)\))?$/);
    if (!m) return null;
    const tag = m[1].toLowerCase();
    const nth = m[2] ? parseInt(m[2], 10) : 1;
    if (!current) return null;
    const children = Array.from(current.children || []).filter(
      (c) => c.tagName && c.tagName.toLowerCase() === tag
    );
    if (!children.length) return null;
    // Более гибкий поиск: если nth выходит за границы, берём последний элемент нужного тега
    const idx = nth > 0 ? Math.min(children.length, nth) - 1 : children.length - 1;
    current = children[idx] || null;
    if (!current) return null;
  }
  return current || null;
}

export function applyHtmlOp({ html, op }) {
  const source = String(html ?? '');
  if (!op || typeof op !== 'object') return { ok: false, error: 'applyHtmlOp: op required' };

  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'text/html');
  const hasDoctype = /^\s*<!doctype/i.test(source);

  if (op.type === 'delete') {
    const sel = String(op.selector || '');
    const id = op.id || null;
    const el = findElement(doc, { selector: sel, id });
    if (!el) return { ok: false, error: `applyHtmlOp: element not found: ${sel || id || 'unknown'}` };
    el.remove();
    const out = `${hasDoctype ? '<!DOCTYPE html>\\n' : ''}${doc.documentElement.outerHTML}`;
    return { ok: true, html: out, changed: true };
  }

  if (op.type === 'insert') {
    const targetSel = String(op.targetSelector || '');
    const targetId = op.targetId || null;
    const mode = op.mode === 'sibling' ? 'sibling' : 'child';
    const target = findElement(doc, { selector: targetSel, id: targetId });
    if (!target) return { ok: false, error: `applyHtmlOp: target not found: ${targetSel || targetId || 'unknown'}` };

    const tmp = doc.createElement('div');
    tmp.innerHTML = String(op.html || '');
    const newEl = tmp.firstElementChild;
    if (!newEl) return { ok: false, error: 'applyHtmlOp: invalid html snippet' };

    if (mode === 'child') {
      target.appendChild(newEl);
    } else {
      target.insertAdjacentElement('afterend', newEl);
    }

    const out = `${hasDoctype ? '<!DOCTYPE html>\\n' : ''}${doc.documentElement.outerHTML}`;
    return { ok: true, html: out, changed: true };
  }

  if (op.type === 'reparent') {
    const sourceSel = String(op.sourceSelector || '');
    const sourceId = op.sourceId || null;
    const targetSel = String(op.targetSelector || '');
    const targetId = op.targetId || null;
    const srcEl = findElement(doc, { selector: sourceSel, id: sourceId });
    const dstEl = findElement(doc, { selector: targetSel, id: targetId });
    if (!srcEl) return { ok: false, error: `applyHtmlOp: source not found: ${sourceSel || sourceId || 'unknown'}` };
    if (!dstEl) return { ok: false, error: `applyHtmlOp: target not found: ${targetSel || targetId || 'unknown'}` };
    if (srcEl === dstEl) return { ok: false, error: 'applyHtmlOp: source == target' };
    dstEl.appendChild(srcEl);
    const out = `${hasDoctype ? '<!DOCTYPE html>\\n' : ''}${doc.documentElement.outerHTML}`;
    return { ok: true, html: out, changed: true };
  }

  if (op.type === 'setText') {
    const sel = String(op.selector || '');
    const id = op.id || null;
    const text = String(op.text ?? '');
    const el = findElement(doc, { selector: sel, id });
    if (!el) return { ok: false, error: `applyHtmlOp: element not found: ${sel || id || 'unknown'}` };
    el.textContent = text;
    const out = `${hasDoctype ? '<!DOCTYPE html>\\n' : ''}${doc.documentElement.outerHTML}`;
    return { ok: true, html: out, changed: true };
  }

  return { ok: false, error: `applyHtmlOp: unsupported op.type ${op.type}` };
}


