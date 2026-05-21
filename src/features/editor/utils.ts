import { parse } from '@babel/parser';
import generate from '@babel/generator';
import landingSoftCssTemplate from '../../style-library/templates/landing-soft.css?raw';
import dashboardCleanCssTemplate from '../../style-library/templates/dashboard-clean.css?raw';
import reactIconsFaUrl from 'react-icons/fa?url';
import reactIconsMdUrl from 'react-icons/md?url';
import reactIconsHiUrl from 'react-icons/hi?url';
import reactIconsHi2Url from 'react-icons/hi2?url';
import reactIconsIo5Url from 'react-icons/io5?url';
import { resolvePathSync } from './lib/path-resolver';
import type { LayersTree, StagedComponentImport, StyleLibraryEntry, StyleTemplate } from './types';

export function getPathBasename(filePath: string | null | undefined): string {
  return String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
}

export function formatContentForWrite(filePath: string, content: string): string {
  const normalizedPath = String(filePath || '').toLowerCase();
  const source = String(content ?? '');

  try {
    if (normalizedPath.endsWith('.json')) {
      const parsed = JSON.parse(source);
      return JSON.stringify(parsed, null, 2) + '\n';
    }

    const isJsLike = /\.(js|jsx|ts|tsx)$/.test(normalizedPath);
    if (!isJsLike) {
      return source;
    }

    const isTs = /\.(ts|tsx)$/.test(normalizedPath);
    const isJsx = /\.(jsx|tsx)$/.test(normalizedPath);

    const ast = parse(source, {
      sourceType: 'module',
      plugins: [
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'decorators-legacy',
        'dynamicImport',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        ...(isJsx ? (['jsx'] as const) : []),
        ...(isTs ? (['typescript'] as const) : []),
      ],
    });

    const output = generate(ast, {
      compact: false,
      concise: false,
      retainLines: false,
      comments: true,
      jsescOption: { minimal: true },
    });
    return output.code + '\n';
  } catch {
    return source;
  }
}

export function isInternalSourceFilePath(filePath: string | null | undefined): boolean {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return /(^|\/)src\/.+\.(jsx?|tsx?)$/i.test(normalized) && !/(^|\/)tests\//i.test(normalized);
}

export function getMrpakIdBasename(id: string | null | undefined): string {
  const match = String(id || '').match(/^mrpak:([^:]+):/);
  return match ? match[1] : '';
}

export function stripKnownScriptExtension(filePath: string | null | undefined): string {
  return String(filePath || '').replace(/\.(js|jsx|ts|tsx)$/i, '');
}

export function toPosixPath(value: string): string {
  return String(value || '').replace(/\\/g, '/');
}

export const STYLE_TEMPLATES: StyleTemplate[] = [
  { id: 'landing-soft', fileName: 'landing-soft.css', title: 'Landing Soft', cssText: landingSoftCssTemplate },
  { id: 'dashboard-clean', fileName: 'dashboard-clean.css', title: 'Dashboard Clean', cssText: dashboardCleanCssTemplate },
];

export const LOCAL_EXTERNAL_MODULE_URLS: Record<string, string> = {
  'react-icons/fa': reactIconsFaUrl,
  'react-icons/md': reactIconsMdUrl,
  'react-icons/hi': reactIconsHiUrl,
  'react-icons/hi2': reactIconsHi2Url,
  'react-icons/io5': reactIconsIo5Url,
};

export function kebabToCamel(value: string): string {
  return String(value || '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

export function parseCssRuleToPatch(cssText: string, fileType: string | null): Record<string, any> {
  const bodyMatch = String(cssText || '').match(/\{([^}]*)\}/);
  if (!bodyMatch) return {};
  const body = bodyMatch[1];
  const patch: Record<string, any> = {};
  body
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return;
      const rawKey = line.slice(0, idx).trim();
      const rawValue = line.slice(idx + 1).trim();
      if (!rawKey || !rawValue) return;
      const key = fileType === 'html' ? rawKey : kebabToCamel(rawKey);
      patch[key] = rawValue;
    });
  return patch;
}

