function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCssDecls(blockText) {
  const map = {};
  String(blockText || '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((decl) => {
      const idx = decl.indexOf(':');
      if (idx < 0) return;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const val = decl.slice(idx + 1).trim();
      if (!prop) return;
      map[prop] = val;
    });
  return map;
}

function serializeCssDecls(map) {
  const lines = Object.entries(map)
    .filter(([k, v]) => k && v != null && String(v).length > 0)
    .map(([k, v]) => `  ${k}: ${String(v)};`);
  return `{\n${lines.join('\n')}\n}`;
}

/**
 * patch: { [cssProp]: string|number }
 */
export function applyCssRulePatch({ css, className, patch }) {
  const source = String(css ?? '');
  const cls = String(className || '').trim();
  if (!cls) return { ok: false, error: 'applyCssRulePatch: className is required' };

  const ruleRe = new RegExp(`\\.${escapeRegExp(cls)}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const m = source.match(ruleRe);

  const patchMap = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const key = String(k).trim().toLowerCase();
    if (!key) continue;
    patchMap[key] = typeof v === 'number' ? String(v) : String(v);
  }

  if (m) {
    const current = parseCssDecls(m[1]);
    Object.assign(current, patchMap);
    const replacement = `.${cls} ${serializeCssDecls(current)}`;
    return { ok: true, css: source.replace(ruleRe, replacement), changed: true };
  }

  const newRule = `\n\n.${cls} ${serializeCssDecls(patchMap)}\n`;
  return { ok: true, css: source + newRule, changed: true };
}


