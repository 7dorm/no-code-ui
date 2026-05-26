export type StyleValue = string | number | boolean | null;
export type StylePatch = Record<string, StyleValue>;
export type FileTypeLike = 'html' | 'react' | 'react-native' | string;
export type StyleRow = { key: string; value: StyleValue | undefined };

export function camelToKebab(key: string) {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

export function kebabToCamel(key: string) {
  const s = String(key || '').trim().toLowerCase();
  return s.replace(/-([a-z0-9])/g, (_match: string, c: string) => String(c).toUpperCase());
}

export function normalizeStyleKey({ fileType, key }: { fileType: FileTypeLike; key: string }) {
  const k = String(key || '').trim();
  if (!k) return '';
  if (fileType === 'html') return camelToKebab(k);
  return k.includes('-') ? kebabToCamel(k) : k;
}

export function parseValueForReactLike(value: unknown): StyleValue {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;

  const px = v.match(/^(-?\d+(\.\d+)?)px$/i);
  if (px) return Number(px[1]);
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function parseStyleText(text: string): Record<string, string> {
  const src = String(text || '');
  const out: Record<string, string> = {};
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

export function buildPatchFromKv({
  fileType,
  rows,
}: {
  fileType: FileTypeLike;
  rows: StyleRow[];
}): StylePatch {
  const patch: StylePatch = {};
  (rows || []).forEach((r) => {
    const rawKey = r?.key;
    const rawVal = r?.value;
    const k = normalizeStyleKey({ fileType, key: String(rawKey ?? '') });
    if (!k) return;
    if (fileType === 'html') patch[k] = String(rawVal ?? '').trim();
    else patch[k] = parseValueForReactLike(rawVal);
  });
  return patch;
}

export function buildPatchFromText({
  fileType,
  text,
}: {
  fileType: FileTypeLike;
  text: string;
}) {
  const raw = parseStyleText(text);
  const rows: StyleRow[] = Object.entries(raw).map(([key, value]) => ({ key, value }));
  return buildPatchFromKv({ fileType, rows });
}

export function toHtmlStyleAttr(patch: StylePatch) {
  return Object.entries(patch || {})
    .filter(([k, v]) => k && v != null && String(v).trim().length > 0)
    .map(([k, v]) => `${camelToKebab(k)}: ${String(v).trim()}`)
    .join('; ');
}

export function toReactStyleObjectText(patch: StylePatch) {
  const parts = Object.entries(patch || {})
    .map(([k, v]) => {
      if (!k) return null;
      if (typeof v === 'number' || typeof v === 'boolean' || v === null) return `${k}: ${String(v)}`;
      return `${k}: ${JSON.stringify(String(v))}`;
    })
    .filter((value): value is string => value !== null);
  return parts.join(', ');
}

export function parseInlineStyleToBaseline({
  fileType,
  inline,
}: {
  fileType: FileTypeLike;
  inline: string;
}): StylePatch {
  const raw = parseStyleText(inline || '');
  const norm: StylePatch = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeStyleKey({ fileType, key: k });
    if (!nk) continue;
    if (fileType === 'html') norm[nk] = String(v).trim();
    else norm[nk] = parseValueForReactLike(v);
  }
  return norm;
}
