export function camelToKebab(key) {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

export function kebabToCamel(key) {
  const s = String(key || '').trim().toLowerCase();
  return s.replace(/-([a-z0-9])/g, (_, c) => String(c).toUpperCase());
}

export function normalizeStyleKey({ fileType, key }) {
  const k = String(key || '').trim();
  if (!k) return '';
  if (fileType === 'html') return camelToKebab(k);
  // react / react-native
  return k.includes('-') ? kebabToCamel(k) : k;
}

export function parseValueForReactLike(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;

  // px -> number
  const px = v.match(/^(-?\d+(\.\d+)?)px$/i);
  if (px) return Number(px[1]);

  // plain number
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);

  return v;
}

export function parseStyleText(text) {
  // принимает и kebab, и camel: "prop: value; prop2:value2"
  const src = String(text || '');
  const out = {};
  src.split(';').forEach((chunk) => {
    const part = chunk.trim();
    if (!part) return;
    const idx = part.indexOf(':');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) return;
    out[k] = v;
  });
  return out;
}

export function buildPatchFromKv({ fileType, rows }) {
  const patch = {};
  (rows || []).forEach((r) => {
    const rawKey = r?.key;
    const rawVal = r?.value;
    const k = normalizeStyleKey({ fileType, key: rawKey });
    if (!k) return;
    if (fileType === 'html') {
      patch[k] = String(rawVal ?? '').trim();
    } else {
      patch[k] = parseValueForReactLike(rawVal);
    }
  });
  return patch;
}

export function buildPatchFromText({ fileType, text }) {
  const raw = parseStyleText(text);
  const rows = Object.entries(raw).map(([key, value]) => ({ key, value }));
  return buildPatchFromKv({ fileType, rows });
}

export function toHtmlStyleAttr(patch) {
  // patch: {kebab: value}
  return Object.entries(patch || {})
    .filter(([k, v]) => k && v != null && String(v).trim().length > 0)
    .map(([k, v]) => `${camelToKebab(k)}: ${String(v).trim()}`)
    .join('; ');
}

export function toReactStyleObjectText(patch) {
  // patch keys assumed camelCase, values can be number/bool/null/string
  const parts = Object.entries(patch || {}).map(([k, v]) => {
    if (!k) return null;
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return `${k}: ${String(v)}`;
    const s = String(v);
    // строка как JS-строка
    return `${k}: ${JSON.stringify(s)}`;
  }).filter(Boolean);
  return parts.join(', ');
}

export function parseInlineStyleToBaseline({ fileType, inline }) {
  const raw = parseStyleText(inline || '');
  const norm = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeStyleKey({ fileType, key: k });
    if (!nk) continue;
    if (fileType === 'html') {
      norm[nk] = String(v).trim();
    } else {
      norm[nk] = parseValueForReactLike(v);
    }
  }
  return norm;
}