export function ensureCssImportInCode(sourceCode: string, importPath: string): string {
  const source = String(sourceCode || '');
  const normalizedImport = String(importPath || '').trim();
  if (!normalizedImport) return source;
  const importLine = `import '${normalizedImport}';`;
  if (source.includes(importLine) || source.includes(`import "${normalizedImport}";`)) {
    return source;
  }

  const lines = source.split('\n');
  let insertIndex = 0;
  while (insertIndex < lines.length && lines[insertIndex].trim().startsWith('import ')) {
    insertIndex += 1;
  }
  lines.splice(insertIndex, 0, importLine);
  return lines.join('\n');
}

export function resolveRelativePath(baseDir: string, inputPath: string): string {
  const baseParts = toPosixPath(baseDir).split('/').filter(Boolean);
  const relParts = toPosixPath(inputPath).split('/').filter(Boolean);
  const stack = [...baseParts];
  relParts.forEach((part) => {
    if (part === '.' || part === '') return;
    if (part === '..') {
      stack.pop();
      return;
    }
    stack.push(part);
  });
  return stack.join('/');
}

export function extractImportedCssPathsFromCode(sourceCode: string, fileType: string | null, filePath: string): string[] {
  const code = String(sourceCode || '');
  const currentDir = toPosixPath(filePath).split('/').slice(0, -1).join('/');
  const results = new Set<string>();

  if (!currentDir) return [];

  const pushCssPath = (rawPath: string) => {
    const value = String(rawPath || '').trim();
    if (!value || !/\.css$/i.test(value)) return;
    if (/^(https?:)?\/\//i.test(value)) return;
    if (/^[A-Za-z]:\//.test(value) || value.startsWith('/')) {
      results.add(toPosixPath(value));
      return;
    }
    results.add(resolveRelativePath(currentDir, value));
  };

  if (fileType === 'html') {
    const linkRegex = /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+\.css)["'][^>]*>/gi;
    let match: RegExpExecArray | null = null;
    while ((match = linkRegex.exec(code))) {
      pushCssPath(match[1]);
    }
    return Array.from(results);
  }

  const importRegex = /import\s+['"]([^'"]+\.css)['"];?/g;
  let match: RegExpExecArray | null = null;
  while ((match = importRegex.exec(code))) {
    pushCssPath(match[1]);
  }
  return Array.from(results);
}

export function parseCssLibraryEntries(cssText: string, fileType: string | null, cssPath: string): StyleLibraryEntry[] {
  const entries: StyleLibraryEntry[] = [];
  const sourceFileName = getPathBasename(cssPath);
  const ruleRegex = /\.([A-Za-z_-][A-Za-z0-9_-]*)\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null = null;

  while ((match = ruleRegex.exec(String(cssText || '')))) {
    const className = String(match[1] || '').trim();
    const body = String(match[2] || '').trim();
    if (!className || !body) continue;
    const stylePatch = parseCssRuleToPatch(`{${body}}`, fileType);
    entries.push({
      id: `${cssPath}::${className}`,
      name: `.${className}`,
      path: cssPath,
      sourceFileName,
      className,
      cssText,
      stylePatch,
    });
  }

  return entries;
}

export function upsertClassNameInJsxOpeningTag(openTag: string, classToken: string): { ok: true; text: string } | { ok: false; error: string } {
  const token = String(classToken || '').trim();
  if (!token) return { ok: false, error: 'className token is empty' };

  const appendToken = (currentValue: string) => {
    const items = currentValue.split(/\s+/).map((v) => v.trim()).filter(Boolean);
    if (!items.includes(token)) items.push(token);
    return items.join(' ');
  };

  const replaceQuoted = (quote: "'" | '"') => {
    const re = new RegExp(`\\bclassName\\s*=\\s*${quote}([^${quote}]*)${quote}`);
    const found = openTag.match(re);
    if (!found) return null;
    const nextValue = appendToken(found[1] || '');
    return openTag.replace(re, `className=${quote}${nextValue}${quote}`);
  };

  const doubleQuoted = replaceQuoted('"');
  if (doubleQuoted) return { ok: true, text: doubleQuoted };
  const singleQuoted = replaceQuoted("'");
  if (singleQuoted) return { ok: true, text: singleQuoted };

  const exprMatch = openTag.match(/\bclassName\s*=\s*\{\s*(['"])([^'"]*)\1\s*\}/);
  if (exprMatch) {
    const quote = exprMatch[1];
    const nextValue = appendToken(exprMatch[2] || '');
    return {
      ok: true,
      text: openTag.replace(/\bclassName\s*=\s*\{\s*(['"])([^'"]*)\1\s*\}/, `className={${quote}${nextValue}${quote}}`),
    };
  }

  if (/\bclassName\s*=/.test(openTag)) {
    return { ok: false, error: 'Dynamic className expressions are not supported for style library apply yet.' };
  }

  const insertAt = openTag.lastIndexOf('>');
  if (insertAt < 0) return { ok: false, error: 'Opening tag malformed.' };
  let attrsEnd = insertAt;
  let scan = insertAt - 1;
  while (scan >= 0 && /\s/.test(openTag[scan])) scan -= 1;
  if (scan >= 0 && openTag[scan] === '/') attrsEnd = scan;
  return {
    ok: true,
    text: `${openTag.slice(0, attrsEnd)} className="${token}"${openTag.slice(attrsEnd)}`,
  };
}

export function getRelativeImportPath(fromFilePath: string, toFilePath: string): string {
  const from = toPosixPath(fromFilePath).split('/').filter(Boolean);
  const to = toPosixPath(stripKnownScriptExtension(toFilePath)).split('/').filter(Boolean);
  if (!from.length || !to.length) return './' + (to.join('/') || '');

  const fromDir = from.slice(0, -1);
  let common = 0;
  while (common < fromDir.length && common < to.length && fromDir[common] === to[common]) {
    common += 1;
  }
  const up = fromDir.slice(common).map(() => '..');
  const down = to.slice(common);
  const rel = [...up, ...down].join('/');
  if (!rel) return './';
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export function getRelativeAssetImportPath(fromFilePath: string, toFilePath: string): string {
  const from = toPosixPath(fromFilePath).split('/').filter(Boolean);
  const to = toPosixPath(toFilePath).split('/').filter(Boolean);
  if (!from.length || !to.length) return './' + (to.join('/') || '');

  const fromDir = from.slice(0, -1);
  let common = 0;
  while (common < fromDir.length && common < to.length && fromDir[common] === to[common]) {
    common += 1;
  }
  const up = fromDir.slice(common).map(() => '..');
  const down = to.slice(common);
  const rel = [...up, ...down].join('/');
  if (!rel) return './';
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export function stripFileExtension(fileName: string): string {
  return String(fileName || '').replace(/\.[^/.]+$/, '');
}

export function toSafeIdentifier(value: string): string {
  const raw = String(value || '').replace(/[^A-Za-z0-9_$]+/g, '_');
  const trimmed = raw.replace(/^_+/, '');
  const safe = trimmed || 'asset';
  return /^[A-Za-z_$]/.test(safe) ? safe : `asset_${safe}`;
}

export function ensureUniqueImportName(base: string, used: Set<string>): string {
  let candidate = base;
  let index = 1;
  while (used.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

export function ensureComponentImportInCode(
  code: string,
  item: StagedComponentImport
): string {
  const source = String(code ?? '');
  const localName = String(item?.localName || '').trim();
  const importPath = String(item?.importPath || '').trim();
  if (!localName || !importPath) return source;

  try {
    const ast = parse(source, {
      sourceType: 'module',
      plugins: [
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'decorators-legacy',
        'dynamicImport',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'jsx',
        'typescript',
      ],
    }) as any;

    const body = Array.isArray(ast?.program?.body) ? ast.program.body : [];

    const hasLocalImport = body.some(
      (node: any) =>
        node?.type === 'ImportDeclaration' &&
        Array.isArray(node.specifiers) &&
        node.specifiers.some((spec: any) => spec?.local?.name === localName)
    );
    if (hasLocalImport) return source;

    const existingImportByPath = body.find(
      (node: any) => node?.type === 'ImportDeclaration' && node?.source?.value === importPath
    );
    const specifier =
      item.importKind === 'named'
        ? {
            type: 'ImportSpecifier',
            local: { type: 'Identifier', name: localName },
            imported: { type: 'Identifier', name: localName },
            importKind: 'value',
          }
        : {
            type: 'ImportDefaultSpecifier',
            local: { type: 'Identifier', name: localName },
          };

    if (existingImportByPath) {
      existingImportByPath.specifiers = Array.isArray(existingImportByPath.specifiers)
        ? [...existingImportByPath.specifiers, specifier]
        : [specifier];
    } else {
      const importNode = {
        type: 'ImportDeclaration',
        specifiers: [specifier],
        source: { type: 'StringLiteral', value: importPath },
        importKind: 'value',
      };
      const firstNonImportIndex = body.findIndex((node: any) => node?.type !== 'ImportDeclaration');
      if (firstNonImportIndex === -1) {
        body.push(importNode);
      } else {
        body.splice(firstNonImportIndex, 0, importNode);
      }
    }

    return (
      generate(ast, {
        compact: false,
        concise: false,
        retainLines: false,
        comments: true,
      }).code + '\n'
    );
  } catch {
    return source;
  }
}

export function collectImportLocalNames(code: string): Set<string> {
  const names = new Set<string>();
  try {
    const ast = parse(String(code ?? ''), {
      sourceType: 'module',
      plugins: [
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'decorators-legacy',
        'dynamicImport',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'jsx',
        'typescript',
      ],
    }) as any;

    const body = Array.isArray(ast?.program?.body) ? ast.program.body : [];
    body.forEach((node: any) => {
      if (node?.type !== 'ImportDeclaration' || !Array.isArray(node.specifiers)) return;
      node.specifiers.forEach((spec: any) => {
        const local = spec?.local?.name;
        if (local) names.add(String(local));
      });
    });
  } catch {
    return names;
  }
  return names;
}

export function resolveSourceFilePathFromDependencies(
  currentFilePath: string,
  sourcePath: string | null | undefined,
  dependencyPaths: string[]
): string | null {
  const raw = String(sourcePath || '').trim();
  if (!raw) return null;

  const resolved = resolvePathSync(currentFilePath, raw);
  const resolvedNoExt = stripKnownScriptExtension(resolved);
  const candidates = dependencyPaths.filter(Boolean);

  const exactMatch = candidates.find((candidate) => {
    const normalized = String(candidate || '').replace(/\\/g, '/');
    return normalized === resolved || stripKnownScriptExtension(normalized) === resolvedNoExt;
  });
  if (exactMatch) return exactMatch;

  const fileName = getPathBasename(resolvedNoExt);
  const suffixMatch = candidates.find((candidate) => {
    const normalized = stripKnownScriptExtension(String(candidate || '').replace(/\\/g, '/'));
    return normalized.endsWith(`/${resolvedNoExt}`) || normalized.endsWith(`/${fileName}`);
  });
  if (suffixMatch) return suffixMatch;

  return resolved || null;
}

export function enrichLayersTree(
  tree: LayersTree,
  filePath: string,
  dependencyPaths: string[]
): LayersTree {
  const rootBasename = getPathBasename(filePath);
  const dependencyByBasename = new Map<string, string[]>();
  dependencyPaths.forEach((depPath) => {
    const basename = getPathBasename(depPath);
    if (!basename) return;
    const list = dependencyByBasename.get(basename) || [];
    list.push(depPath);
    dependencyByBasename.set(basename, list);
  });

  const nextNodes: Record<string, any> = {};
  Object.entries(tree?.nodes || {}).forEach(([id, node]) => {
    const sourceBasename = getMrpakIdBasename(id);
    const sourceCandidates = dependencyByBasename.get(sourceBasename) || [];
    const explicitSourcePath = typeof node?.sourcePath === 'string' ? node.sourcePath : null;
    const resolvedExplicitSourcePath = resolveSourceFilePathFromDependencies(
      filePath,
      explicitSourcePath,
      dependencyPaths
    );
    const explicitSourceBasename = getPathBasename(resolvedExplicitSourcePath);
    const explicitSourceCandidates = explicitSourceBasename
      ? dependencyByBasename.get(explicitSourceBasename) || []
      : [];
    const sourceFilePath =
      resolvedExplicitSourcePath && explicitSourceCandidates.length > 0
        ? explicitSourceCandidates[0]
        : resolvedExplicitSourcePath && explicitSourceBasename
        ? resolvedExplicitSourcePath
        : sourceBasename && sourceBasename !== rootBasename
        ? sourceCandidates[0] || null
        : filePath;
    nextNodes[id] = {
      ...node,
      sourceBasename,
      sourceFilePath,
      componentName: node?.componentName || null,
      isIsolatedComponent:
        Boolean(node?.isIsolatedComponent) || Boolean(sourceBasename && sourceBasename !== rootBasename),
    };
  });

  return {
    ...tree,
    nodes: nextNodes,
  };
}
