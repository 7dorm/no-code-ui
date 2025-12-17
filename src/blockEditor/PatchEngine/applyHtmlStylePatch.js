function parseStyleAttr(styleText) {
  const map = {};
  const s = String(styleText || '').trim();
  if (!s) return map;
  s.split(';').forEach((part) => {
    const p = part.trim();
    if (!p) return;
    const idx = p.indexOf(':');
    if (idx < 0) return;
    const key = p.slice(0, idx).trim().toLowerCase();
    const value = p.slice(idx + 1).trim();
    if (!key) return;
    map[key] = value;
  });
  return map;
}

function serializeStyleAttr(map) {
  return Object.entries(map)
    .filter(([k, v]) => k && v != null && String(v).length > 0)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('; ');
}

/**
 * patch: { [cssPropKebabOrLower]: string|number }
 */
export function applyHtmlStylePatch({ html, selector, patch }) {
  const source = String(html ?? '');
  if (!selector || typeof selector !== 'string') {
    return { ok: false, error: 'applyHtmlStylePatch: selector is required' };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'text/html');
  const el = doc.querySelector(selector);
  if (!el) {
    return { ok: false, error: `applyHtmlStylePatch: element not found for selector: ${selector}` };
  }

  const current = parseStyleAttr(el.getAttribute('style'));
  for (const [k, v] of Object.entries(patch || {})) {
    const key = String(k).trim().toLowerCase();
    if (!key) continue;
    current[key] = typeof v === 'number' ? String(v) : String(v);
  }
  el.setAttribute('style', serializeStyleAttr(current));

  const hasDoctype = /^\s*<!doctype/i.test(source);
  const serialized = `${hasDoctype ? '<!DOCTYPE html>\\n' : ''}${doc.documentElement.outerHTML}`;
  return { ok: true, html: serialized, changed: true };
}


