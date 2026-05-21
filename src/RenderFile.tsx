import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import WebView from './WebView';
import BlockEditorPanel, { useBlockEditorSidebarController } from './BlockEditorPanel';
import { instrumentJsx } from './blockEditor/JsxInstrumenter';
import { instrumentHtml } from './blockEditor/HtmlInstrumenter';
import { MRPAK_MSG, MRPAK_CMD, isMrpakMessage } from './blockEditor/EditorProtocol';
import { applyStylePatch, applyHtmlOp, applyJsxDelete, applyJsxInsert, applyJsxReparent, applyJsxSetText, parseStyleImports, applyExternalStylePatch, replaceStyleReferenceInJsx } from './blockEditor/PatchEngine';
import { loadLayerNames, upsertLayerName } from './blockEditor/LayerNamesStore';
import { MonacoEditorWrapper } from './shared/ui/monaco-editor-wrapper';
import { getFileType, getMonacoLanguage } from './shared/lib/file-type-detector';
import { readFile, writeFile as writeFileRaw, watchFile, unwatchFile, onFileChanged, readDirectory, readFileBase64 } from './shared/api/electron-api';
import { openFileDialog } from './shared/api/filesystem-api';
import { createFolder } from './features/file-operations/lib/file-operations';
import { syncCodeChangesToEditor, createEditorCommandsFromChanges } from './blockEditor/AstSync';
import { parse } from '@babel/parser';
import generate from '@babel/generator';
import { AstBidirectionalManager } from './blockEditor/AstBidirectional';
import { injectBlockEditorScript } from './features/file-renderer/lib/block-editor-script';
import { findProjectRoot, resolvePath, resolvePathSync } from './features/file-renderer/lib/path-resolver';
import { extractImports, detectComponents, wrapImportedComponentUsages } from './features/file-renderer/lib/react-processor';
import { createFramework, isFrameworkSupported } from './frameworks/FrameworkFactory';
import { BlockEditorSidebar } from './shared/ui/BlockEditorSidebar';
import { parseStyleText } from './blockEditor/styleUtils';
import { extractJsxToComponent } from './blockEditor/extractJsxToComponent';
import landingSoftCssTemplate from './style-library/templates/landing-soft.css?raw';
import dashboardCleanCssTemplate from './style-library/templates/dashboard-clean.css?raw';
import reactIconsFaUrl from 'react-icons/fa?url';
import reactIconsMdUrl from 'react-icons/md?url';
import reactIconsHiUrl from 'react-icons/hi?url';
import reactIconsHi2Url from 'react-icons/hi2?url';
import reactIconsIo5Url from 'react-icons/io5?url';

type StylePatch = Record<string, any>;

type PatchHistoryOperation = {
  type: 'patch';
  blockId: string;
  patch: StylePatch;
  previousValue?: StylePatch | null;
};

type InsertHistoryOperation = {
  type: 'insert';
  blockId: string;
  targetId: string;
  mode: 'child' | 'before' | 'after';
  snippet: string;
  fileType: string | null;
  filePath: string;
};

type DeleteHistoryOperation = {
  type: 'delete';
  blockId: string;
  parentId: string;
  snippet: string;
  fileType: string | null;
  filePath: string;
};

type DeleteOperationDedup = {
  blockId: string;
  timestamp: number;
};

type SetTextHistoryOperation = {
  type: 'setText';
  blockId: string;
  text: string;
  previousText?: string | null;
};

type HistoryOperation =
  | PatchHistoryOperation
  | InsertHistoryOperation
  | DeleteHistoryOperation
  | StagedOpReparent
  | SetTextHistoryOperation;

type StagedOpInsert = {
  type: 'insert';
  targetId: string;
  mode: 'child' | 'before' | 'after';
  snippet: string;
  blockId: string;
  fileType: string | null;
  filePath: string;
};

type StagedOpDelete = {
  type: 'delete';
  blockId: string;
  fileType: string | null;
  filePath: string;
};

type StagedOpSetText = {
  type: 'setText';
  blockId: string;
  text: string;
  fileType: string | null;
  filePath: string;
};

type StagedOpReparent = {
  type: 'reparent';
  blockId?: string;
  oldParentId?: string;
  newParentId?: string;
  sourceId?: string;
  targetParentId?: string;
  targetBeforeId?: string | null;
  fileType: string | null;
  filePath: string;
};

type StagedOp = StagedOpInsert | StagedOpDelete | StagedOpSetText | StagedOpReparent;

type BlockMap = Record<string, any>;

type LayersTree = {
  nodes: Record<string, any>;
  rootIds: string[];
};

type LayerNames = Record<string, string>;

type LivePosition = {
  left: number | null;
  top: number | null;
  width: number | null;
  height: number | null;
};

type ExternalComponentDragPayload = {
  sourceFilePath: string;
  componentName: string;
  importKind: 'default' | 'named';
  hasProps: boolean;
  propsCount: number;
  supportsStyleOnlyArg?: boolean;
};

type ExternalFileDragPayload = {
  sourceFilePath: string;
  kind: 'image';
};

type StagedComponentImport = {
  localName: string;
  importPath: string;
  importKind: 'default' | 'named';
};

type StyleLibraryEntry = {
  id: string;
  name: string;
  path: string;
  sourceFileName: string;
  className: string;
  cssText: string;
  stylePatch: Record<string, any>;
};

function getPathBasename(filePath: string | null | undefined): string {
  return String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
}

function formatContentForWrite(filePath: string, content: string): string {
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

function isInternalSourceFilePath(filePath: string | null | undefined): boolean {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return /(^|\/)src\/.+\.(jsx?|tsx?)$/i.test(normalized) && !/(^|\/)tests\//i.test(normalized);
}

function getMrpakIdBasename(id: string | null | undefined): string {
  const match = String(id || '').match(/^mrpak:([^:]+):/);
  return match ? match[1] : '';
}

function stripKnownScriptExtension(filePath: string | null | undefined): string {
  return String(filePath || '').replace(/\.(js|jsx|ts|tsx)$/i, '');
}

function toPosixPath(value: string): string {
  return String(value || '').replace(/\\/g, '/');
}

const STYLE_TEMPLATES: Array<{ id: string; fileName: string; title: string; cssText: string }> = [
  { id: 'landing-soft', fileName: 'landing-soft.css', title: 'Landing Soft', cssText: landingSoftCssTemplate },
  { id: 'dashboard-clean', fileName: 'dashboard-clean.css', title: 'Dashboard Clean', cssText: dashboardCleanCssTemplate },
];

const LOCAL_EXTERNAL_MODULE_URLS: Record<string, string> = {
  'react-icons/fa': reactIconsFaUrl,
  'react-icons/md': reactIconsMdUrl,
  'react-icons/hi': reactIconsHiUrl,
  'react-icons/hi2': reactIconsHi2Url,
  'react-icons/io5': reactIconsIo5Url,
};

function kebabToCamel(value: string): string {
  return String(value || '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function parseCssRuleToPatch(cssText: string, fileType: string | null): Record<string, any> {
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

function ensureCssImportInCode(sourceCode: string, importPath: string): string {
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

function resolveRelativePath(baseDir: string, inputPath: string): string {
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

function extractImportedCssPathsFromCode(sourceCode: string, fileType: string | null, filePath: string): string[] {
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

function parseCssLibraryEntries(cssText: string, fileType: string | null, cssPath: string): StyleLibraryEntry[] {
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

function upsertClassNameInJsxOpeningTag(openTag: string, classToken: string): { ok: true; text: string } | { ok: false; error: string } {
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

function getRelativeImportPath(fromFilePath: string, toFilePath: string): string {
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

function getRelativeAssetImportPath(fromFilePath: string, toFilePath: string): string {
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

function stripFileExtension(fileName: string): string {
  return String(fileName || '').replace(/\.[^/.]+$/, '');
}

function toSafeIdentifier(value: string): string {
  const raw = String(value || '').replace(/[^A-Za-z0-9_$]+/g, '_');
  const trimmed = raw.replace(/^_+/, '');
  const safe = trimmed || 'asset';
  return /^[A-Za-z_$]/.test(safe) ? safe : `asset_${safe}`;
}

function ensureUniqueImportName(base: string, used: Set<string>): string {
  let candidate = base;
  let index = 1;
  while (used.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function ensureComponentImportInCode(
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

function collectImportLocalNames(code: string): Set<string> {
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

function resolveSourceFilePathFromDependencies(
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

function enrichLayersTree(
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

const IMPORTED_COMPONENT_BOUNDARY_HELPER = `
function MrpakImportedBoundary({
  __mrpakComponent: Component,
  __mrpakName,
  __mrpakSource,
  __mrpakId,
  children,
  ...rest
}) {
  return React.createElement(
    'div',
    {
      'data-no-code-ui-id': __mrpakId,
      'data-mrpak-component-boundary': '1',
      'data-mrpak-component-name': __mrpakName,
      'data-mrpak-source': __mrpakSource,
      style: { display: 'contents' },
    },
    React.createElement(Component, rest, children)
  );
}
`;

function RenderFile({
  filePath,
  selectedComponentName,
  projectPath,
  viewMode,
  onViewModeChange,
  showSplitSidebar,
  showSplitPreview,
  showSplitCode,
  canvasWidth = 1280,
  canvasHeight = 800,
  canvasDevice = 'desktop',
  aggressivePreviewMode: externalAggressivePreviewMode = false,
  externalComponentDrag = null,
  externalFileDrag = null,
  onProjectFilesChanged,
  onOpenFile,
}: {
  filePath: string;
  selectedComponentName?: string | null;
  projectPath: string | null;
  viewMode: 'preview' | 'split' | 'changes';
  onViewModeChange: (mode: 'preview' | 'split' | 'changes') => void;
  showSplitSidebar: boolean;
  showSplitPreview: boolean;
  showSplitCode: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  canvasDevice?: 'desktop' | 'mobile';
  aggressivePreviewMode?: boolean;
  externalComponentDrag?: ExternalComponentDragPayload | null;
  externalFileDrag?: ExternalFileDragPayload | null;
  onProjectFilesChanged?: () => void;
  onOpenFile?: (path: string) => void;
}) {
  const aggressivePreviewMode = externalAggressivePreviewMode;
  const normalizedCanvasWidth = Math.max(240, Math.min(3840, Math.round(Number(canvasWidth) || 1280)));
  const normalizedCanvasHeight = Math.max(240, Math.min(3840, Math.round(Number(canvasHeight) || 800)));
  const previewViewportFrameStyle = useMemo(() => ({
    width: normalizedCanvasWidth,
    height: normalizedCanvasHeight,
  }), [normalizedCanvasHeight, normalizedCanvasWidth]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unsavedContent, setUnsavedContent] = useState<string | null>(null); // Несохраненные изменения
  const [isModified, setIsModified] = useState<boolean>(false); // Флаг изменений
  const [showSaveIndicator, setShowSaveIndicator] = useState<boolean>(false); // РРЅРґРёРєР°С‚РѕСЂ сохранения
  const monacoEditorRef = useRef<any>(null);
  const suppressCodeSelectionSyncRef = useRef<boolean>(false);
  const monacoSelectionDecorationsRef = useRef<string[]>([]);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Таймер для автосохранения
  const undoHistoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Таймер для debounce истории undo/redo
  const pendingHistoryOperationRef = useRef<HistoryOperation | null>(null); // Отложенная операция для истории
  const isUpdatingFromConstructorRef = useRef<boolean>(false); // Флаг для предотвращения рекурсии при обновлении из конструктора
  const isUpdatingFromFileRef = useRef<boolean>(false); // Флаг для предотвращения рекурсии при обновлении из файла

  // Хуки для React и React Native файлов (всегда вызываются)
  const [reactHTML, setReactHTML] = useState<string>('');
  const [isProcessingReact, setIsProcessingReact] = useState<boolean>(false);
  const [reactNativeHTML, setReactNativeHTML] = useState<string>('');
  const [isProcessingReactNative, setIsProcessingReactNative] = useState<boolean>(false);
  const [previewOpenError, setPreviewOpenError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState<number>(0); // увеличиваем, чтобы форсировать перерисовку WebView

  // Пути к зависимым файлам для отслеживания изменений
  const [dependencyPaths, setDependencyPaths] = useState<string[]>([]);

  // Хуки для HTML файлов (всегда вызываются)
  const [processedHTML, setProcessedHTML] = useState<string>('');
  const [htmlDependencyPaths, setHtmlDependencyPaths] = useState<string[]>([]);
  const [isProcessingHTML, setIsProcessingHTML] = useState<boolean>(false);

  const [splitLeftWidth, setSplitLeftWidth] = useState<number>(0.5); // 0.5 = 50% ширины
  const [splitSidebarWidth, setSplitSidebarWidth] = useState<number>(320);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [resizeTarget, setResizeTarget] = useState<'main' | 'sidebar' | null>(null);
  const splitContainerRef = useRef<HTMLElement | null>(null);
  const splitMainPanelsRef = useRef<HTMLElement | null>(null);
  const detectedComponentName = useMemo(() => {
    if (selectedComponentName) {
      return selectedComponentName;
    }

    if (!fileContent || (fileType !== 'react' && fileType !== 'react-native')) {
      return null;
    }

    try {
      const components = detectComponents(fileContent);
      return components[0]?.name || null;
    } catch {
      return null;
    }
  }, [fileContent, fileType, selectedComponentName]);

  useEffect(() => {
    setPreviewOpenError(null);
  }, [filePath]);

  // Состояние редактора блоков
  const [blockMap, setBlockMap] = useState<BlockMap>({});
  // blockMap для исходного файла (для записи патчей в исходный код, без зависимости от обработанного превью)
  const [blockMapForFile, setBlockMapForFile] = useState<BlockMap>({});
  const [selectedBlock, setSelectedBlock] = useState<{ id: string; meta?: any } | null>(null); // { id, meta? }
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [changesLog, setChangesLog] = useState<Array<{ ts: number; filePath: string; blockId: any; patch: any }>>([]); // [{ ts, filePath, blockId, patch }]
  const [editorHTML, setEditorHTML] = useState<string>('');
  const [stagedPatches, setStagedPatches] = useState<Record<string, StylePatch>>({}); // { [blockId]: patchObject }
  const [hasStagedChanges, setHasStagedChanges] = useState<boolean>(false);
  const [layersTree, setLayersTree] = useState<LayersTree | null>(null); // { nodes: {id:...}, rootIds: [] }
  const [layerNames, setLayerNames] = useState<LayerNames>({}); // { [mrpakId]: "Name" }
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [iframeCommand, setIframeCommand] = useState<any>(null); // { type, ...payload, ts }
  const [stagedOps, setStagedOps] = useState<StagedOp[]>([]); // [{type:'insert'|'delete', ...}]
  const [stagedComponentImports, setStagedComponentImports] = useState<StagedComponentImport[]>([]);
  const [styleSnapshots, setStyleSnapshots] = useState<Record<string, { inlineStyle: string; computedStyle?: any }>>({}); // { [mrpakId]: { inlineStyle: string, computedStyle?: object } }
  const [textSnapshots, setTextSnapshots] = useState<Record<string, string>>({}); // { [mrpakId]: text }
  const [externalStylesMap, setExternalStylesMap] = useState<Record<string, { path: string; type: string }>>({}); // { [varName]: { path: string, type: string } }
  const [livePosition, setLivePosition] = useState<LivePosition>({ left: null, top: null, width: null, height: null });
  const [externalDropTargetState, setExternalDropTargetState] = useState<{
    source: string;
    sourceId: string | null;
    targetId: string | null;
  } | null>(null);
  const [styleLibraryEntries, setStyleLibraryEntries] = useState<StyleLibraryEntry[]>([]);
  const writeFile = useCallback(async (targetPath: string, content: string, options: any = { backup: true }) => {
    const formatted = formatContentForWrite(targetPath, content);
    return writeFileRaw(targetPath, formatted, options);
  }, []);

  // Две копии AST для bidirectional editing
  // Менеджер для bidirectional editing через два AST
  const astManagerRef = useRef<AstBidirectionalManager | null>(null);

  // РСЃС‚РѕСЂРёСЏ для Undo/Redo
  const [undoStack, setUndoStack] = useState<HistoryOperation[]>([]); // Стек операций для отмены
  const [redoStack, setRedoStack] = useState<HistoryOperation[]>([]); // Стек операций для повтора

  // Рефы для актуальных значений staged состояний (чтобы избегать устаревших замыканий)
  const stagedPatchesRef = useRef<Record<string, StylePatch>>(stagedPatches);
  const stagedOpsRef = useRef<StagedOp[]>(stagedOps);
  const stagedComponentImportsRef = useRef<StagedComponentImport[]>(stagedComponentImports);
  const hasStagedChangesRef = useRef<boolean>(hasStagedChanges);
  const saveFileRef = useRef<((contentToSave?: string | null) => Promise<void>) | null>(null);

  // Защита от дублирования операций
  const lastInsertOperationRef = useRef<InsertHistoryOperation | null>(null);
  const lastDeleteOperationRef = useRef<DeleteOperationDedup | null>(null);
  const lastReparentOperationRef = useRef<any>(null);

  // Хелперы для синхронного обновления state + ref одновременно
  const updateStagedPatches = useCallback((updater: ((prev: Record<string, StylePatch>) => Record<string, StylePatch>) | Record<string, StylePatch>) => {
    setStagedPatches((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      stagedPatchesRef.current = next; // РЎРРќРҐР РћРќРќРћ обновляем ref
      return next;
    });
  }, []);

  const updateStagedOps = useCallback((updater: ((prev: StagedOp[]) => StagedOp[]) | StagedOp[]) => {
    setStagedOps((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      stagedOpsRef.current = next; // РЎРРќРҐР РћРќРќРћ обновляем ref
      return next;
    });
  }, []);

  const updateStagedComponentImports = useCallback(
    (
      updater:
        | ((prev: StagedComponentImport[]) => StagedComponentImport[])
        | StagedComponentImport[]
    ) => {
      setStagedComponentImports((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        stagedComponentImportsRef.current = next;
        return next;
      });
    },
    []
  );

  const updateHasStagedChanges = useCallback((value: boolean) => {
    setHasStagedChanges(value);
    hasStagedChangesRef.current = value; // РЎРРќРҐР РћРќРќРћ обновляем ref
  }, []);

  // Ref для stageReparentBlock (используется в handleEditorMessage до определения функции)
  const stageReparentBlockRef = useRef<((params: { sourceId: string; targetParentId: string; targetBeforeId?: string | null }) => void) | null>(null);
  // Ref для stageInsertBlock (используется в handleEditorMessage до определения функции)
  const stageInsertBlockRef = useRef<((params: { targetId: string; mode: 'child' | 'sibling'; snippet: string; skipIframeInsert?: boolean }) => any) | null>(null);

  // getFileType и getMonacoLanguage импортированы из shared/lib/file-type-detector.js

  // injectBlockEditorScript теперь импортируется из модуля

  // Команды для iframe - определяем рано, так как используется в undo/redo
  const sendIframeCommand = useCallback((cmd: any) => {
    setIframeCommand({ ...cmd, ts: Date.now() });
  }, []);
  const externalComponentDragActiveRef = useRef<boolean>(false);
  const externalFileDragActiveRef = useRef<boolean>(false);

  useEffect(() => {
    const canUseCanvasDrag = viewMode === 'split' && (fileType === 'react' || fileType === 'react-native');
    if (!canUseCanvasDrag) {
      if (externalComponentDragActiveRef.current) {
        sendIframeCommand({ type: MRPAK_CMD.END_DRAG });
        externalComponentDragActiveRef.current = false;
      }
      return;
    }

    if (!externalComponentDrag) {
      if (externalComponentDragActiveRef.current) {
        if (!externalFileDrag) {
          sendIframeCommand({ type: MRPAK_CMD.END_DRAG });
        }
        externalComponentDragActiveRef.current = false;
      }
      return;
    }

    const componentName = String(externalComponentDrag.componentName || '').trim();
    const sourceFilePath = String(externalComponentDrag.sourceFilePath || '').trim();
    if (!componentName || !sourceFilePath) {
      return;
    }

    const importPath = getRelativeImportPath(filePath, sourceFilePath);
    sendIframeCommand({
      type: MRPAK_CMD.START_DRAG,
      source: 'component',
      componentName,
      sourceFilePath,
      importKind: externalComponentDrag.importKind === 'named' ? 'named' : 'default',
      importPath,
      hasProps: Boolean(externalComponentDrag.hasProps),
      propsCount: Number(externalComponentDrag.propsCount || 0),
      supportsStyleOnlyArg: Boolean(externalComponentDrag.supportsStyleOnlyArg),
    });
    externalComponentDragActiveRef.current = true;
  }, [externalComponentDrag, externalFileDrag, filePath, fileType, sendIframeCommand, viewMode]);

  useEffect(() => {
    const canUseCanvasDrag = viewMode === 'split' && (fileType === 'react' || fileType === 'react-native');
    if (!canUseCanvasDrag) {
      if (externalFileDragActiveRef.current) {
        sendIframeCommand({ type: MRPAK_CMD.END_DRAG });
        externalFileDragActiveRef.current = false;
      }
      return;
    }

    if (!externalFileDrag) {
      if (externalFileDragActiveRef.current) {
        if (!externalComponentDrag) {
          sendIframeCommand({ type: MRPAK_CMD.END_DRAG });
        }
        externalFileDragActiveRef.current = false;
      }
      return;
    }

    const sourceFilePath = String(externalFileDrag.sourceFilePath || '').trim();
    if (!sourceFilePath) {
      return;
    }

    const importPath = getRelativeAssetImportPath(filePath, sourceFilePath);
    sendIframeCommand({
      type: MRPAK_CMD.START_DRAG,
      source: 'file',
      filePath: sourceFilePath,
      importPath,
      assetKind: externalFileDrag.kind || 'image',
    });
    externalFileDragActiveRef.current = true;
  }, [externalComponentDrag, externalFileDrag, filePath, fileType, sendIframeCommand, viewMode]);

  const derivePreviousStylePatch = useCallback((blockId: string, patch: StylePatch) => {
    const inlineStyle = String(styleSnapshots?.[blockId]?.inlineStyle || '');
    if (!inlineStyle || !patch || typeof patch !== 'object') return null;

    const parsed = parseStyleText(inlineStyle);
    const toKebab = (key: string) =>
      String(key || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
    const toCamel = (key: string) =>
      String(key || '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

    const previousValue: StylePatch = {};

    Object.keys(patch).forEach((key) => {
      const kebabKey = toKebab(key);
      const camelKey = toCamel(key);
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        previousValue[key] = parsed[key];
      } else if (Object.prototype.hasOwnProperty.call(parsed, kebabKey)) {
        previousValue[key] = parsed[kebabKey];
      } else if (Object.prototype.hasOwnProperty.call(parsed, camelKey)) {
        previousValue[key] = parsed[camelKey];
      }
    });

    return Object.keys(previousValue).length > 0 ? previousValue : null;
  }, [styleSnapshots]);

  // Функция для добавления операции в историю undo
  const addToHistory = useCallback((operation: HistoryOperation | SetTextHistoryOperation | ReparentHistoryOperation) => {
    setUndoStack((prev) => [...prev, operation]);
    setRedoStack([]); // Очищаем redo стек при новой операции
    console.log('рџ“ќ [History] Добавлена операция в историю:', operation.type);
  }, []);

  // Добавляет операцию в историю с debounce для промежуточных изменений
  const addToHistoryDebounced = useCallback((operation: HistoryOperation, isIntermediate: boolean = false) => {
    if (isIntermediate) {
      // Для промежуточных изменений сохраняем операцию, но не добавляем в историю сразу
      pendingHistoryOperationRef.current = operation;

      // Очищаем предыдущий таймер
      if (undoHistoryTimeoutRef.current) {
        clearTimeout(undoHistoryTimeoutRef.current);
      }

      // Устанавливаем новый таймер (300ms после последнего изменения)
      undoHistoryTimeoutRef.current = setTimeout(() => {
        if (pendingHistoryOperationRef.current) {
          addToHistory(pendingHistoryOperationRef.current);
          pendingHistoryOperationRef.current = null;
        }
      }, 300);
    } else {
      // Для финальных изменений добавляем сразу
      if (undoHistoryTimeoutRef.current) {
        clearTimeout(undoHistoryTimeoutRef.current);
        undoHistoryTimeoutRef.current = null;
      }
      if (pendingHistoryOperationRef.current) {
        // Заменяем отложенную операцию на финальную
        pendingHistoryOperationRef.current = null;
      }
      addToHistory(operation);
    }
  }, [addToHistory]);

  // Функция отмены (Undo)
  const undo = useCallback(() => {
    if (undoStack.length === 0) {
      console.log('вЏ®пёЏ [Undo] Стек пуст, нечего отменять');
      return;
    }

    const operation = undoStack[undoStack.length - 1];
    console.log('вЏ®пёЏ [Undo] Отменяю операцию:', operation.type, operation);

    // Сохраняем операцию в redo стек
    setRedoStack((prev) => [...prev, operation]);
    setUndoStack((prev) => prev.slice(0, -1));

    // Применяем обратную операцию
    switch (operation.type) {
      case 'patch': {
        console.log('вЏ®пёЏ [Undo] Отменяю patch:', {
          blockId: operation.blockId,
          previousValue: operation.previousValue,
          currentPatch: operation.patch
        });

        // Отменяем патч - возвращаем предыдущее значение
        updateStagedPatches((prev) => {
          const next = { ...prev };
          if (operation.previousValue) {
            next[operation.blockId] = operation.previousValue;
          } else {
            delete next[operation.blockId];
          }
          console.log('вЏ®пёЏ [Undo] Обновлены stagedPatches:', next);
          return next;
        });

        // Формируем патч для отмены в iframe
        let patchToApply;
        if (operation.previousValue) {
          // Если было предыдущее значение - применяем его
          patchToApply = operation.previousValue;
        } else {
          // Если это была первая операция - удаляем все ключи из текущего патча
          patchToApply = {};
          for (const key in operation.patch) {
            (patchToApply as any)[key] = null; // null означает удалить стиль
          }
        }

        console.log('вЏ®пёЏ [Undo] Отправляю команду SET_STYLE в iframe:', patchToApply);
        sendIframeCommand({
          type: MRPAK_CMD.SET_STYLE,
          id: operation.blockId,
          patch: patchToApply,
          fileType
        });
        break;
      }
      case 'insert': {
        console.log('вЏ®пёЏ [Undo] Отменяю вставку блока:', operation.blockId);
        // Отменяем вставку - удаляем блок
        updateStagedOps((prev) => {
          const filtered = prev.filter(op => op.blockId !== operation.blockId);
          console.log('вЏ®пёЏ [Undo] Обновлены stagedOps:', filtered);
          return filtered;
        });
        console.log('вЏ®пёЏ [Undo] Отправляю команду DELETE в iframe');
        sendIframeCommand({ type: MRPAK_CMD.DELETE, id: operation.blockId });
        break;
      }
      case 'delete': {
        console.log('вЏ®пёЏ [Undo] Отменяю удаление, восстанавливаю блок:', operation.blockId);
        // Отменяем удаление - восстанавливаем блок
        updateStagedOps((prev: StagedOp[]) => {
          const restored: StagedOp[] = [
            ...prev,
            {
              type: 'insert',
              targetId: operation.parentId,
              mode: 'child',
              snippet: operation.snippet,
              blockId: operation.blockId,
              fileType,
              filePath,
            },
          ];
          console.log('вЏ®пёЏ [Undo] Обновлены stagedOps:', restored);
          return restored;
        });
        console.log('вЏ®пёЏ [Undo] Отправляю команду INSERT в iframe');
        sendIframeCommand({
          type: MRPAK_CMD.INSERT,
          targetId: operation.parentId,
          mode: 'child',
          html: operation.snippet,
        });
        break;
      }
      case 'setText': {
        console.log('вЏ®пёЏ [Undo] Отменяю изменение текста:', {
          blockId: operation.blockId,
          previousText: operation.previousText
        });
        // Отменяем изменение текста
        updateStagedOps((prev) => {
          const filtered = prev.filter(
            op => !(op.type === 'setText' && op.blockId === operation.blockId)
          );
          console.log('вЏ®пёЏ [Undo] Обновлены stagedOps:', filtered);
          return filtered;
        });
        console.log('вЏ®пёЏ [Undo] Отправляю команду SET_TEXT в iframe');
        sendIframeCommand({
          type: MRPAK_CMD.SET_TEXT,
          id: operation.blockId,
          text: operation.previousText || '',
        });
        break;
      }
      case 'reparent': {
        console.log('вЏ®пёЏ [Undo] Отменяю перемещение элемента:', {
          blockId: operation.blockId,
          oldParentId: operation.oldParentId,
          newParentId: operation.newParentId
        });
        // Отменяем перемещение элемента
        updateStagedOps((prev) => {
          const filtered = prev.filter(
            op => !(op.type === 'reparent' && op.blockId === operation.blockId)
          );
          console.log('вЏ®пёЏ [Undo] Обновлены stagedOps:', filtered);
          return filtered;
        });
        console.log('вЏ®пёЏ [Undo] Отправляю команду REPARENT в iframe для отмены');
        sendIframeCommand({
          type: MRPAK_CMD.REPARENT,
          sourceId: operation.blockId,
          targetParentId: operation.oldParentId,
        });
        break;
      }
      default:
        console.warn('вЏ®пёЏ [Undo] Неизвестный тип операции:', (operation as any).type);
    }

    // Проверяем, остались ли изменения после отмены
    // РСЃРїРѕР»СЊР·СѓРµРј setTimeout чтобы получить обновленные значения после setState
    setTimeout(() => {
      const hasChanges = undoStack.length > 0 ||
                         Object.keys(stagedPatchesRef.current || {}).length > 0 ||
                         (stagedOpsRef.current || []).length > 0;
      console.log('вЏ®пёЏ [Undo] Проверка наличия изменений:', {
        undoStackLength: undoStack.length - 1, // -1 потому что мы уже удалили операцию
        stagedPatchesCount: Object.keys(stagedPatchesRef.current || {}).length,
        stagedOpsCount: (stagedOpsRef.current || []).length,
        hasChanges
      });
      updateHasStagedChanges(hasChanges);
    }, 0);
  }, [undoStack, fileType, filePath, sendIframeCommand, updateStagedPatches, updateStagedOps, updateHasStagedChanges]);

  // Функция повтора (Redo)
  const redo = useCallback(() => {
    if (redoStack.length === 0) {
      console.log('вЏ­пёЏ [Redo] Стек пуст, нечего повторять');
      return;
    }

    const operation: HistoryOperation = redoStack[redoStack.length - 1];
    console.log('вЏ­пёЏ [Redo] Повторяю операцию:', operation.type, operation);

    // Возвращаем операцию в undo стек
    setUndoStack((prev) => [...prev, operation]);
    setRedoStack((prev) => prev.slice(0, -1));

    // Применяем операцию снова
    switch (operation.type) {
      case 'patch': {
        console.log('вЏ­пёЏ [Redo] Применяю patch:', {
          blockId: operation.blockId,
          patch: operation.patch
        });
        updateStagedPatches((prev) => {
          const next = {
            ...prev,
            [operation.blockId]: { ...(prev[operation.blockId] || {}), ...operation.patch },
          };
          console.log('вЏ­пёЏ [Redo] Обновлены stagedPatches:', next);
          return next;
        });
        console.log('вЏ­пёЏ [Redo] Отправляю команду SET_STYLE в iframe');
        sendIframeCommand({
          type: MRPAK_CMD.SET_STYLE,
          id: operation.blockId,
          patch: operation.patch,
          fileType
        });
        break;
      }
      case 'insert': {
        console.log('вЏ­пёЏ [Redo] Повторяю вставку блока:', operation.blockId);
        updateStagedOps((prev: StagedOp[]) => {
          const updated: StagedOp[] = [
            ...prev,
            {
              type: 'insert',
              targetId: operation.targetId,
              mode: operation.mode,
              snippet: operation.snippet,
              blockId: operation.blockId,
              fileType,
              filePath,
            },
          ];
          console.log('вЏ­пёЏ [Redo] Обновлены stagedOps:', updated);
          return updated;
        });
        console.log('вЏ­пёЏ [Redo] Отправляю команду INSERT в iframe');
        sendIframeCommand({
          type: MRPAK_CMD.INSERT,
          targetId: operation.targetId,
          mode: operation.mode,
          html: operation.snippet,
        });
        break;
      }
      case 'delete': {
        console.log('вЏ­пёЏ [Redo] Повторяю удаление блока:', operation.blockId);
        updateStagedOps((prev: StagedOp[]) => {
          const updated: StagedOp[] = [
            ...prev,
            {
              type: 'delete',
              blockId: operation.blockId,
              fileType,
              filePath,
            },
          ];
          console.log('вЏ­пёЏ [Redo] Обновлены stagedOps:', updated);
          return updated;
        });
        console.log('вЏ­пёЏ [Redo] Отправляю команду DELETE в iframe');
        sendIframeCommand({ type: MRPAK_CMD.DELETE, id: operation.blockId });
        break;
      }
      case 'setText': {
        console.log('вЏ­пёЏ [Redo] Повторяю изменение текста:', {
          blockId: operation.blockId,
          text: operation.text
        });
        updateStagedOps((prev: StagedOp[]) => {
          const updated: StagedOp[] = [
            ...prev,
            {
              type: 'setText',
              blockId: operation.blockId,
              text: operation.text,
              fileType,
              filePath,
            },
          ];
          console.log('вЏ­пёЏ [Redo] Обновлены stagedOps:', updated);
          return updated;
        });
        console.log('вЏ­пёЏ [Redo] Отправляю команду SET_TEXT в iframe');
        sendIframeCommand({
          type: MRPAK_CMD.SET_TEXT,
          id: operation.blockId,
          text: operation.text,
        });
        break;
      }
      case 'reparent': {
        console.log('вЏ­пёЏ [Redo] Повторяю перемещение элемента:', {
          blockId: operation.blockId,
          oldParentId: operation.oldParentId,
          newParentId: operation.newParentId
        });
        updateStagedOps((prev: StagedOp[]) => {
          const updated: StagedOp[] = [
            ...prev,
            {
              type: 'reparent',
              blockId: operation.blockId,
              oldParentId: operation.oldParentId,
              newParentId: operation.newParentId,
              sourceId: operation.blockId,
              targetParentId: operation.newParentId,
              targetBeforeId: operation.targetBeforeId || null,
              fileType: operation.fileType,
              filePath: operation.filePath,
            },
          ];
          console.log('вЏ­пёЏ [Redo] Обновлены stagedOps:', updated);
          return updated;
        });
        console.log('вЏ­пёЏ [Redo] Отправляю команду REPARENT в iframe');
        if (!operation.targetBeforeId) {
          sendIframeCommand({
            type: MRPAK_CMD.REPARENT,
            sourceId: operation.blockId,
            targetParentId: operation.newParentId,
          });
        }
        break;
      }
      default:
        console.warn('вЏ­пёЏ [Redo] Неизвестный тип операции:', (operation as any).type);
    }

    console.log('вЏ­пёЏ [Redo] Обновляю hasStagedChanges = true');
    updateHasStagedChanges(true);
  }, [redoStack, fileType, filePath, sendIframeCommand, updateStagedPatches, updateStagedOps, updateHasStagedChanges]);

  // Вспомогательная функция для обновления Monaco Editor с сохранением скролла
  const updateMonacoEditorWithScroll = useCallback((newContent: any) => {
    if (!monacoEditorRef?.current) return;

    try {
      isUpdatingFromFileRef.current = true;
      const editor = monacoEditorRef.current;
      // Сохраняем полное состояние редактора (курсор, скролл, выделение)
      const viewState = editor.saveViewState();
      // Также сохраняем скролл напрямую для более надежного восстановления
      const scrollTop = editor.getScrollTop();
      const scrollLeft = editor.getScrollLeft();
      const position = editor.getPosition();

      // Обновляем содержимое
      editor.setValue(newContent);

      // Восстанавливаем состояние без анимации
      if (viewState) {
        // РСЃРїРѕР»СЊР·СѓРµРј requestAnimationFrame для восстановления после обновления DOM
        requestAnimationFrame(() => {
          try {
            // Восстанавливаем полное состояние (курсор, выделение)
            editor.restoreViewState(viewState);

            // Восстанавливаем скролл напрямую без анимации
            if (scrollTop !== null && scrollTop !== undefined) {
              editor.setScrollTop(scrollTop);
            }
            if (scrollLeft !== null && scrollLeft !== undefined) {
              editor.setScrollLeft(scrollLeft);
            }

            // Восстанавливаем позицию курсора, если она была
            if (position) {
              editor.setPosition(position);
            }
          } catch (e) {
            console.warn('[updateMonacoEditorWithScroll] Ошибка восстановления viewState:', e);
          }
        });
      }
    } catch (e) {
      console.warn('[updateMonacoEditorWithScroll] Ошибка обновления Monaco Editor:', e);
      // Fallback: просто обновляем значение
      if (monacoEditorRef?.current) {
        monacoEditorRef.current.setValue(newContent);
      }
    }
    setTimeout(() => {
      isUpdatingFromFileRef.current = false;
    }, 0);
  }, []);

  const clearMonacoBlockSelection = useCallback(() => {
    const editor = monacoEditorRef?.current;
    if (!editor) return;

    try {
      if (typeof editor.deltaDecorations === 'function') {
        monacoSelectionDecorationsRef.current = editor.deltaDecorations(
          monacoSelectionDecorationsRef.current,
          []
        );
      }
    } catch (e) {
      console.warn('[clearMonacoBlockSelection] Ошибка очистки decorations:', e);
    }
  }, []);

  const revealSelectedBlockInCode = useCallback((blockId: string | null | undefined) => {
    clearMonacoBlockSelection();
    if (!blockId || !monacoEditorRef?.current) return;

    try {
      const editor = monacoEditorRef.current;
      const model = typeof editor.getModel === 'function' ? editor.getModel() : null;
      if (!model || typeof model.getPositionAt !== 'function') return;

      const entry = (blockMapForFile && blockMapForFile[blockId]) || (blockMap && blockMap[blockId]);
      if (!entry || typeof entry.start !== 'number') return;

      const offset = Math.max(0, Math.min(entry.start, model.getValueLength()));
      const position = model.getPositionAt(offset);
      if (!position) return;

      suppressCodeSelectionSyncRef.current = true;
      if (typeof editor.deltaDecorations === 'function') {
        monacoSelectionDecorationsRef.current = editor.deltaDecorations(
          monacoSelectionDecorationsRef.current,
          [
            {
              range: {
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: model.getLineMaxColumn(position.lineNumber),
              },
              options: {
                isWholeLine: true,
                className: 'monaco-block-selection',
                linesDecorationsClassName: 'monaco-block-selection-glyph',
              },
            },
          ]
        );
      }
      editor.setPosition(position);
      if (typeof editor.revealPositionInCenter === 'function') {
        editor.revealPositionInCenter(position);
      } else if (typeof editor.revealLineInCenter === 'function') {
        editor.revealLineInCenter(position.lineNumber);
      }

      if (typeof editor.setSelection === 'function') {
        editor.setSelection({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: model.getLineMaxColumn(position.lineNumber),
        });
      }

      try {
        editor.focus();
      } catch (e) {}
      requestAnimationFrame(() => {
        suppressCodeSelectionSyncRef.current = false;
      });
    } catch (e) {
      console.warn('[revealSelectedBlockInCode] Ошибка навигации к блоку в Monaco:', e);
      suppressCodeSelectionSyncRef.current = false;
    }
  }, [blockMapForFile, blockMap, clearMonacoBlockSelection]);

  const handleMonacoCtrlClick = useCallback((event: any) => {
    if (suppressCodeSelectionSyncRef.current) return;

    try {
      const editor = monacoEditorRef?.current;
      const model = editor && typeof editor.getModel === 'function' ? editor.getModel() : null;
      const position = event?.position;
      if (!model || !position) return;

      const offset = model.getOffsetAt(position);
      const entries = Object.entries(blockMapForFile || {});
      if (entries.length === 0) return;

      let bestMatch: { id: string; entry: any } | null = null;
      for (const [id, entry] of entries) {
        if (!entry || typeof entry.start !== 'number' || typeof entry.end !== 'number') continue;
        if (offset >= entry.start && offset <= entry.end) {
          if (!bestMatch || (entry.start >= bestMatch.entry.start && entry.end <= bestMatch.entry.end)) {
            bestMatch = { id, entry };
          }
        }
      }

      if (!bestMatch) return;
      if (selectedBlock?.id === bestMatch.id) return;

      setSelectedBlock((prev) => {
        if (prev?.id === bestMatch!.id) return prev;
        return { id: bestMatch!.id, meta: prev?.meta };
      });
      sendIframeCommand({ type: MRPAK_CMD.SELECT, id: bestMatch.id });
    } catch (e) {
      console.warn('[handleMonacoCtrlClick] Ошибка синхронизации Ctrl+Click с блоком:', e);
    }
  }, [blockMapForFile, selectedBlock?.id, sendIframeCommand]);

  useEffect(() => {
    if (!selectedBlock?.id) {
      clearMonacoBlockSelection();
      return;
    }

    const rafId = requestAnimationFrame(() => {
      revealSelectedBlockInCode(selectedBlock.id);
    });

    return () => cancelAnimationFrame(rafId);
  }, [selectedBlock?.id, revealSelectedBlockInCode, clearMonacoBlockSelection]);

  const resolveToMappedBlockId = useCallback((rawId: any): string | null => {
    const hasMapEntry = (id: string) => !!blockMapForFile?.[id];
    let current = String(rawId || '').trim();
    if (!current) return null;
    if (hasMapEntry(current)) return current;

    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const parentId = layersTree?.nodes?.[current]?.parentId || null;
      if (!parentId) break;
      current = String(parentId);
      if (hasMapEntry(current)) return current;
    }
    return null;
  }, [blockMapForFile, layersTree?.nodes]);

  const applyBlockPatch = useCallback(
    async (blockId: any, patch: any, isIntermediate = false) => {
      console.log('[applyBlockPatch] ENTRY:', { blockId, patch, isIntermediate, patchKeys: Object.keys(patch), patchValues: Object.values(patch) });
      try {
        // Bidirectional editing через AST: применяем изменения к constructorAST
        if (!blockId) return;
        const mappedBlockId = resolveToMappedBlockId(blockId) || String(blockId);

        // Работаем только с JS/TS файлами через AST
        if (fileType !== 'react' && fileType !== 'react-native') {
          // Для HTML используем старую логику
          const currentBlockMapForFile = blockMapForFile || {};
          if (!isFrameworkSupported(fileType as string)) {
            console.warn('applyBlockPatch: Unsupported file type:', fileType);
            return;
          }
          const framework = createFramework(fileType as string, filePath);
          const result = await framework.commitPatches({
            originalCode: String(fileContent ?? ''),
            stagedPatches: { [mappedBlockId]: patch },
            stagedOps: [],
            blockMapForFile: currentBlockMapForFile,
            externalStylesMap,
            filePath,
            resolvePath: resolvePathForFramework,
            readFile: readFile as any,
            writeFile: writeFile as any
          });
          if (!result.ok) throw new Error((result as any).error || 'Failed to apply changes');
          const newContent = result.code || String(fileContent ?? '');
          if (!newContent || typeof newContent !== 'string' || newContent.length === 0) {
            throw new Error('Apply result is empty or invalid');
          }
          updateStagedPatches((prev) => ({
            ...prev,
            [mappedBlockId]: { ...(prev?.[mappedBlockId] || {}), ...patch },
          }));
          updateHasStagedChanges(true);
          updateMonacoEditorWithScroll(newContent);
          return;
        }

        // Для React/React Native: работаем через AstBidirectionalManager
        const manager = astManagerRef.current;

        if (!manager) {
          // Если менеджер не инициализирован, создаем его
          if (projectRoot) {
            const newManager = new AstBidirectionalManager(filePath, projectRoot);
            const initResult = await newManager.initializeFromCode(String(fileContent ?? ''));
            if (!initResult.ok) {
              throw new Error('Failed to initialize AstBidirectionalManager');
            }
            astManagerRef.current = newManager;
            // Продолжаем с новым менеджером
            return await applyBlockPatch(mappedBlockId, patch);
          } else {
            // Fallback: используем старый метод через framework, если projectRoot еще не загружен
            console.warn('[applyBlockPatch] projectRoot not available yet, using framework fallback');

            // Для промежуточных изменений (перетаскивание) применяем легкий fallback только для стилей позиции
            if (isIntermediate) {
              const framework = createFramework(fileType as string, filePath);
              if (!framework) {
                console.warn('[applyBlockPatch] Unsupported file type for fallback:', fileType);
                return;
              }
              
              // Применяем только позиционные стили для немедленной обратной связи
              const positionPatch: Record<string, any> = {};
              if (patch.position !== undefined) positionPatch.position = patch.position;
              if (patch.left !== undefined) positionPatch.left = patch.left;
              if (patch.top !== undefined) positionPatch.top = patch.top;
              if (patch.marginLeft !== undefined) positionPatch.marginLeft = patch.marginLeft;
              if (patch.marginTop !== undefined) positionPatch.marginTop = patch.marginTop;
              if (patch.right !== undefined) positionPatch.right = patch.right;
              if (patch.bottom !== undefined) positionPatch.bottom = patch.bottom;
              
              if (Object.keys(positionPatch).length > 0) {
                await framework.commitPatches({
                  originalCode: fileContent || '',
                  stagedPatches: { [mappedBlockId]: positionPatch },
                  stagedOps: [],
                  blockMapForFile: blockMapForFile || {},
                  externalStylesMap: {},
                  filePath,
                  resolvePath: resolvePathForFramework,
                  readFile: (path: string) => ({ success: true, content: '' }),
                  writeFile: (path: string, content: string) => ({ success: true }),
                });
              }
              return;
            }
            const framework = createFramework(fileType as string, filePath);
            if (!framework) {
              console.warn('[applyBlockPatch] Unsupported file type for fallback:', fileType);
              return;
            }
            
            const commitResult = await framework.commitPatches({
              originalCode: fileContent || '',
              stagedPatches: { [mappedBlockId]: patch },
              stagedOps: [],
              blockMapForFile: blockMapForFile || {},
              externalStylesMap: {},
              filePath,
              resolvePath: resolvePathForFramework,
              readFile: readFile as any,
              writeFile: writeFile as any
            });
            
            if (commitResult.ok && commitResult.code) {
              updateStagedPatches((prev) => ({
                ...prev,
                [mappedBlockId]: { ...(prev?.[mappedBlockId] || {}), ...patch },
              }));
              updateHasStagedChanges(true);
              updateMonacoEditorWithScroll(commitResult.code);
              return;
            } else {
              throw new Error(`Framework fallback failed: ${commitResult.error || 'Unknown error'}`);
            }
          }
        }

        // Обновляем codeAST при изменении в конструкторе (не трогаем constructorAST)
        console.log('[applyBlockPatch] Updating codeAST:', { blockId: mappedBlockId, patch, hasCodeAST: !!manager.getCodeAST(), isIntermediate });
        let updateResult = manager.updateCodeAST(mappedBlockId, {
          type: 'style',
          patch,
        });

        if (!updateResult.ok) {
          // Try to refresh AST from current code and retry once.
          const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
          const refreshResult = await manager.updateCodeASTFromCode(String(currentCode ?? ''), true);
          if (refreshResult?.ok) {
            updateResult = manager.updateCodeAST(mappedBlockId, { type: 'style', patch });
          }
        }

        if (!updateResult.ok) {
          console.warn('[applyBlockPatch] Failed to update codeAST:', updateResult.error);
          // Fallback: используем старый метод через framework
          console.log('[applyBlockPatch] Falling back to framework.commitPatches');

          // Для промежуточных изменений НЕ используем fallback - просто возвращаемся
          if (isIntermediate) {
            return;
          }
          const currentBlockMapForFile = blockMapForFile || {};
          const framework = createFramework(fileType, filePath);
          const result = await framework.commitPatches({
            originalCode: String(fileContent ?? ''),
            stagedPatches: { [mappedBlockId]: patch },
            stagedOps: [],
            blockMapForFile: currentBlockMapForFile,
            externalStylesMap,
            filePath,
            resolvePath: resolvePathForFramework,
            readFile: readFile as any,
            writeFile: writeFile as any
          });
          if (!result.ok) throw new Error((result as any).error || 'Failed to apply changes');
          const newContent = result.code || String(fileContent ?? '');
          if (!newContent || typeof newContent !== 'string' || newContent.length === 0) {
            throw new Error('Apply result is empty or invalid');
          }
          // Устанавливаем флаг, чтобы предотвратить рекурсию при обновлении из конструктора
          isUpdatingFromConstructorRef.current = true;

          try {
            // Автосохранение
            
            // Обновляем codeAST из нового кода без синхронизации constructorAST (чтобы избежать рекурсии)
            await manager.updateCodeASTFromCode(newContent, true);
            // Обновляем Monaco Editor без перезагрузки с сохранением скролла
            updateMonacoEditorWithScroll(newContent);
            updateStagedPatches((prev) => ({
              ...prev,
              [mappedBlockId]: { ...(prev?.[mappedBlockId] || {}), ...patch },
            }));
            updateHasStagedChanges(true);
          } finally {
            // Сбрасываем флаг после небольшой задержки
            setTimeout(() => {
              isUpdatingFromConstructorRef.current = false;
            }, 100);
          }
          return;
        }

        // Генерируем код из codeAST
        const generateResult = manager.generateCodeFromCodeAST();

        if (!generateResult.ok) {
          throw new Error(generateResult.error || 'Failed to generate code from codeAST');
        }

        const newContent = generateResult.code;

        // Для промежуточных изменений НЕ сохраняем файл и НЕ обновляем fileContent
        // Обновление fileContent триггерит useEffect, который перегенерирует HTML и обновляет конструктор
        // Файл будет сохранен только при финальном изменении (isIntermediate: false)
        if (isIntermediate) {
          // Обновляем только Monaco Editor напрямую, БЕЗ обновления fileContent
          // Это предотвращает перегенерацию HTML и обновление конструктора
          // РСЃРїРѕР»СЊР·СѓРµРј функцию с сохранением скролла
          updateMonacoEditorWithScroll(newContent);

          // ВАЖНО: Обновляем codeAST из сгенерированного кода, чтобы он был синхронизирован
          // для следующих промежуточных изменений. Но НЕ обновляем fileContent, чтобы не триггерить useEffect
          await manager.updateCodeASTFromCode(newContent || '', true);

          // НЕ вызываем setFileContent и setRenderVersion для промежуточных изменений

          // Добавляем в историю для undo (с debounce для промежуточных изменений)
        const previousValue = derivePreviousStylePatch(mappedBlockId, patch);
          addToHistoryDebounced({
            type: 'patch',
            blockId: mappedBlockId,
            patch,
            previousValue,
          }, isIntermediate);
          return;
        }

        // Устанавливаем флаг ДО writeFile, чтобы предотвратить рекурсию
        isUpdatingFromConstructorRef.current = true;

        // Автосохранение в файл (только для финальных изменений)

        // Обновляем fileContent и Monaco Editor без перезагрузки с сохранением скролла
        updateMonacoEditorWithScroll(newContent);
        updateStagedPatches((prev) => ({
          ...prev,
          [mappedBlockId]: { ...(prev?.[mappedBlockId] || {}), ...patch },
        }));
        updateHasStagedChanges(true);
        setChangesLog((prev) => [
          { ts: Date.now() + Math.random(), filePath, blockId: mappedBlockId, patch },
          ...prev,
        ]);

        // Добавляем в историю для undo (с debounce для промежуточных изменений)
        const previousValue = derivePreviousStylePatch(mappedBlockId, patch);
        addToHistoryDebounced({
          type: 'patch',
          blockId: mappedBlockId,
          patch,
          previousValue,
        }, isIntermediate);

        // Сбрасываем флаг после небольшой задержки, чтобы файловый watcher успел обработать изменение
        setTimeout(() => {
          isUpdatingFromConstructorRef.current = false;
        }, 100);
      } catch (e) {
        console.error('BlockEditor apply error:', e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(`Failed to apply changes: ${errorMessage}`);
      }
    },
    [fileContent, fileType, filePath, blockMapForFile, externalStylesMap, resolvePath, readFile, writeFile, addToHistory, projectRoot, derivePreviousStylePatch, updateStagedPatches, updateHasStagedChanges, resolveToMappedBlockId]
  );

  const commitStagedPatches = useCallback(async () => {
    // Берём актуальные значения из рефов, чтобы не зависеть от замыканий
    const currentStagedPatches = stagedPatchesRef.current || {};
    const currentStagedOps = stagedOpsRef.current || [];
    const currentStagedComponentImports = stagedComponentImportsRef.current || [];
    const currentHasStagedChanges = hasStagedChangesRef.current;

    const entries = Object.entries(currentStagedPatches).filter(
      ([id, p]) => id && p && Object.keys(p).length > 0
    );
    const ops = Array.isArray(currentStagedOps) ? currentStagedOps : [];
    const imports = Array.isArray(currentStagedComponentImports) ? currentStagedComponentImports : [];

    console.log('commitStagedPatches called:', {
      hasStagedChanges: currentHasStagedChanges,
      entriesCount: entries.length,
      opsCount: ops.length,
      importsCount: imports.length,
      fileType,
      filePath
    });

    try {
      if (!currentHasStagedChanges && entries.length === 0 && ops.length === 0 && imports.length === 0) {
        updateHasStagedChanges(false);
        return;
      }

      if (entries.length === 0 && ops.length === 0 && imports.length === 0) {
        console.log('commitStagedPatches: no changes to commit');
        updateHasStagedChanges(false);
        return;
      }

      // Получаем актуальный blockMap для поиска элементов
      const currentBlockMap = blockMap || {};
      const currentBlockMapForFile = blockMapForFile || {};

      console.log('commitStagedPatches: committing changes', {
        entries: entries.map(([id]) => id),
        ops: ops.map((o) => ({
          type: o.type,
          blockId: o.type === 'insert' ? o.targetId : o.blockId,
        })),
        importsCount: imports.length,
        blockMapKeys: Object.keys(currentBlockMap).length,
        blockMapForFileKeys: Object.keys(currentBlockMapForFile).length
      });

      // API проверяется в функции writeFile

      // РСЃРїРѕР»СЊР·СѓРµРј Framework для коммита патчей
      if (!isFrameworkSupported(fileType as string)) {
        console.warn('commitStagedPatches: Unsupported file type:', fileType);
        return;
      }

      const framework = createFramework(fileType as string, filePath);
      const result = await framework.commitPatches({
        originalCode: String(fileContent ?? ''),
        stagedPatches: currentStagedPatches,
        stagedOps: ops,
        blockMapForFile: currentBlockMapForFile,
            externalStylesMap,
        filePath,
        resolvePath: resolvePathForFramework,
        readFile: readFile as any,
        writeFile: writeFile as any
      });

      if (!result.ok) {
        throw new Error((result as any).error || 'Failed to apply changes');
      }

      const newContent = result.code || String(fileContent ?? '');

      // Обрабатываем внешние патчи, если они есть (доступ через any, т.к. в типах они необязательны)
      const anyResult: any = result;
      if (anyResult.externalPatches && anyResult.externalPatches.length > 0) {
        for (const extPatch of anyResult.externalPatches) {
          console.log('commitStagedPatches: External patch applied:', extPatch);
        }
      }

      // Проверяем, что newContent не пустой и не undefined
      if (!newContent || typeof newContent !== 'string') {
        console.error('commitStagedPatches: newContent is invalid', {
          type: typeof newContent,
          isNull: newContent === null,
          isUndefined: newContent === undefined,
          length: newContent?.length
        });
        throw new Error('Apply result is empty or invalid');
      }

      if (newContent.length === 0) {
        console.error('commitStagedPatches: newContent is empty string');
        throw new Error('Apply result is empty');
      }

      // Проверяем, что новый контент не короче оригинального более чем на 90%
      // (это может указывать на ошибку в логике)
      const originalLength = String(fileContent ?? '').length;
      if (originalLength > 100 && newContent.length < originalLength * 0.1) {
        console.error('commitStagedPatches: newContent is suspiciously short', {
          originalLength,
          newLength: newContent.length,
          ratio: newContent.length / originalLength
        });
        throw new Error('Apply result is suspiciously short; possible logic error');
      }

      let finalContent = newContent;
      for (const importMeta of imports) {
        finalContent = ensureComponentImportInCode(finalContent, importMeta);
      }

      const writeRes = await writeFile(filePath, finalContent, { backup: true });
      if (!writeRes?.success) {
        throw new Error(writeRes?.error || 'File write error');
      }

      console.log('commitStagedPatches: file written successfully', {
        filePath,
        newContentLength: finalContent.length,
        originalLength: String(fileContent ?? '').length
      });

      setFileContent(finalContent);
      setRenderVersion((v) => v + 1);
      setChangesLog((prev) => [
        ...entries.map(([blockId, patch]) => ({ ts: Date.now() + Math.random(), filePath, blockId, patch })),
        ...ops.map((o) => ({
          ts: Date.now() + Math.random(),
          filePath,
          blockId: o.type === 'insert' ? o.targetId : o.blockId,
          patch: { op: o.type },
        })),
        ...prev,
      ]);
      updateStagedPatches({});
      updateStagedOps([]);
      updateStagedComponentImports([]);
      updateHasStagedChanges(false);

      // Очищаем историю undo/redo после успешного коммита
      setUndoStack([]);
      setRedoStack([]);

      // Показываем индикатор успешного сохранения
      setShowSaveIndicator(true);
      setTimeout(() => setShowSaveIndicator(false), 2000);

      console.log('рџ’ѕ commitStagedPatches: РР·РјРµРЅРµРЅРёСЏ успешно сохранены в файл', {
        filePath,
        patchesCount: entries.length,
        opsCount: ops.length,
        importsCount: imports.length,
      });

      // После сохранения нужно обновить blockMap и editorHTML, так как файл изменился
      // Это произойдет автоматически через useEffect, который зависит от fileContent
    } catch (e) {
      console.error('commitStagedPatches error:', e);
      console.error('commitStagedPatches error stack:', e instanceof Error ? e.stack : String(e));
      // Определяем entries и ops для логирования, если они еще не определены
      const entriesForLog = Object.entries(currentStagedPatches || {}).filter(
        ([id, p]) => id && p && Object.keys(p).length > 0
      );
      const opsForLog = Array.isArray(currentStagedOps) ? currentStagedOps : [];
      console.error('commitStagedPatches error details:', {
        filePath,
        fileType,
        entriesCount: entriesForLog.length,
        opsCount: opsForLog.length,
        originalContentLength: String(fileContent ?? '').length,
      });
      setError(`Failed to apply changes: ${e.message}`);
      // НЕ сохраняем файл при ошибке - это предотвратит обнуление кода
      return;
    }
  }, [fileContent, fileType, filePath, blockMap, externalStylesMap, updateStagedPatches, updateStagedOps, updateStagedComponentImports, updateHasStagedChanges]);

  const applyAndCommitPatch = useCallback(
    async (blockId: string, patch: any) => {
      // Bidirectional editing: применяем сразу через applyBlockPatch
      await applyBlockPatch(blockId, patch);
    },
    [applyBlockPatch]
  );

  const handleEditorMessage = useCallback(
    async (event: any) => {
      const data = event?.nativeEvent?.data;
      if (!isMrpakMessage(data)) return;
      //console.log("HERREEEE: ", data.type)

      if (data.type === MRPAK_MSG.SAVE) {
        if (hasStagedChangesRef.current) {
          void commitStagedPatches();
          return;
        }
        if (viewMode === 'split' && isModified) {
          let contentToSave: string | null = null;
          if (monacoEditorRef?.current) {
            try {
              contentToSave = monacoEditorRef.current.getValue();
            } catch {}
          }
          if (!contentToSave) {
            contentToSave = unsavedContent !== null ? unsavedContent : fileContent;
          }
          if (contentToSave) {
            void saveFileRef.current?.(contentToSave);
          }
          return;
        }
        if (viewMode === 'preview' && isModified) {
          void saveFileRef.current?.();
        }
        return;
      }

      if (data.type === MRPAK_MSG.SELECT) {
        const ids = Array.isArray(data.ids)
          ? Array.from(new Set(data.ids.map((id: any) => String(id || '').trim()).filter(Boolean)))
          : (data.id ? [String(data.id)] : []);
        setSelectedBlockIds((prev) => {
          if (prev.length === ids.length && prev.every((id, idx) => id === ids[idx])) {
            return prev;
          }
          return ids;
        });
        setSelectedBlock((prev) => {
          if (prev?.id === data.id) return prev;
          return { id: data.id, meta: data.meta };
        });
        // Сбрасываем livePosition при выборе нового блока
        setLivePosition({ left: null, top: null, width: null, height: null });
        return;
      }

      if (data.type === MRPAK_MSG.TREE) {
        if (data.tree) {
          const nextTree = enrichLayersTree(data.tree, filePath, dependencyPaths);
          setLayersTree((prev) => {
            try {
              if (prev && JSON.stringify(prev) === JSON.stringify(nextTree)) {
                return prev;
              }
            } catch {}
            return nextTree;
          });
        }
        return;
      }

      if (data.type === MRPAK_MSG.STYLE_SNAPSHOT) {
        if (data.id) {
          setStyleSnapshots((prev) => ({
            ...(prev || {}),
            [data.id]: (() => {
              const nextSnap = { inlineStyle: data.inlineStyle || '', computedStyle: data.computedStyle || null };
              const prevSnap = prev?.[data.id];
              if (
                prevSnap &&
                prevSnap.inlineStyle === nextSnap.inlineStyle &&
                JSON.stringify(prevSnap.computedStyle || null) === JSON.stringify(nextSnap.computedStyle || null)
              ) {
                return prevSnap;
              }
              return nextSnap;
            })(),
          }));
        }
        return;
      }

      if (data.type === MRPAK_MSG.TEXT_SNAPSHOT) {
        if (data.id) {
          setTextSnapshots((prev) => ({
            ...(prev || {}),
            [data.id]: prev?.[data.id] === (data.text ?? '') ? prev[data.id] : (data.text ?? ''),
          }));
        }
        return;
      }

      if (data.type === MRPAK_MSG.APPLY) {
        const id = data.id;
        const patch = data.patch || {};
        const isIntermediate = data.isIntermediate === true; // Промежуточное изменение (при перетаскивании)
        console.log('[handleEditorMessage] APPLY received:', { id, patch, isIntermediate });
        if (!id) return;

        // Если из iframe пришло reparent, используем ref на stageReparentBlock
        if (patch.__reparentTo) {
          console.log('handleEditorMessage: reparent detected', {
            sourceId: id,
            targetParentId: patch.__reparentTo,
            hasRef: !!stageReparentBlockRef.current
          });
          if (stageReparentBlockRef.current) {
            stageReparentBlockRef.current({ sourceId: id, targetParentId: patch.__reparentTo });
          } else {
            console.error('handleEditorMessage: stageReparentBlockRef.current is null!');
          }
          return;
        }

        if (patch.__insertFromLibrary && !isIntermediate) {
          const sourceType = String(patch.__insertFromLibrary?.source || 'library');
          if (sourceType === 'component') {
            const componentName = String(patch.__insertFromLibrary?.componentName || '').trim();
            const importPath = String(patch.__insertFromLibrary?.importPath || '').trim();
            const importKind =
              String(patch.__insertFromLibrary?.importKind || 'default') === 'named'
                ? 'named'
                : 'default';
            const hasProps = Boolean(patch.__insertFromLibrary?.hasProps);
            const supportsStyleOnlyArg = Boolean(patch.__insertFromLibrary?.supportsStyleOnlyArg);
            if (hasProps && !supportsStyleOnlyArg) {
              setError(
                `Component "${componentName || 'Unknown'}" has props other than "style". Only components with no props or style-only props are supported right now.`
              );
              return;
            }
            if (!componentName || !importPath) {
              setError('Failed to insert component: import data is missing.');
              return;
            }
            const snippet = supportsStyleOnlyArg ? `<${componentName} style={{}} />` : `<${componentName} />`;
            if (stageInsertBlockRef.current) {
              await stageInsertBlockRef.current({ targetId: id, mode: 'child', snippet, skipIframeInsert: true });
              updateStagedComponentImports((prev) => {
                const exists = prev.some(
                  (item) =>
                    item.localName === componentName &&
                    item.importPath === importPath &&
                    item.importKind === importKind
                );
                if (exists) return prev;
                return [...prev, { localName: componentName, importPath, importKind }];
              });
              updateHasStagedChanges(true);
              const liveCode = monacoEditorRef?.current?.getValue?.();
              if (typeof liveCode === 'string' && liveCode.length > 0) {
                setFileContent(liveCode);
              }
              setRenderVersion((v) => v + 1);
            }
            return;
          }

          if (sourceType === 'file') {
            const sourceFilePath = String(patch.__insertFromLibrary?.filePath || '').trim();
            const importPath = String(patch.__insertFromLibrary?.importPath || '').trim();
            if (!sourceFilePath || !importPath) {
              setError('Failed to insert file: missing import data.');
              return;
            }

            const baseName = toSafeIdentifier(stripFileExtension(getPathBasename(sourceFilePath)));
            const usedNames = collectImportLocalNames(fileContent || '');
            (stagedComponentImportsRef.current || []).forEach((item) => {
              if (item?.localName) usedNames.add(item.localName);
            });
            const localName = ensureUniqueImportName(baseName, usedNames);
            const snippet =
              fileType === 'react-native'
                ? `<Image source={${localName}} />`
                : `<img src={${localName}} alt=\"\" />`;

            if (stageInsertBlockRef.current) {
              await stageInsertBlockRef.current({ targetId: id, mode: 'child', snippet, skipIframeInsert: true });
              updateStagedComponentImports((prev) => {
                const exists = prev.some(
                  (item) =>
                    item.localName === localName &&
                    item.importPath === importPath &&
                    item.importKind === 'default'
                );
                if (exists) return prev;
                return [...prev, { localName, importPath, importKind: 'default' }];
              });
              updateHasStagedChanges(true);
              const liveCode = monacoEditorRef?.current?.getValue?.();
              if (typeof liveCode === 'string' && liveCode.length > 0) {
                setFileContent(liveCode);
              }
              setRenderVersion((v) => v + 1);
            }
            return;
          }

          const rawTag = String(patch.__insertFromLibrary?.tag || '').trim();
          const normalizedTag = /^[A-Za-z][A-Za-z0-9_-]*$/.test(rawTag) ? rawTag : '';
          let tag = normalizedTag;
          if (!tag) {
            tag = fileType === 'react-native' ? 'View' : 'div';
          }
          const snippet =
            fileType === 'react-native'
              ? `<${tag}></${tag}>`
              : `<${tag}></${tag}>`;
          if (stageInsertBlockRef.current) {
            await stageInsertBlockRef.current({ targetId: id, mode: 'child', snippet });
          }
          return;
        }

        // Обновляем livePosition для отображения в реальном времени (только для промежуточных изменений)
        if (isIntermediate && selectedBlock?.id === id) {
          setLivePosition((prev) => {
            const newPos = { ...prev };
            // РР·РІР»РµРєР°РµРј числовые значения из patch
            const patchLeft = patch.marginLeft !== undefined ? patch.marginLeft : patch.left;
            const patchTop = patch.marginTop !== undefined ? patch.marginTop : patch.top;
            if (patchLeft !== undefined) {
              const leftVal = typeof patchLeft === 'string' ? parseFloat(patchLeft.replace('px', '')) : patchLeft;
              if (!isNaN(leftVal)) newPos.left = leftVal;
            }
            if (patchTop !== undefined) {
              const topVal = typeof patchTop === 'string' ? parseFloat(patchTop.replace('px', '')) : patchTop;
              if (!isNaN(topVal)) newPos.top = topVal;
            }
            if (patch.width !== undefined) {
              const widthVal = typeof patch.width === 'string' ? parseFloat(patch.width.replace('px', '')) : patch.width;
              if (!isNaN(widthVal)) newPos.width = widthVal;
            }
            if (patch.height !== undefined) {
              const heightVal = typeof patch.height === 'string' ? parseFloat(patch.height.replace('px', '')) : patch.height;
              if (!isNaN(heightVal)) newPos.height = heightVal;
            }
            return newPos;
          });
        }

        // Проверяем, доступен ли projectRoot для редактирования
        if (!projectRoot && !isIntermediate) {
          console.warn('[handleEditorMessage] Cannot apply patch - projectRoot not available');
          setError('Cannot apply changes: project is not loaded yet. Please wait and try again.');
          return;
        }
        
        // Bidirectional editing: применяем сразу (даже промежуточные изменения)
        await applyBlockPatch(id, patch, isIntermediate);
        return;
      }

      if (data.type === MRPAK_MSG.DROP_TARGET) {
        const source = String(data.source || 'library');
        const sourceId = data.sourceId ? String(data.sourceId) : null;
        const targetId = data.targetId ? String(data.targetId) : null;
        setExternalDropTargetState({ source, sourceId, targetId });
        return;
      }

      if (data.type === MRPAK_MSG.DROP_TARGET) {
        // пока только подсветка / возможная дальнейшая логика
        return;
      }
    },
    [
      applyBlockPatch,
      commitStagedPatches,
      dependencyPaths,
      fileContent,
      filePath,
      fileType,
      isModified,
      monacoEditorRef,
      projectRoot,
      sendIframeCommand,
      selectedBlock?.id,
      unsavedContent,
      updateStagedComponentImports,
      updateHasStagedChanges,
      viewMode,
    ]
  );

  const handleEditorMessageRef = useRef(handleEditorMessage);
  useEffect(() => {
    handleEditorMessageRef.current = handleEditorMessage;
  }, [handleEditorMessage]);

  const handleEditorMessageStable = useCallback((event: any) => {
    handleEditorMessageRef.current?.(event);
  }, []);

  const handleRenameLayer = useCallback(
    async (mrpakId, name) => {
      try {
        if (!projectRoot || !filePath) return;
        setLayerNames((prev) => ({ ...prev, [mrpakId]: String(name ?? '') }));
        await upsertLayerName({ projectRoot, targetFilePath: filePath, mrpakId, name });
      } catch (e) {
        console.warn('Rename layer failed:', e);
      }
    },
    [projectRoot, filePath]
  );

  // Создаем framework экземпляр для использования в компоненте
  const framework = useMemo(() => {
    if (!fileType || !filePath || !isFrameworkSupported(fileType)) {
      return null;
    }
    return createFramework(fileType, filePath);
  }, [fileType, filePath]);

  // Добавляет data-no-code-ui-id в HTML/JSX сниппет (в первый открывающий тег), если атрибут ещё не задан.
  // РСЃРїРѕР»СЊР·СѓРµС‚ framework.ensureSnippetHasMrpakId, если framework доступен
  const ensureSnippetHasMrpakId = useCallback((snippet, mrpakId) => {
    if (framework) {
      return framework.ensureSnippetHasMrpakId(snippet, mrpakId);
    }
    // Fallback для случаев, когда framework еще не создан
    const s = String(snippet || '').trim();
    if (!s) return s;
    if (/\bdata-no-code-ui-id\s*=/.test(s) || /\bdata-mrpak-id\s*=/.test(s)) return s;
    // Вставляем сразу после имени тега: <Tag ...> / <div ...>
    return s.replace(
      /^<\s*([A-Za-z_$][A-Za-z0-9_$.-]*)\b/,
      `<$1 data-no-code-ui-id="${String(mrpakId)}"`
    );
  }, [framework]);

  const makeTempMrpakId = useCallback(() => {
    return `mrpak:temp:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
  }, []);

  const stageDeleteBlock = useCallback(
    (blockId) => {
      if (!blockId) return;
      const mappedBlockId = resolveToMappedBlockId(blockId) || blockId;

      // Защита от дублирования
      const now = Date.now();
      if (lastDeleteOperationRef.current) {
        const { blockId: lastBlockId, timestamp } = lastDeleteOperationRef.current;
        if (lastBlockId === mappedBlockId && (now - timestamp) < 500) {
          console.warn('[stageDeleteBlock] Duplicate delete blocked', { blockId: mappedBlockId });
          return;
        }
      }
      lastDeleteOperationRef.current = { blockId: mappedBlockId, timestamp: now };

      // Bidirectional editing через AST: применяем сразу к constructorAST
      if (fileType === 'react' || fileType === 'react-native') {
        (async () => {
          try {
            const manager = astManagerRef.current;

            if (!manager) {
              if (projectRoot) {
                const newManager = new AstBidirectionalManager(filePath, projectRoot);
                const initResult = await newManager.initializeFromCode(String(fileContent ?? ''));
                if (!initResult.ok) {
                  throw new Error('Failed to initialize AstBidirectionalManager');
                }
                astManagerRef.current = newManager;
                // Продолжаем с новым менеджером
                return await stageDeleteBlock(mappedBlockId);
              } else {
                // Fallback: пока projectRoot не загружен, удаляем через framework.commitPatches
                const entry = blockMapForFile ? blockMapForFile[mappedBlockId] : null;
                const framework = createFramework(fileType as string, filePath);
                if (!framework) {
                  throw new Error('Unsupported file type for fallback delete');
                }

                const commitResult = await framework.commitPatches({
                  originalCode: String(fileContent ?? ''),
                  stagedPatches: {},
                  stagedOps: [
                    {
                      type: 'delete',
                      blockId: mappedBlockId,
                      fileType,
                      filePath,
                      mapEntry: entry || null,
                    },
                  ],
                  blockMapForFile: blockMapForFile || {},
                  externalStylesMap,
                  filePath,
                  resolvePath: resolvePathForFramework,
                  readFile: readFile as any,
                  writeFile: writeFile as any,
                });

                if (!commitResult.ok || !commitResult.code) {
                  throw new Error(`Framework fallback failed: ${commitResult.error || 'Unknown error'}`);
                }

                const newContent = commitResult.code;
                updateMonacoEditorWithScroll(newContent);
                updateStagedOps((prev) => [
                  ...prev,
                  {
                    type: 'delete',
                    blockId: mappedBlockId,
                    fileType,
                    filePath,
                    mapEntry: entry || null,
                  },
                ]);
                updateHasStagedChanges(true);

                addToHistory({
                  type: 'delete',
                  blockId: mappedBlockId,
                });

                return;
              }
            }

            // Обновляем codeAST при удалении (не трогаем constructorAST)
            let updateResult = manager.updateCodeAST(mappedBlockId, {
              type: 'delete',
            });
            if (!updateResult.ok && mappedBlockId !== blockId) {
              updateResult = manager.updateCodeAST(blockId, { type: 'delete' });
            }

            if (!updateResult.ok) {
              const entry = blockMapForFile ? blockMapForFile[mappedBlockId] : null;
              const framework = createFramework(fileType as string, filePath);
              if (framework) {
                const commitResult = await framework.commitPatches({
                  originalCode: String(fileContent ?? ''),
                  stagedPatches: {},
                  stagedOps: [
                    {
                      type: 'delete',
                      blockId: mappedBlockId,
                      fileType,
                      filePath,
                      mapEntry: entry || null,
                    },
                  ],
                  blockMapForFile: blockMapForFile || {},
                  externalStylesMap,
                  filePath,
                  resolvePath: resolvePathForFramework,
                  readFile: readFile as any,
                  writeFile: writeFile as any,
                });

                if (commitResult.ok && commitResult.code) {
                  const newContent = commitResult.code;
                  updateMonacoEditorWithScroll(newContent);
                  updateStagedOps((prev) => [
                    ...prev,
                    {
                      type: 'delete',
                      blockId: mappedBlockId,
                      fileType,
                      filePath,
                      mapEntry: entry || null,
                    },
                  ]);
                  updateHasStagedChanges(true);
                  addToHistory({
                    type: 'delete',
                    blockId: mappedBlockId,
                  });
                  return;
                }
              }
              throw new Error(updateResult.error || 'Element not found or no changes applied');
            }

            // Генерируем код из codeAST
            const generateResult = manager.generateCodeFromCodeAST();

            if (!generateResult.ok) {
              throw new Error(generateResult.error || 'Failed to generate code from codeAST');
            }

            const newContent = generateResult.code;

            // Автосохранение в файл

            // Обновляем fileContent и Monaco Editor без перезагрузки с сохранением скролла
            updateMonacoEditorWithScroll(newContent);
            updateStagedOps((prev) => [
              ...prev,
              {
                type: 'delete',
                blockId: mappedBlockId,
                fileType,
                filePath,
              },
            ]);
            updateHasStagedChanges(true);

            // Добавляем в историю для undo
            addToHistory({
              type: 'delete',
              blockId: mappedBlockId,
            });
          } catch (e) {
            console.error('stageDeleteBlock error:', e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Delete block failed: ${errorMessage}`);
          }
        })();
        // Локально удаляем в iframe
        sendIframeCommand({ type: MRPAK_CMD.DELETE, id: blockId });
        return;
      }

      // Для HTML используем старую логику через stagedOps
      const entry = blockMapForFile ? blockMapForFile[mappedBlockId] : null;
      updateStagedOps((prev) => [
        ...prev,
        {
          type: 'delete',
          blockId: mappedBlockId,
          fileType,
          filePath,
          mapEntry: entry || null,
        },
      ]);
      updateHasStagedChanges(true);

      // Добавляем в историю для undo
      addToHistory({
        type: 'delete',
        blockId: mappedBlockId,
        parentId: layersTree?.nodes[blockId]?.parentId || null,
        snippet: `<div data-no-code-ui-id="${blockId}">Удаленный блок</div>`, // Упрощенная версия
      });

      // Локально удаляем в iframe
      sendIframeCommand({ type: MRPAK_CMD.DELETE, id: blockId });
    },
    [blockMapForFile, fileType, filePath, layersTree, sendIframeCommand, updateStagedOps, updateHasStagedChanges, addToHistory, projectRoot, resolveToMappedBlockId]
  );

  const stageInsertBlock = useCallback(
    ({ targetId, mode, snippet, skipIframeInsert = false }) => {
      console.log('[stageInsertBlock] called', { targetId, mode, snippetPreview: snippet?.substring(0, 100) });

      if (!targetId) return;

      // Защита от дублирования: проверяем, не была ли такая же операция только что
      const operationKey = `${targetId}:${mode}:${snippet}`;
      const now = Date.now();
      if (lastInsertOperationRef.current) {
        const { key, timestamp } = lastInsertOperationRef.current;
        if (key === operationKey && (now - timestamp) < 500) {
          console.warn('[stageInsertBlock] duplicate insert prevented', {
            targetId,
            mode,
            timeDiff: now - timestamp
          });
          return;
        }
      }
      lastInsertOperationRef.current = { key: operationKey, timestamp: now };

      console.log('[stageInsertBlock] operation allowed, creating id...');

      const mappedTargetId = resolveToMappedBlockId(targetId) || targetId;
      const entry = blockMapForFile ? blockMapForFile[mappedTargetId] : null;
      const newId = makeTempMrpakId();
      console.log('[stageInsertBlock] generated id:', newId);

      const snippetWithId = ensureSnippetHasMrpakId(snippet, newId);
      console.log('[stageInsertBlock] snippet with id:', snippetWithId);

      // Bidirectional editing через AST для React/React Native
      if (fileType === 'react' || fileType === 'react-native') {
        (async () => {
          try {
            const manager = astManagerRef.current;

            if (!manager) {
              if (projectRoot) {
                const newManager = new AstBidirectionalManager(filePath, projectRoot);
                const initResult = await newManager.initializeFromCode(String(fileContent ?? ''));
                if (!initResult.ok) {
                  throw new Error('Failed to initialize AstBidirectionalManager');
                }
                astManagerRef.current = newManager;
                // Продолжаем с новым менеджером
                return await stageInsertBlock({ targetId: mappedTargetId, mode, snippet: snippetWithId });
              } else {
                // Fallback: пока projectRoot не загружен, вставляем через framework.commitPatches
                const framework = createFramework(fileType as string, filePath);
                if (!framework) {
                  throw new Error('Unsupported file type for fallback insert');
                }

                const commitResult = await framework.commitPatches({
                  originalCode: String(fileContent ?? ''),
                  stagedPatches: {},
                  stagedOps: [
                    {
                      type: 'insert',
                      targetId: mappedTargetId,
                      mode: mode === 'sibling' ? 'after' : 'child',
                      snippet: String(snippetWithId || ''),
                      blockId: newId,
                      fileType,
                      filePath,
                      mapEntry: entry || null,
                    },
                  ],
                    blockMapForFile: blockMapForFile || {},
                  externalStylesMap,
                  filePath,
                  resolvePath: resolvePathForFramework,
                  readFile: readFile as any,
                  writeFile: writeFile as any,
                });

                if (!commitResult.ok || !commitResult.code) {
                  throw new Error(`Framework fallback failed: ${commitResult.error || 'Unknown error'}`);
                }

                const newContent = commitResult.code;
                updateMonacoEditorWithScroll(newContent);
                updateStagedOps((prev) => [
                  ...prev,
                  {
                    type: 'insert',
                    targetId: mappedTargetId,
                    mode: mode === 'sibling' ? 'after' : 'child',
                    snippet: String(snippetWithId || ''),
                    blockId: newId,
                    fileType,
                    filePath,
                    mapEntry: entry || null,
                  },
                ]);
                updateHasStagedChanges(true);

                addToHistory({
                  type: 'insert',
                  blockId: newId,
                  targetId: mappedTargetId,
                  mode: mode === 'sibling' ? 'after' : 'child',
                  snippet: String(snippetWithId || ''),
                });

                return;
              }
            }

            // Обновляем codeAST при вставке (не трогаем constructorAST)
            let updateResult = manager.updateCodeAST(mappedTargetId, {
              type: 'insert',
              targetId: mappedTargetId,
              mode: mode === 'sibling' ? 'after' : 'child',
              snippet: String(snippetWithId || ''),
            });

            if (!updateResult.ok) {
              const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
              const refreshResult = await manager.updateCodeASTFromCode(String(currentCode ?? ''), true);
              if (refreshResult?.ok) {
                updateResult = manager.updateCodeAST(mappedTargetId, {
                  type: 'insert',
                  targetId: mappedTargetId,
                  mode: mode === 'sibling' ? 'after' : 'child',
                  snippet: String(snippetWithId || ''),
                });
              }
            }

            if (!updateResult.ok) {
              throw new Error(updateResult.error || 'Insert error in codeAST');
            }

            // Генерируем код из codeAST
            const generateResult = manager.generateCodeFromCodeAST();

            if (!generateResult.ok) {
              throw new Error(generateResult.error || 'Failed to generate code from codeAST');
            }

            const newContent = generateResult.code;

            // Автосохранение в файл

            // Обновляем fileContent и Monaco Editor без перезагрузки с сохранением скролла
            updateMonacoEditorWithScroll(newContent);
            updateStagedOps((prev) => [
              ...prev,
              {
                type: 'insert',
                targetId: mappedTargetId,
                mode: mode === 'sibling' ? 'after' : 'child',
                snippet: String(snippetWithId || ''),
                blockId: newId,
                fileType,
                filePath,
              },
            ]);
            updateHasStagedChanges(true);

            // Добавляем в историю для undo
            addToHistory({
              type: 'insert',
              blockId: newId,
              targetId: mappedTargetId,
              mode: mode === 'sibling' ? 'after' : 'child',
              snippet: String(snippetWithId || ''),
            });
          } catch (e) {
            console.error('stageInsertBlock error:', e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Insert block error: ${errorMessage}`);
          }
        })();

        // Локально вставляем в iframe
        if (!skipIframeInsert) {
          sendIframeCommand({
            type: MRPAK_CMD.INSERT,
            targetId,
            mode: mode === 'sibling' ? 'after' : 'child',
            html: String(snippetWithId || ''),
          });
        }
        return;
      }

      // Для HTML используем старую логику
      updateStagedOps((prev) => [
        ...prev,
        {
          type: 'insert',
          targetId: mappedTargetId,
          mode: mode === 'sibling' ? 'after' : 'child',
          snippet: String(snippetWithId || ''),
          blockId: newId,
          fileType,
          filePath,
          mapEntry: entry || null,
        },
      ]);
      updateHasStagedChanges(true);

      // Добавляем в историю для undo
      addToHistory({
        type: 'insert',
        blockId: newId,
        targetId: mappedTargetId,
        mode: mode === 'sibling' ? 'after' : 'child',
        snippet: String(snippetWithId || ''),
      });

      // Локально вставляем в iframe
      if (!skipIframeInsert) {
        sendIframeCommand({
          type: MRPAK_CMD.INSERT,
          targetId,
          mode: mode === 'sibling' ? 'after' : 'child',
          html: String(snippetWithId || ''),
        });
      }
    },
    [blockMapForFile, ensureSnippetHasMrpakId, fileType, filePath, makeTempMrpakId, sendIframeCommand, updateStagedOps, updateHasStagedChanges, addToHistory, projectRoot, resolveToMappedBlockId]
  );

  // Обновляем ref для использования в handleEditorMessage
  stageInsertBlockRef.current = stageInsertBlock;

  const stageReparentBlock = useCallback(
    ({ sourceId, targetParentId, targetBeforeId = null }) => {
      console.log('stageReparentBlock called:', { sourceId, targetParentId, targetBeforeId });
      if (!sourceId || !targetParentId || sourceId === targetParentId) {
        console.log('stageReparentBlock: skipping - invalid ids');
        return;
      }
      // Protect from cyclic tree operations: cannot move a node into its own descendant.
      const isMovingIntoOwnDescendant = (() => {
        const nodes = layersTree?.nodes;
        if (!nodes) return false;
        let currentId: string | null = String(targetParentId);
        const visited = new Set<string>();
        while (currentId && !visited.has(currentId)) {
          if (currentId === String(sourceId)) return true;
          visited.add(currentId);
          const nextParentId = nodes[currentId]?.parentId;
          if (!nextParentId || nextParentId === currentId) break;
          currentId = String(nextParentId);
        }
        return false;
      })();
      if (isMovingIntoOwnDescendant) {
        setError('Move block error: Cannot move a block into its own descendant');
        console.warn('[stageReparentBlock] blocked cyclic reparent', { sourceId, targetParentId });
        return;
      }

      // Защита от дублирования
      const operationKey = `${sourceId}:${targetParentId}:${targetBeforeId ?? ''}`;
      const now = Date.now();
      if (lastReparentOperationRef.current) {
        const { key, timestamp } = lastReparentOperationRef.current;
        if (key === operationKey && (now - timestamp) < 500) {
          console.warn('[stageReparentBlock] Дублирование операции reparent предотвращено', { sourceId, targetParentId });
          return;
        }
      }
      lastReparentOperationRef.current = { key: operationKey, timestamp: now };

      // Bidirectional editing через AST для React/React Native
      if (fileType === 'react' || fileType === 'react-native') {
        (async () => {
          try {
            const manager = astManagerRef.current;

            if (!manager) {
              if (projectRoot) {
                const newManager = new AstBidirectionalManager(filePath, projectRoot);
                const initResult = await newManager.initializeFromCode(String(fileContent ?? ''));
                if (!initResult.ok) {
                  throw new Error('Failed to initialize AstBidirectionalManager');
                }
                astManagerRef.current = newManager;
                // Продолжаем с новым менеджером
                return await stageReparentBlock({ sourceId, targetParentId, targetBeforeId });
              } else {
                throw new Error('projectRoot not available for AST bidirectional editing');
              }
            }

            // Обновляем codeAST при перемещении (не трогаем constructorAST)
            const updateResult = manager.updateCodeAST(sourceId, {
              type: 'reparent',
              sourceId,
              targetParentId,
              targetBeforeId,
            });

            if (!updateResult.ok) {
              throw new Error(updateResult.error || 'Move error in codeAST');
            }

            // Генерируем код из codeAST
            const generateResult = manager.generateCodeFromCodeAST();

            if (!generateResult.ok) {
              throw new Error(generateResult.error || 'Failed to generate code from codeAST');
            }

            const newContent = generateResult.code;

            // Автосохранение в файл

            // Обновляем fileContent и Monaco Editor без перезагрузки с сохранением скролла
            updateMonacoEditorWithScroll(newContent);
            updateStagedOps((prev) => [
              ...prev,
              {
                type: 'reparent',
                sourceId,
                targetParentId,
                targetBeforeId,
                fileType,
                filePath,
              },
            ]);
            updateHasStagedChanges(true);

            // Добавляем в историю для undo
            addToHistory({
              type: 'reparent',
              blockId: sourceId,
              oldParentId: layersTree?.nodes?.[sourceId]?.parentId || null,
              newParentId: targetParentId,
              targetBeforeId,
              fileType,
              filePath,
            });
          } catch (e) {
            console.error('stageReparentBlock error:', e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Move block error: ${errorMessage}`);
          }
        })();

        // Локально переносим в iframe
        if (!targetBeforeId) {
          sendIframeCommand({ type: MRPAK_CMD.REPARENT, sourceId, targetParentId });
        }
        return;
      }

      // Для HTML используем старую логику
      const sourceEntry = blockMapForFile ? blockMapForFile[sourceId] : null;
      const targetEntry = blockMapForFile ? blockMapForFile[targetParentId] : null;
      updateStagedOps((prev) => {
        const newOps = [
          ...prev,
          {
            type: 'reparent',
            sourceId,
            targetParentId,
            targetBeforeId,
            fileType,
            filePath,
            mapEntrySource: sourceEntry || null,
            mapEntryTarget: targetEntry || null,
          },
        ];
        return newOps;
      });
      updateHasStagedChanges(true);

      // Локально переносим в iframe
      if (!targetBeforeId) {
        sendIframeCommand({ type: MRPAK_CMD.REPARENT, sourceId, targetParentId });
      }
    },
    [blockMapForFile, fileType, filePath, sendIframeCommand, updateStagedOps, updateHasStagedChanges, addToHistory, projectRoot, layersTree]
  );

  // Update ref for handleEditorMessage usage
  stageReparentBlockRef.current = stageReparentBlock;

  const stageSetText = useCallback(
    ({ blockId, text }) => {
      if (!blockId) return;

      const mappedBlockId = resolveToMappedBlockId(blockId) || String(blockId);

      // Save previous text for undo
      const previousText = textSnapshots[mappedBlockId] || textSnapshots[blockId] || '';

      // AST bidirectional editing for React/React Native
      if (fileType === 'react' || fileType === 'react-native') {
        (async () => {
          try {
            const manager = astManagerRef.current;

            if (!manager) {
              if (projectRoot) {
                const newManager = new AstBidirectionalManager(filePath, projectRoot);
                const initResult = await newManager.initializeFromCode(String(fileContent ?? ''));
                if (!initResult.ok) {
                  throw new Error('Failed to initialize AstBidirectionalManager');
                }
                astManagerRef.current = newManager;
                // Retry with the new manager
                return await stageSetText({ blockId: mappedBlockId, text });
              } else {
                throw new Error('projectRoot not available for AST bidirectional editing');
              }
            }

            // Update codeAST for text change (do not touch constructorAST)
            let updateResult = manager.updateCodeAST(mappedBlockId, {
              type: 'text',
              text: String(text ?? ''),
            });

            if (!updateResult.ok) {
              // Try to refresh AST from current code and retry once.
              const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
              const refreshResult = await manager.updateCodeASTFromCode(String(currentCode ?? ''), true);
              if (refreshResult?.ok) {
                updateResult = manager.updateCodeAST(mappedBlockId, {
                  type: 'text',
                  text: String(text ?? ''),
                });
              }
            }

            if (!updateResult.ok) {
              throw new Error(updateResult.error || 'Text update error in codeAST');
            }

            // Generate code from codeAST
            const generateResult = manager.generateCodeFromCodeAST();

            if (!generateResult.ok) {
              throw new Error(generateResult.error || 'Failed to generate code from codeAST');
            }

            const newContent = generateResult.code;

            // Autosave to file

            // Update Monaco editor without full reload
            updateMonacoEditorWithScroll(newContent);
            updateStagedOps((prev) => [
              ...prev,
              {
                type: 'setText',
                blockId: mappedBlockId,
                text: String(text ?? ''),
                fileType,
                filePath,
              },
            ]);
            updateHasStagedChanges(true);

            // Add to history for undo
            addToHistory({
              type: 'setText',
              blockId: mappedBlockId,
              text: String(text ?? ''),
              previousText,
            });
          } catch (e) {
            console.error('stageSetText error:', e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Text change error: ${errorMessage}`);
          }
        })();

        // Update iframe locally
        sendIframeCommand({ type: MRPAK_CMD.SET_TEXT, id: blockId, text: String(text ?? '') });
        return;
      }

      // HTML: use legacy path
      const entry = blockMapForFile ? blockMapForFile[mappedBlockId] : null;
      updateStagedOps((prev) => [
        ...prev,
        {
          type: 'setText',
          blockId: mappedBlockId,
          text: String(text ?? ''),
          fileType,
          filePath,
          mapEntry: entry || null,
        },
      ]);
      updateHasStagedChanges(true);

      // Add to history for undo
      addToHistory({
        type: 'setText',
        blockId: mappedBlockId,
        text: String(text ?? ''),
        previousText,
      });

      // Apply in iframe
      sendIframeCommand({ type: MRPAK_CMD.SET_TEXT, id: blockId, text: String(text ?? '') });
    },
    [blockMapForFile, fileType, filePath, textSnapshots, sendIframeCommand, updateStagedOps, updateHasStagedChanges, addToHistory, projectRoot, fileContent, updateMonacoEditorWithScroll, resolveToMappedBlockId]
  );

  // Функция сохранения файла
  const extractSelectedToComponent = useCallback(async () => {
    try {
      if (!filePath || !fileContent) return;
      if (fileType !== 'react' && fileType !== 'react-native') {
        setError('Extract to component is supported only for React/React Native files.');
        return;
      }

      const ids = selectedBlockIds.length > 0
        ? selectedBlockIds
        : (selectedBlock?.id ? [selectedBlock.id] : []);
      if (ids.length === 0) {
        setError('Select block(s) on canvas first.');
        return;
      }

      const hasMapEntry = (id: string) => {
        const entry = blockMapForFile?.[id];
        return !!(entry && Number.isFinite(entry.start) && Number.isFinite(entry.end));
      };

      const resolveToExtractableId = (rawId: string) => {
        let current = String(rawId || '').trim();
        if (!current) return null;
        if (hasMapEntry(current)) return current;
        const visited = new Set<string>();
        while (current && !visited.has(current)) {
          visited.add(current);
          const parentId = layersTree?.nodes?.[current]?.parentId || null;
          if (!parentId) break;
          current = String(parentId);
          if (hasMapEntry(current)) return current;
        }
        return null;
      };

      const resolvedIds = Array.from(
        new Set(
          ids
            .map((id) => resolveToExtractableId(String(id)))
            .filter((id): id is string => !!id)
        )
      );
      if (resolvedIds.length === 0) {
        setError('Selected runtime elements do not map to source code. Select a parent block with data-id and retry.');
        return;
      }

      const normalizedFilePath = String(filePath).replace(/\\/g, '/');
      const slashIdx = normalizedFilePath.lastIndexOf('/');
      const dirPath = slashIdx >= 0 ? normalizedFilePath.slice(0, slashIdx) : '';
      const extMatch = normalizedFilePath.match(/(\.[^.\/\\]+)$/);
      const ext = extMatch ? extMatch[1] : '.tsx';

      let componentName = 'ExtractedBlock';
      let candidatePath = dirPath ? `${dirPath}/${componentName}${ext}` : `${componentName}${ext}`;
      for (let i = 1; i <= 99; i += 1) {
        const readRes = await readFile(candidatePath);
        if (!readRes?.success) {
          if (i > 1) {
            componentName = `ExtractedBlock${i}`;
            candidatePath = dirPath ? `${dirPath}/${componentName}${ext}` : `${componentName}${ext}`;
          }
          break;
        }
        componentName = `ExtractedBlock${i + 1}`;
        candidatePath = dirPath ? `${dirPath}/${componentName}${ext}` : `${componentName}${ext}`;
      }

      const extractResult = extractJsxToComponent({
        code: fileContent,
        filePath,
        selectedIds: resolvedIds,
        componentName,
        fileType,
        blockMap: blockMapForFile,
      });

      if (!extractResult.ok) {
        setError(`Extract block error: ${extractResult.error}`);
        return;
      }

      const writeComponentRes = await writeFile(candidatePath, extractResult.newComponentCode, { backup: true });
      if (!writeComponentRes?.success) {
        setError(`Failed to create component file: ${candidatePath}`);
        return;
      }

      const writeMainRes = await writeFile(filePath, extractResult.newMainCode, { backup: true });
      if (!writeMainRes?.success) {
        setError('Failed to update source file after extraction.');
        return;
      }

      onProjectFilesChanged?.();

      setFileContent(extractResult.newMainCode);
      setUnsavedContent(null);
      setIsModified(false);
      updateMonacoEditorWithScroll(extractResult.newMainCode);
      setRenderVersion((v) => v + 1);
      setSelectedBlockIds([]);
      setSelectedBlock(null);
      setLivePosition({ left: null, top: null, width: null, height: null });
    } catch (e: any) {
      setError(`Extract block error: ${e?.message || e}`);
    }
  }, [filePath, fileContent, fileType, selectedBlockIds, selectedBlock?.id, blockMapForFile, layersTree, updateMonacoEditorWithScroll, onProjectFilesChanged]);

  const saveFile = useCallback(async (contentToSave: string | null = null) => {
    if (!filePath) {
      console.warn('рџ’ѕ saveFile: Нет пути к файлу');
      return;
    }

    console.log('рџ’ѕ saveFile: Начинаю сохранение файла', {
      hasContentToSave: contentToSave !== null && contentToSave !== undefined,
      hasMonacoRef: !!monacoEditorRef?.current,
      hasUnsavedContent: unsavedContent !== null,
      fileType
    });

    // Приоритет получения содержимого:
    // 1. Явно переданный contentToSave
    // 2. Текущее значение из редактора (самое актуальное)
    // 3. unsavedContent из состояния
    // 4. fileContent
    let content = contentToSave;
    if (content === null || content === undefined) {
      // Пытаемся получить текущее значение из редактора напрямую
      if (monacoEditorRef?.current) {
        try {
          content = monacoEditorRef.current.getValue();
          console.log('рџ’ѕ saveFile: Получено содержимое из Monaco Editor');
        } catch (e) {
          console.warn('рџ’ѕ saveFile: Ошибка получения значения из редактора:', e);
        }
      }
      // Если не удалось получить из редактора, используем состояние
      if (content === null || content === undefined) {
        content = unsavedContent !== null ? unsavedContent : fileContent;
        console.log('рџ’ѕ saveFile: РСЃРїРѕР»СЊР·СѓСЋ содержимое из состояния');
      }
    }

    if (content === null || content === undefined) {
      console.warn('рџ’ѕ saveFile: content is null or undefined, сохранение прервано');
      return;
    }

    try {
      console.log('рџ’ѕ saveFile: Записываю файл, размер:', content.length, 'байт');
      const writeRes = await writeFile(filePath, content, { backup: true });
        if (writeRes?.success) {
          // Обновляем состояния после успешного сохранения
          setFileContent(content);
          setUnsavedContent(null);
          setIsModified(false);

          // Показываем индикатор сохранения
          setShowSaveIndicator(true);
          setTimeout(() => setShowSaveIndicator(false), 2000);

          // Обновляем парсинг импортов стилей для React/React Native файлов
          if (fileType === 'react' || fileType === 'react-native') {
            const imports = parseStyleImports(content) as Record<string, { path: string; type: string }>;
            setExternalStylesMap(imports);
          }

          console.log('[saveFile] file saved successfully', {
            path: filePath,
            size: content.length,
            lines: content.split('\n').length
          });
        } else {
          const errorMsg = `File save error: ${writeRes?.error || 'Unknown error'}`;
          console.error('[saveFile] failed', errorMsg);
          setError(errorMsg);
        }
    } catch (e) {
      console.error('[saveFile] exception during save:', e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`File save error: ${errorMessage}`);
    }
  }, [filePath, unsavedContent, fileContent, fileType]);

  // Обработка изменений в редакторе с автосохранением
  useEffect(() => {
    saveFileRef.current = saveFile;
  }, [saveFile]);

  const handleEditorChange = useCallback((newValue) => {
    if (isUpdatingFromFileRef.current) {
      return;
    }
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    setUnsavedContent(newValue);
    setIsModified(true);
  }, []);

  const getCurrentFileDir = useCallback(() => {
    const normalized = toPosixPath(filePath);
    const idx = normalized.lastIndexOf('/');
    return idx >= 0 ? normalized.slice(0, idx) : '';
  }, [filePath]);

  const isCanceledError = useCallback((error: unknown) => {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return (
      message.includes('canceled')
      || message.includes('cancelled')
      || message.includes('abort')
    );
  }, []);

  const loadStyleLibraryEntries = useCallback(async () => {
    try {
      const currentDir = getCurrentFileDir();
      if (!currentDir) {
        setStyleLibraryEntries([]);
        return;
      }

      const dirResult = await readDirectory(currentDir);
      if (!dirResult?.success || !Array.isArray(dirResult.items)) {
        setStyleLibraryEntries([]);
        return;
      }

      const styleDirs = dirResult.items
        .filter((item: any) => item?.isDirectory && /^styles\d+$/i.test(String(item.name || '')))
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

      const cssPaths = new Set<string>();
      const collected: StyleLibraryEntry[] = [];
      for (const styleDir of styleDirs) {
        const dirPath = `${currentDir}/${styleDir.name}`;
        const filesResult = await readDirectory(dirPath);
        if (!filesResult?.success || !Array.isArray(filesResult.items)) continue;
        for (const item of filesResult.items) {
          if (!item?.isFile || !/\.css$/i.test(String(item.name || ''))) continue;
          const cssPath = `${dirPath}/${item.name}`;
          cssPaths.add(cssPath);
        }
      }

      const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
      const importedCssPaths = extractImportedCssPathsFromCode(currentCode, fileType, filePath);
      importedCssPaths.forEach((path) => cssPaths.add(path));

      for (const cssPath of Array.from(cssPaths)) {
        const cssRead = await readFile(cssPath);
        if (!cssRead?.success) continue;
        const cssText = String(cssRead.content || '');
        const entries = parseCssLibraryEntries(cssText, fileType, cssPath);
        if (entries.length > 0) {
          collected.push(...entries);
        }
      }

      setStyleLibraryEntries(collected);
    } catch (error) {
      if (isCanceledError(error)) return;
      console.error('[RenderFile] Failed to load style library entries:', error);
      setStyleLibraryEntries([]);
    }
  }, [fileContent, filePath, fileType, getCurrentFileDir, isCanceledError]);

  const ensureNextStylesDir = useCallback(async (): Promise<string | null> => {
    const currentDir = getCurrentFileDir();
    if (!currentDir) return null;

    const dirResult = await readDirectory(currentDir);
    if (!dirResult?.success || !Array.isArray(dirResult.items)) return null;
    const names = new Set(
      dirResult.items
        .filter((item: any) => item?.isDirectory)
        .map((item: any) => String(item.name || ''))
    );

    let n = 1;
    while (names.has(`styles${n}`)) n += 1;
    const stylesDirName = `styles${n}`;
    const createRes = await createFolder(`${currentDir}/${stylesDirName}`);
    if (!createRes?.success) return null;
    return `${currentDir}/${stylesDirName}`;
  }, [getCurrentFileDir]);

  const importCssIntoCurrentFile = useCallback(async (relativeImportPath: string) => {
    const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
    if (!currentCode) return;

    let nextContent = String(currentCode);
    if (fileType === 'html') {
      const linkTag = `<link rel="stylesheet" href="${relativeImportPath}">`;
      if (!nextContent.includes(linkTag)) {
        if (nextContent.includes('</head>')) {
          nextContent = nextContent.replace('</head>', `  ${linkTag}\n</head>`);
        } else {
          nextContent = `${linkTag}\n${nextContent}`;
        }
      }
    } else {
      nextContent = ensureCssImportInCode(nextContent, relativeImportPath);
    }

    updateMonacoEditorWithScroll(nextContent);
    setFileContent(nextContent);
    setUnsavedContent(nextContent);
    setIsModified(true);
    setRenderVersion((v) => v + 1);
  }, [fileContent, fileType, updateMonacoEditorWithScroll]);

  const handleImportStyleTemplate = useCallback(async (templateId: string) => {
    try {
    const template = STYLE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const targetDir = await ensureNextStylesDir();
    if (!targetDir) {
      setError('Failed to create stylesN folder for template.');
      return;
    }

    const cssPath = `${targetDir}/${template.fileName}`;
    const writeRes = await writeFile(cssPath, template.cssText, { backup: false });
    if (!writeRes?.success) {
      setError(`Failed to write template file: ${writeRes?.error || 'unknown error'}`);
      return;
    }

    const relativeImportPath = getRelativeImportPath(filePath, cssPath);
    await importCssIntoCurrentFile(relativeImportPath);
    await loadStyleLibraryEntries();
    } catch (error) {
      if (isCanceledError(error)) return;
      const message = error instanceof Error ? error.message : String(error);
      setError(`Style template import error: ${message}`);
    }
  }, [ensureNextStylesDir, filePath, importCssIntoCurrentFile, isCanceledError, loadStyleLibraryEntries, writeFile]);

  const handleImportStyleFromPicker = useCallback(async () => {
    try {
    const pickRes = await openFileDialog([{ name: 'CSS', extensions: ['css'] } as any]);
    if (!pickRes || pickRes.canceled || !pickRes.fileHandle) return;
    const pickedFile = await pickRes.fileHandle.getFile();
    const cssText = await pickedFile.text();
    const cssFileName = String(pickedFile.name || 'imported-style.css').replace(/[^a-zA-Z0-9._-]/g, '_');

    const targetDir = await ensureNextStylesDir();
    if (!targetDir) {
      setError('Failed to create stylesN folder for imported file.');
      return;
    }

    const cssPath = `${targetDir}/${cssFileName}`;
    const writeRes = await writeFile(cssPath, cssText, { backup: false });
    if (!writeRes?.success) {
      setError(`Failed to save selected CSS: ${writeRes?.error || 'unknown error'}`);
      return;
    }

    const relativeImportPath = getRelativeImportPath(filePath, cssPath);
    await importCssIntoCurrentFile(relativeImportPath);
    await loadStyleLibraryEntries();
    } catch (error) {
      if (isCanceledError(error)) return;
      const message = error instanceof Error ? error.message : String(error);
      setError(`CSS import error: ${message}`);
    }
  }, [ensureNextStylesDir, filePath, importCssIntoCurrentFile, isCanceledError, loadStyleLibraryEntries, writeFile]);

  useEffect(() => {
    void loadStyleLibraryEntries();
  }, [filePath, loadStyleLibraryEntries]);

  // Обработка Ctrl+S (глобальный обработчик)
  useEffect(() => {
    console.log('рџ’ѕ [useEffect] Регистрация глобального обработчика Ctrl+S', {
      viewMode,
      isModified,
      hasStagedChanges,
      hasFilePath: !!filePath
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = String(e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        console.log('рџ’ѕ [Global Ctrl+S] вњ… РћР‘Р РђР‘РћРўР§РРљ ВЫЗВАН!', {
          target: e.target instanceof Element ? e.target.tagName : undefined,
          currentTarget: e.currentTarget,
          phase: e.eventPhase === 1 ? 'CAPTURE' : e.eventPhase === 2 ? 'TARGET' : 'BUBBLE'
        });

        e.preventDefault();
        e.stopPropagation();
        if (typeof (e as any).stopImmediatePropagation === 'function') {
          (e as any).stopImmediatePropagation();
        }

        console.log('рџ’ѕ [Global Ctrl+S] Нажата комбинация для сохранения', {
          isModified,
          viewMode,
          hasStagedChanges,
          hasFilePath: !!filePath
        });

        if (!filePath) {
          console.log('рџ’ѕ [Global Ctrl+S] Нет файла для сохранения');
          return;
        }

        // В split режиме Ctrl+S сохраняет код из Monaco Editor
        if (hasStagedChanges) {
          console.log('рџ’ѕ [Global Ctrl+S] Коммит staged-изменений...');
          void commitStagedPatches();
          return;
        }
        if (viewMode === 'split' && isModified) {
          let contentToSave: string | null = null;
          if (monacoEditorRef?.current) {
            try {
              contentToSave = monacoEditorRef.current.getValue();
            } catch (e) {
              console.warn('рџ’ѕ [Global Ctrl+S] Ошибка получения значения из редактора:', e);
            }
          }
          if (!contentToSave) {
            contentToSave = unsavedContent !== null ? unsavedContent : fileContent;
          }
          if (contentToSave) {
            console.log('рџ’ѕ [Global Ctrl+S] Сохраняю изменения кода в режиме split...');
          saveFile(contentToSave);
          }
          return;
        }

        // В режиме preview сохраняем только если есть несохраненные изменения
        if (viewMode === 'preview' && isModified) {
          console.log('рџ’ѕ [Global Ctrl+S] Сохраняю изменения в режиме preview...');
          saveFile();
        } else {
          console.log('рџ’ѕ [Global Ctrl+S] Сохранение пропущено (нет изменений в preview)');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isModified, filePath, saveFile, viewMode, hasStagedChanges, commitStagedPatches, unsavedContent, fileContent, monacoEditorRef]);

  // Обработка Ctrl+Z (Undo) и Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Только в режиме конструктора
      if (viewMode !== 'split') return;

      // Ctrl+Z или Cmd+Z (без Shift) - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        console.log('вЏ®пёЏ [Global Ctrl+Z] Отмена операции');
        undo();
        return;
      }

      // Ctrl+Shift+Z или Cmd+Shift+Z - Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        console.log('вЏ­пёЏ [Global Ctrl+Shift+Z] Повтор операции');
        redo();
        return;
      }

      // Альтернативная комбинация для Redo: Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        e.stopPropagation();
        console.log('вЏ­пёЏ [Global Ctrl+Y] Повтор операции');
        redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewMode, undo, redo]);

  // Переключение режима Alt-resize (margin/size/padding) стрелками в†ђ/в†’
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'split') return;
      if (!selectedBlock?.id) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const tag = String(activeEl?.tagName || '').toLowerCase();
      const isTypingTarget =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        !!activeEl?.isContentEditable ||
        !!activeEl?.closest?.('.monaco-editor') ||
        !!activeEl?.classList?.contains?.('inputarea');
      if (isTypingTarget) return;

      e.preventDefault();
      e.stopPropagation();
      sendIframeCommand({
        type: MRPAK_CMD.SET_RESIZE_TARGET,
        direction: e.key === 'ArrowLeft' ? 'left' : 'right',
      });
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [viewMode, selectedBlock?.id, sendIframeCommand]);

  // Обработчики для изменения размера split панелей
  const handleSplitResizeStart = useCallback((target: 'main' | 'sidebar') => (e: any) => {
    setResizeTarget(target);
    setIsResizing(true);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }, []);

  const handleSplitResize = useCallback((e: any) => {
    if (!isResizing || !resizeTarget) return;

    // Для React Native Web используем DOM API
    let container = (resizeTarget === 'sidebar' ? splitContainerRef.current : splitMainPanelsRef.current) as any;

    // Пробуем получить DOM элемент разными способами
    if (container) {
      if (typeof (container as HTMLElement).getBoundingClientRect === 'function') {
        // Уже DOM элемент
      } else if ((container as any)._nativeNode) {
        container = (container as any)._nativeNode;
      } else if ((container as any)._internalInstanceHandle?.stateNode) {
        container = (container as any)._internalInstanceHandle.stateNode;
      } else if ((container as any)._owner?.stateNode) {
        container = (container as any)._owner.stateNode;
      }
    }

    // Пробуем найти через document.querySelector если ref не работает
    if (!container || typeof container.getBoundingClientRect !== 'function') {
      // РСЃРїРѕР»СЊР·СѓРµРј глобальный поиск по классу или data-атрибуту
      const splitContainers = document.querySelectorAll(resizeTarget === 'sidebar' ? '[data-split-container]' : '[data-split-main-panels]');
      if (splitContainers.length > 0) {
        container = splitContainers[0] as HTMLElement;
      }
    }

    if (!container || typeof container.getBoundingClientRect !== 'function') {
      return;
    }

    const rect = container.getBoundingClientRect();
    const x = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    if (resizeTarget === 'sidebar') {
      const newSidebarWidth = Math.max(240, Math.min(520, x - rect.left));
      setSplitSidebarWidth(newSidebarWidth);
      return;
    }
    const relativeX = x - rect.left;
    const newWidth = Math.max(0.2, Math.min(0.8, relativeX / rect.width));

    setSplitLeftWidth(newWidth);
  }, [isResizing, resizeTarget]);

  const handleSplitResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeTarget(null);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }, []);

  // Эффект для обработки изменения размера
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: any) => {
      handleSplitResize(e);
      if (e.preventDefault) e.preventDefault();
    };
    const handleMouseUp = () => {
      handleSplitResizeEnd();
    };
    const handleTouchMove = (e: any) => {
      handleSplitResize(e);
      if (e.preventDefault) e.preventDefault();
    };
    const handleTouchEnd = () => {
      handleSplitResizeEnd();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [isResizing, handleSplitResize, handleSplitResizeEnd]);

  const loadFile = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    setFileContent(null);
    setSelectedBlock(null);
    setSelectedBlockIds([]);
    setUnsavedContent(null);
    setIsModified(false);

    try {
      console.log('RenderFile: Loading file:', path);
      const result = await readFile(path);
        console.log('RenderFile: File read result:', result);

        if (result.success) {
          console.log('RenderFile: File content loaded, length:', result.content?.length);
          setFileContent(result.content || '');
          setUnsavedContent(null);
          setIsModified(false);

          // Парсим импорты стилей для React/React Native файлов
          const type = getFileType(path, result.content);
          if (type === 'react' || type === 'react-native') {
            const imports = parseStyleImports(result.content || '') as Record<string, { path: string; type: string }>;
            setExternalStylesMap(imports);
            console.log('RenderFile: Parsed style imports:', imports);

            // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј менеджер AST для bidirectional editing
            // Менеджер будет инициализирован позже, когда projectRoot будет доступен
            // (в useEffect для загрузки projectRoot)
          } else {
            setExternalStylesMap({});
          }
        } else {
          console.error('RenderFile: File read failed:', result.error);
          setError(`File read error: ${result.error}`);
        }
    } catch (err) {
      console.error('RenderFile: Exception:', err);
      

      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка projectRoot + имён слоёв при входе в редактор
  // ВАЖНО: не включаем findProjectRoot в deps, иначе будет TDZ (findProjectRoot объявлен ниже по файлу).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
        console.log("[RenderFile] Project root loading...", { viewMode, filePath });
      if (viewMode !== 'split' || !filePath) {
        console.log("[RenderFile] Skipping project root load:", { viewMode, filePath });
        return;
      }
      try {
        // РСЃРїРѕР»СЊР·СѓРµРј projectPath как корень проекта
        let root = projectPath;
        console.log("[RenderFile] Using projectPath as root:", projectPath);
        
        // Если projectPath недоступен, пробуем определить из filePath
        if (!root && filePath) {
          const normalizedPath = filePath.replace(/\\/g, '/');
          console.log("[RenderFile] Normalized path:", normalizedPath);
          const lastSlash = normalizedPath.lastIndexOf('/');
          console.log("[RenderFile] Last slash index:", lastSlash);
          if (lastSlash > 0) {
            root = normalizedPath.substring(0, lastSlash);
            console.log("[RenderFile] Initial root:", root);
            // Если это директория src, поднимемся еще на уровень вверх
            if (root.endsWith('/src')) {
              root = root.substring(0, root.length - 4);
              console.log("[RenderFile] Adjusted root (removed /src):", root);
            }
          }
        }
        
        // Fallback: пробуем найти projectRoot через API (для Electron)
        if (!root) {
          root = await findProjectRoot(filePath);
        }
        
        console.log('[RenderFile] Project root set to:', root);
        if (cancelled) return;
        setProjectRoot(root);
        if (root) {
          const res = await loadLayerNames({ projectRoot: root, targetFilePath: filePath });
          if (!cancelled && res?.ok) {
            setLayerNames(res.names || {});
          }

          // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј AstBidirectionalManager если это React/React Native файл
          if ((fileType === 'react' || fileType === 'react-native') && fileContent) {
            const manager = new AstBidirectionalManager(filePath, root);
            const initResult = await manager.initializeFromCode(String(fileContent));
            if (initResult.ok) {
              astManagerRef.current = manager;
              console.log('[RenderFile] Initialized AstBidirectionalManager');
            } else {
              console.warn('[RenderFile] Failed to initialize AstBidirectionalManager:', initResult.error);
              astManagerRef.current = null;
            }
          }
        } else {
          astManagerRef.current = null;
        }
      } catch (e) {
        // ignore
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filePath]);

  // Переопределяем тип файла после загрузки содержимого
  useEffect(() => {
    if (fileContent && filePath) {
      const refinedType = getFileType(filePath, fileContent);
      if (refinedType !== fileType) {
        console.log(`RenderFile: Refining file type from ${fileType} to ${refinedType} based on content`);
        setFileType(refinedType);
      }
    }
  }, [fileContent, filePath]); // fileType не включаем в deps, чтобы избежать циклов

  useEffect(() => {
    let currentFilePath = filePath;

    if (!filePath) {
      console.log('RenderFile: No file path provided');
      setFileContent(null);
      setFileType(null);
      setError(null);
      setReactHTML('');
      setReactNativeHTML('');
      setIsProcessingReact(false);
      setIsProcessingReactNative(false);
      setUnsavedContent(null);
      setIsModified(false);
      return;
    }

    console.log('RenderFile: File path changed:', filePath);
    // Сначала определяем тип по пути (предварительно)
    // После загрузки файла тип будет уточнён на основе содержимого
    const initialType = getFileType(filePath);
    console.log('RenderFile: Initial file type:', initialType);
    setFileType(initialType);
    onViewModeChange('preview'); // Сбрасываем режим просмотра при смене файла
    setBlockMap({});
    setBlockMapForFile({});
    setSelectedBlock(null);
    setChangesLog([]);
    setEditorHTML('');
    // Сбрасываем staged изменения через update* для синхронизации рефов
    updateStagedPatches({});
    updateStagedComponentImports([]);
    updateHasStagedChanges(false);
    updateStagedOps([]);
    setLayersTree(null);
    setLayerNames({});
    setProjectRoot(null);
    setIframeCommand(null);
    setExternalDropTargetState(null);
    setUnsavedContent(null);
    setIsModified(false);
    setRenderVersion((v) => v + 1);
    // Очищаем историю undo/redo при смене файла
    setUndoStack([]);
    setRedoStack([]);
    loadFile(filePath);

    // Начинаем отслеживание изменений файла
    watchFile(filePath).then((result) => {
      if (result.success) {
        console.log('RenderFile: Started watching file:', filePath);
      } else {
        console.warn('RenderFile: Failed to watch file:', result.error);
      }
    });

    // Обработчик изменений файла
    const handleFileChanged = async (changedFilePath: string) => {
      if (changedFilePath === currentFilePath) {
        console.log('RenderFile: File changed, syncing with AST:', changedFilePath);

        // Сохраняем текущий фокус (selectedBlock) перед обновлением
        const savedSelectedBlock = selectedBlock;

        // Bidirectional editing через AST: синхронизируем код -> constructorAST
        if ((fileType === 'react' || fileType === 'react-native') && viewMode === 'split') {
          try {
            // Загружаем новый код
            const readResult = await readFile(changedFilePath);
            if (readResult?.success && readResult.content) {
              const newCode = readResult.content;

              // Обновляем codeAST из нового кода и синхронизируем constructorAST
              const manager = astManagerRef.current;

              if (!manager) {
                // Если менеджер не инициализирован, создаем его
                const newManager = new AstBidirectionalManager(changedFilePath, projectRoot);
                const initResult = await newManager.initializeFromCode(newCode);
                if (initResult.ok) {
                  astManagerRef.current = newManager;
                  setFileContent(newCode);

                  // Восстанавливаем фокус
                  if (savedSelectedBlock) {
                    setTimeout(() => {
                      setSelectedBlock(savedSelectedBlock);
                      sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
                    }, 100);
                  }
                  return;
                } else {
                  console.warn('[RenderFile] Failed to initialize AstBidirectionalManager, falling back');
                }
              } else {
                // Проверяем, не обновляется ли это из конструктора (чтобы избежать рекурсии)
                if (isUpdatingFromConstructorRef.current) {
                  console.log('[RenderFile] Skipping file update - update is from constructor');
                  // Обновляем только codeAST без синхронизации constructorAST
                  const updateResult = await manager.updateCodeASTFromCode(newCode, true);
                  if (updateResult.ok) {
                    setFileContent(newCode);
                    updateMonacoEditorWithScroll(newCode);
                  }
                  return;
                }

                // Устанавливаем флаг для предотвращения рекурсии
                isUpdatingFromFileRef.current = true;

                try {
                  // Обновляем codeAST из нового кода и синхронизируем constructorAST
                  // НЕ обновляем конструктор напрямую - он работает только через constructorAST
                  const updateResult = await manager.updateCodeASTFromCode(newCode, false);

                  if (updateResult.ok) {
                    console.log('[RenderFile] Updated codeAST and synced constructorAST from new code');

                    // Обновляем fileContent для Monaco Editor
                    setFileContent(newCode);

                    // Обновляем Monaco Editor без перезагрузки с сохранением скролла
                    updateMonacoEditorWithScroll(newCode);

                    // Восстанавливаем фокус после синхронизации
                    if (savedSelectedBlock) {
                      setTimeout(() => {
                        setSelectedBlock(savedSelectedBlock);
                        sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
                      }, 100);
                    }
                    return;
                  } else {
                    console.warn('[RenderFile] Failed to update codeAST from code:', updateResult.error);
                  }
                } finally {
                  // Сбрасываем флаг
                  setTimeout(() => {
                    isUpdatingFromFileRef.current = false;
                  }, 100);
                }
              }
            }
          } catch (error) {
            console.warn('[RenderFile] AST bidirectional sync failed, falling back to full reload:', error);
          }
        }

        // Fallback на полную перезагрузку
        console.log('RenderFile: File changed, reloading:', changedFilePath);
        setTimeout(() => {
          loadFile(changedFilePath);
          // Восстанавливаем фокус после перезагрузки
          if (savedSelectedBlock) {
            setTimeout(() => {
              setSelectedBlock(savedSelectedBlock);
              sendIframeCommand({ type: MRPAK_CMD.SELECT, id: savedSelectedBlock.id });
            }, 200);
          }
        }, 100);
      }
    };

    // Подписываемся на события изменения файла
    const unsubscribe: () => void = onFileChanged(handleFileChanged) as unknown as () => void;

    // Cleanup: останавливаем отслеживание при размонтировании или смене файла
    return () => {
      // Отписываемся от событий
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }

      // Останавливаем watcher
      if (currentFilePath) {
        unwatchFile(currentFilePath);
        console.log('RenderFile: Stopped watching file:', currentFilePath);
      }
    };
  }, [filePath, loadFile, updateStagedPatches, updateHasStagedChanges, updateStagedOps, updateStagedComponentImports]);

  const previewSourceCode = useMemo(() => {
    const baseCode = String(fileContent ?? '');
    if (!baseCode) return baseCode;
    if (fileType !== 'react' && fileType !== 'react-native') return baseCode;
    const pendingImports = Array.isArray(stagedComponentImports) ? stagedComponentImports : [];
    if (pendingImports.length === 0) return baseCode;
    let nextCode = baseCode;
    for (const importMeta of pendingImports) {
      nextCode = ensureComponentImportInCode(nextCode, importMeta);
    }
    return nextCode;
  }, [fileContent, fileType, stagedComponentImports]);

  // Обработка React файлов с зависимостями
  useEffect(() => {
    if (fileType === 'react' && previewSourceCode && filePath) {
      const generateHTML = async () => {
        setIsProcessingReact(true);
        try {
          console.log('RenderFile: Rendering React file, content length:', previewSourceCode.length);
          const framework = createFramework('react', filePath);
          const result = await framework.generateHTML(previewSourceCode, filePath, {
            viewMode,
            projectRoot: projectRoot || undefined,
            selectedComponentName,
            aggressivePreviewMode,
          });
          console.log('RenderFile: Generated React HTML length:', result.html.length);
          console.log('RenderFile: Dependency paths:', result.dependencyPaths);
          setReactHTML(result.html);
          setBlockMap(result.blockMapForEditor || {});
          setBlockMapForFile(result.blockMapForFile || {});
          setDependencyPaths(result.dependencyPaths); // Сохраняем пути зависимостей
          setPreviewOpenError(null);
        } catch (error) {
          console.error('RenderFile: Error generating HTML:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          setPreviewOpenError(errorMessage);
          setReactHTML(`<html><body><div class="error">Processing error: ${errorMessage}</div></body></html>`);
          setDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingReact(false);
        }
      };
      generateHTML();
    } else {
      setReactHTML('');
      setIsProcessingReact(false);
      setDependencyPaths([]);
    }
  }, [fileType, previewSourceCode, filePath, viewMode, projectRoot, selectedComponentName, aggressivePreviewMode]);

  // Обработка React Native файлов с зависимостями
  useEffect(() => {
    if (fileType === 'react-native' && previewSourceCode && filePath) {
      const generateHTML = async () => {
        setIsProcessingReactNative(true);
        try {
          console.log('RenderFile: Rendering React Native file, content length:', previewSourceCode.length);
          const framework = createFramework('react-native', filePath);
          const result = await framework.generateHTML(previewSourceCode, filePath, {
            viewMode,
            projectRoot: projectRoot || undefined,
            selectedComponentName,
            aggressivePreviewMode,
          });
          console.log('RenderFile: Generated React Native HTML length:', result.html.length);
          console.log('RenderFile: Dependency paths:', result.dependencyPaths);
          setReactNativeHTML(result.html);
          setBlockMap(result.blockMapForEditor || {});
          setBlockMapForFile(result.blockMapForFile || {});
          setDependencyPaths(result.dependencyPaths); // Сохраняем пути зависимостей
          setPreviewOpenError(null);
        } catch (error) {
          console.error('RenderFile: Error generating HTML:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          setPreviewOpenError(errorMessage);
          setReactNativeHTML(`<html><body><div class="error">Processing error: ${errorMessage}</div></body></html>`);
          setDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingReactNative(false);
        }
      };
      generateHTML();
    } else {
      setReactNativeHTML('');
      setIsProcessingReactNative(false);
      setDependencyPaths([]);
    }
  }, [fileType, previewSourceCode, filePath, viewMode, projectRoot, selectedComponentName, aggressivePreviewMode]);

  // Отслеживание изменений зависимых файлов
  useEffect(() => {
    if (!filePath || dependencyPaths.length === 0) {
      return;
    }

    console.log('RenderFile: Setting up watchers for dependencies:', dependencyPaths);

    const watchers: string[] = [];
    const unsubscribers: Array<() => void> = [];

    // Создаем обработчик изменений зависимого файла
    const handleDependencyChanged = (changedFilePath: string) => {
      console.log('RenderFile: Dependency file changed:', changedFilePath);
      console.log('RenderFile: Reloading main file:', filePath);
      // Перезагружаем основной файл при изменении зависимости
      if (loadFile) {
        loadFile(filePath);
      }
    };

    // Подписываемся на изменения всех зависимых файлов
    dependencyPaths.forEach((depPath) => {
      // Начинаем отслеживание каждого зависимого файла
      watchFile(depPath).then((result) => {
        if (result.success) {
          console.log('RenderFile: Started watching dependency:', depPath);
        } else {
          console.warn('RenderFile: Failed to watch dependency:', depPath, result.error);
        }
      });

      // Подписываемся на события изменения (глобальный обработчик, который проверит путь)
      const unsubscribe: () => void = onFileChanged((changedFilePath: string) => {
        if (changedFilePath === depPath) {
          handleDependencyChanged(changedFilePath);
        }
      }) as unknown as () => void;
      unsubscribers.push(unsubscribe);
    });

    // Cleanup: останавливаем отслеживание всех зависимых файлов
    return () => {
      console.log('RenderFile: Cleaning up dependency watchers');

      // Отписываемся от событий
      unsubscribers.forEach((unsubscribe: () => void) => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });

      // Останавливаем watchers
      dependencyPaths.forEach((depPath: string) => {
        unwatchFile(depPath);
      });
    };
  }, [dependencyPaths, filePath, loadFile]);

  // РР·РІР»РµРєР°РµРј все импорты из кода
  // extractImports теперь импортируется из модуля

  // findProjectRoot и resolvePath теперь импортируются из модуля
  const findProjectRootMemo = useCallback(findProjectRoot, []);
  const resolvePathMemo = useCallback(resolvePath, []);
  const resolvePathForFramework = useCallback((path: string, base?: string) => resolvePathSync(base ?? '', path), []);

  // Загружаем зависимый файл относительно основного файла
  const loadDependency = useCallback(
    async (
      basePath: string,
      importPath: string
    ): Promise<{ success: boolean; content?: string; error?: string; path?: string }> => {
    try {
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg'];
      const isImagePath = (p: string) => imageExts.some((ext) => String(p || '').toLowerCase().endsWith(ext));
      // Разрешаем путь к зависимому файлу (теперь асинхронно для поддержки @ путей)
      let resolvedPath = await resolvePathMemo(basePath, importPath);

      // Если файл без расширения, пробуем добавить .js, .jsx, .css и т.д.
      const extMatch = resolvedPath.match(/\.([^.]+)$/);
      if (!extMatch) {
        const tryPaths = [
          resolvedPath + '.js',
          resolvedPath + '.jsx',
          resolvedPath + '.ts',
          resolvedPath + '.tsx',
          resolvedPath + '.css',
          resolvedPath + '.png',
          resolvedPath + '.jpg',
          resolvedPath + '.jpeg',
          resolvedPath + '.gif',
          resolvedPath + '.webp',
          resolvedPath + '.avif',
          resolvedPath + '.bmp',
          resolvedPath + '.svg',
          resolvedPath + '/index.js',
          resolvedPath + '/index.jsx',
          resolvedPath + '/index.ts',
          resolvedPath + '/index.tsx'
        ];

        for (const tryPath of tryPaths) {
          try {
            if (isImagePath(tryPath)) {
              const imgResult = await readFileBase64(tryPath);
              if (imgResult.success) {
                const dataUrl = `data:${imgResult.mimeType};base64,${imgResult.base64}`;
                return { success: true, content: dataUrl, path: tryPath };
              }
            } else {
              const result = await readFile(tryPath);
              if (result.success) {
                return { success: true, content: result.content, path: tryPath };
              }
            }
          } catch (e) {
            // Пробуем следующий путь
          }
        }
      } else {
        // Прямой путь с расширением
        if (isImagePath(resolvedPath)) {
          const imgResult = await readFileBase64(resolvedPath);
          if (imgResult.success) {
            const dataUrl = `data:${imgResult.mimeType};base64,${imgResult.base64}`;
            return { success: true, content: dataUrl, path: resolvedPath };
          }
        } else {
          const result = await readFile(resolvedPath);
          if (result.success) {
            return { success: true, content: result.content, path: resolvedPath };
          }
        }
      }

      return { success: false, error: `Файл не найден: ${importPath}` };
    } catch (error) {
      console.error('RenderFile: Error loading dependency:', error);
      return { success: false, error: (error as Error).message };
    }
  },
  [resolvePathMemo]);

  // Функция для обработки HTML с загрузкой зависимостей
  const processHTMLWithDependencies = useCallback(
    async (htmlContent: string, basePath: string): Promise<{ html: string; dependencyPaths: string[] }> => {
    const dependencyPaths: string[] = [];
    let processedHTML = htmlContent;

    // Регулярные выражения для поиска внешних зависимостей
    const cssLinkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const imgSrcRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const linkHrefRegex = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;

    // Обработка CSS файлов
    const cssMatches = [...htmlContent.matchAll(cssLinkRegex)];
    for (const match of cssMatches) {
      const cssPath = match[1];
      // Пропускаем внешние URL
      if (cssPath.startsWith('http://') || cssPath.startsWith('https://') || cssPath.startsWith('//')) {
        continue;
      }

      const depResult = await loadDependency(basePath, cssPath);
      if (depResult.success) {
        dependencyPaths.push(depResult.path || '');
        // Заменяем link на style с встроенным CSS
        const styleTag = `<style>\n/* ${cssPath} */\n${depResult.content}\n</style>`;
        processedHTML = processedHTML.replace(match[0], styleTag);
        console.log('RenderFile: Inlined CSS:', cssPath);
      } else {
        console.warn('RenderFile: Failed to load CSS:', cssPath, depResult.error);
      }
    }

    // Обработка внешних JS файлов (не модулей)
    const scriptMatches = [...htmlContent.matchAll(scriptSrcRegex)];
    for (const match of scriptMatches) {
      const scriptPath = match[1];
      // Пропускаем внешние URL и CDN
      if (scriptPath.startsWith('http://') || scriptPath.startsWith('https://') || scriptPath.startsWith('//')) {
        continue;
      }

      const depResult = await loadDependency(basePath, scriptPath);
      if (depResult.success) {
        dependencyPaths.push(depResult.path || '');
        // Заменяем script src на встроенный script
        const scriptTag = `<script>\n/* ${scriptPath} */\n${depResult.content}\n</script>`;
        processedHTML = processedHTML.replace(match[0], scriptTag);
        console.log('RenderFile: Inlined JS:', scriptPath);
      } else {
        console.warn('RenderFile: Failed to load JS:', scriptPath, depResult.error);
      }
    }

    // Обработка изображений (конвертируем в base64 для локальных файлов)
    const imgMatches = [...htmlContent.matchAll(imgSrcRegex)];
    for (const match of imgMatches) {
      const imgPath = match[1];
      // Пропускаем внешние URL и data: URLs
      if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('//') || imgPath.startsWith('data:')) {
        continue;
      }

      // Разрешаем путь к изображению
      const resolvedPath = await resolvePathMemo(basePath, imgPath);

      // Читаем изображение как base64
      try {
        const result = await readFileBase64(resolvedPath);
        if (result.success) {
          dependencyPaths.push(resolvedPath);
          // Заменяем путь на data URL
          const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
          processedHTML = processedHTML.replace(match[1], dataUrl);
          console.log('RenderFile: Converted image to base64:', imgPath);
        } else {
          console.warn('RenderFile: Failed to load image:', imgPath, result.error);
        }
      } catch (e) {
        console.warn('RenderFile: Could not process image:', imgPath, e);
      }
    }

    return { html: processedHTML, dependencyPaths };
  },
  [loadDependency, resolvePathMemo]);

  // Обработка HTML файлов с зависимостями
  useEffect(() => {
    if (fileType === 'html' && fileContent && filePath) {
      const processHTML = async () => {
        setIsProcessingHTML(true);
        try {
          console.log('RenderFile: Processing HTML with dependencies');
          const framework = createFramework('html', filePath);
          const result = await framework.generateHTML(fileContent, filePath, { viewMode, projectRoot: '' });
          setProcessedHTML(result.html);
          setHtmlDependencyPaths(result.dependencyPaths);
          setBlockMap(result.blockMapForEditor || {});
          setBlockMapForFile(result.blockMapForFile || {});
          console.log('RenderFile: HTML processed, dependencies:', result.dependencyPaths);
        } catch (error) {
          console.error('RenderFile: Error processing HTML:', error);
          setProcessedHTML(fileContent); // Fallback на оригинальный HTML
          setHtmlDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingHTML(false);
        }
      };
      processHTML();
    } else {
      setProcessedHTML('');
      setHtmlDependencyPaths([]);
      setIsProcessingHTML(false);
    }
  }, [fileType, fileContent, filePath, viewMode]);

  // Отслеживание изменений зависимых файлов для HTML
  useEffect(() => {
    if (!filePath || htmlDependencyPaths.length === 0 || fileType !== 'html') {
      return;
    }

    console.log('RenderFile: Setting up watchers for HTML dependencies:', htmlDependencyPaths);

    const unsubscribers: Array<() => void> = [];

    const handleDependencyChanged = (changedFilePath: string) => {
      console.log('RenderFile: HTML dependency file changed:', changedFilePath);
      // Перезагружаем HTML файл при изменении зависимости
      // РСЃРїРѕР»СЊР·СѓРµРј текущий filePath из замыкания
      const currentPath = filePath;
      // РСЃРїРѕР»СЊР·СѓРµРј readFile из filesystem-api
      readFile(currentPath).then((result) => {
        if (result.success) {
          setFileContent(result.content || '');
        }
      });
    };

    // File System API не поддерживает watch, но вызываем для совместимости
    htmlDependencyPaths.forEach((depPath) => {
      watchFile(depPath).then((result) => {
        if (result.success) {
          console.log('RenderFile: Started watching HTML dependency:', depPath);
        }
      });

      // File System API не поддерживает события изменения файлов
    const unsubscribe = onFileChanged((changedFilePath: string) => {
        if (changedFilePath === depPath) {
          handleDependencyChanged(changedFilePath);
        }
      });
      unsubscribers.push(unsubscribe as () => void);
    });

    return () => {
      unsubscribers.forEach((unsubscribe: () => void) => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });

      htmlDependencyPaths.forEach((depPath: string) => {
        // File System API не поддерживает unwatch
        unwatchFile(depPath);
      });
    };
  }, [htmlDependencyPaths, filePath, fileType]);

  // Подготовка HTML для режима split
  useEffect(() => {
    if (viewMode !== 'split') {
      setEditorHTML('');
      return;
    }

    try {
      if (fileType === 'html') {
        const base = processedHTML || fileContent || '';
        const inst = instrumentHtml(base, filePath);
        setBlockMap(inst.map || {});
        setBlockMapForFile(inst.map || {});
        const nextHtml = injectBlockEditorScript(inst.html, 'html', 'edit', getPathBasename(filePath));
        setEditorHTML((prev) => (prev === nextHtml ? prev : nextHtml));
        return;
      }

      if (fileType === 'react' && reactHTML) {
        // Для React файлов blockMap уже установлен при генерации reactHTML через createReactHTML
        // РСЃРїРѕР»СЊР·СѓРµРј готовый blockMap, который содержит правильные позиции для обработанного кода
        const nextHtml = injectBlockEditorScript(reactHTML, 'react', 'edit', getPathBasename(filePath));
        setEditorHTML((prev) => (prev === nextHtml ? prev : nextHtml));
        return;
      }

      if (fileType === 'react-native' && reactNativeHTML) {
        // Для React Native файлов blockMap уже установлен при генерации reactNativeHTML через createReactNativeHTML
        // РСЃРїРѕР»СЊР·СѓРµРј готовый blockMap, который содержит правильные позиции для обработанного кода
        const nextHtml = injectBlockEditorScript(reactNativeHTML, 'react-native', 'edit', getPathBasename(filePath));
        setEditorHTML((prev) => (prev === nextHtml ? prev : nextHtml));
        return;
      }
    } catch (e) {
      console.warn('RenderFile: Failed to prepare editor HTML:', e);
      setEditorHTML('');
    }
  }, [
    viewMode,
    fileType,
    filePath,
    fileContent,
    processedHTML,
    reactHTML,
    reactNativeHTML,
    injectBlockEditorScript,
  ]);

  // resolvePathSync теперь импортируется из модуля

  // Вспомогательная функция для поиска модуля по различным путям
  // Синхронная версия, использует уже разрешенные пути из pathMap
  const findModulePath = (
    importPath: string,
    basePath: string,
    pathMap: Record<string, string>,
    dependencyModules: Record<string, string>
  ) => {
    // Пробуем найти по оригинальному пути (включая @ пути, которые уже разрешены)
    if (pathMap[importPath]) {
      return pathMap[importPath];
    }

    // РС‰РµРј в dependencyModules
    if (dependencyModules[importPath]) {
      return dependencyModules[importPath];
    }

    // Разрешаем относительный путь синхронно (для путей без @)
    if (!importPath.startsWith('@/') && !importPath.startsWith('http')) {
      const resolvedPath = resolvePathSync(basePath, importPath);

      console.log('RenderFile: findModulePath resolving:', {
        importPath,
        basePath,
        resolvedPath,
        pathMapHasResolved: !!pathMap[resolvedPath],
        pathMapKeys: Object.keys(pathMap).filter(k => k.includes(importPath) || k.includes(resolvedPath.split('/').pop() || '')).slice(0, 5)
      });

      // Пробуем найти по разрешенному пути
      if (pathMap[resolvedPath]) {
        return pathMap[resolvedPath];
      }

      if (dependencyModules[resolvedPath]) {
        return dependencyModules[resolvedPath];
      }

      // РР·РІР»РµРєР°РµРј имя файла из разрешенного пути для более гибкого поиска
      const fileName = resolvedPath.split('/').pop()?.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      const pathWithoutExt = resolvedPath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      const lastPart = resolvedPath.split('/').slice(-2).join('/'); // Последние 2 части пути

      // Также пробуем найти по разрешенному пути в ключах
      // Нормализуем пути для сравнения (убираем начальные/конечные слеши)
      const normalizedResolved = resolvedPath.replace(/^\/+|\/+$/g, '');
      const normalizedPathWithoutExt = pathWithoutExt.replace(/^\/+|\/+$/g, '');
      const normalizedLastPart = lastPart.replace(/^\/+|\/+$/g, '');

      // РС‰РµРј по всем значениям в pathMap (абсолютным путям)
      for (const [key, value] of Object.entries(pathMap)) {
        const normalizedKey = key.replace(/^\/+|\/+$/g, '');
        const normalizedValue = String(value).replace(/^\/+|\/+$/g, '');

        // Точное совпадение
        if (normalizedKey === normalizedResolved || normalizedKey === normalizedPathWithoutExt) {
          return value;
        }

        // Проверяем, заканчивается ли ключ или значение на разрешенный путь
        if (normalizedKey.endsWith('/' + normalizedResolved) ||
            normalizedResolved.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedLastPart) ||
            normalizedLastPart.endsWith('/' + normalizedKey)) {
          return value;
        }

        // Проверяем значение (абсолютный путь)
        if (normalizedValue.endsWith('/' + normalizedResolved) ||
            normalizedResolved.endsWith('/' + normalizedValue) ||
            normalizedValue.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedValue) ||
            normalizedValue.includes('/' + fileName + '.') ||
            normalizedValue.endsWith('/' + normalizedLastPart) ||
            normalizedLastPart.endsWith('/' + normalizedValue)) {
          return value;
        }

        // Проверяем по имени файла
        if (normalizedKey.includes('/' + fileName) || normalizedValue.includes('/' + fileName + '.')) {
          return value;
        }
      }

      // Пробуем найти в dependencyModules по разрешенному пути
      for (const [key, value] of Object.entries(dependencyModules)) {
        const normalizedKey = String(key).replace(/^\/+|\/+$/g, '');
        if (normalizedKey === normalizedResolved ||
            normalizedKey === normalizedPathWithoutExt ||
            normalizedKey.endsWith('/' + normalizedResolved) ||
            normalizedResolved.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedKey) ||
            normalizedKey.includes('/' + fileName) ||
            normalizedKey.endsWith('/' + normalizedLastPart)) {
          return value;
        }
      }

      // Последняя попытка: ищем по всем значениям в pathMap, которые заканчиваются на имя файла
      for (const [key, value] of Object.entries(pathMap)) {
        const valueStr = String(value);
        if (valueStr.includes(fileName + '.js') || valueStr.includes(fileName + '.jsx') ||
            valueStr.includes(fileName + '.ts') || valueStr.includes(fileName + '.tsx') ||
            valueStr.endsWith('/' + fileName) || valueStr.endsWith('/' + fileName + '.js') ||
            valueStr.endsWith('/' + fileName + '.jsx') || valueStr.endsWith('/' + fileName + '.ts') ||
            valueStr.endsWith('/' + fileName + '.tsx')) {
          // Проверяем, что это действительно нужный файл по последним частям пути
          const valueParts = valueStr.split('/');
          const resolvedParts = resolvedPath.split('/');
          if (valueParts.length >= 2 && resolvedParts.length >= 2) {
            const valueLast2 = valueParts.slice(-2).join('/');
            const resolvedLast2 = resolvedParts.slice(-2).join('/');
            if (valueLast2 === resolvedLast2 || valueLast2.endsWith(resolvedLast2) || resolvedLast2.endsWith(valueLast2)) {
              console.log(`[findModulePath] Found by value matching: ${importPath} -> ${value} (key: ${key})`);
              return value;
            }
          }
        }
      }

      // Еще одна попытка: ищем по всем ключам, которые содержат последние части пути
      const resolvedParts = resolvedPath.split('/');
      if (resolvedParts.length >= 2) {
        const targetLast2 = resolvedParts.slice(-2).join('/');
        const targetLast2NoExt = targetLast2.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');

        for (const [key, value] of Object.entries(pathMap)) {
          const keyStr = String(key);
          const valueStr = String(value);

          // Проверяем, содержит ли ключ или значение последние части пути
          if (keyStr.includes(targetLast2) || keyStr.includes(targetLast2NoExt) ||
              valueStr.includes(targetLast2) || valueStr.includes(targetLast2NoExt) ||
              keyStr.endsWith(targetLast2) || keyStr.endsWith(targetLast2NoExt) ||
              valueStr.endsWith(targetLast2) || valueStr.endsWith(targetLast2NoExt)) {
            // Проверяем, что это действительно нужный файл
            const valueParts = valueStr.split('/');
            if (valueParts.length >= 2) {
              const valueLast2 = valueParts.slice(-2).join('/');
              if (valueLast2 === targetLast2 || valueLast2 === targetLast2NoExt ||
                  valueLast2.endsWith(targetLast2) || targetLast2.endsWith(valueLast2)) {
                console.log(`[findModulePath] Found by last parts matching: ${importPath} -> ${value} (key: ${key})`);
                return value;
              }
            }
          }
        }
      }
    }

    // Если путь с @, пробуем найти его разрешенную версию
    if (importPath.startsWith('@/')) {
      // РС‰РµРј все ключи, которые могут соответствовать этому @ пути
      for (const [key, value] of Object.entries(pathMap)) {
        if (key.includes(importPath.substring(2)) || value.includes(importPath.substring(2))) {
          return value;
        }
      }
      // Также ищем в dependencyModules
      for (const [key, value] of Object.entries(dependencyModules)) {
        if (key.includes(importPath.substring(2)) || value.includes(importPath.substring(2))) {
          return value;
        }
      }
    }

    console.warn('RenderFile: findModulePath failed to find:', {
      importPath,
      basePath,
      resolvedPath: !importPath.startsWith('@/') && !importPath.startsWith('http') ? resolvePathSync(basePath, importPath) : 'N/A'
    });

    // Возвращаем оригинальный путь как fallback
    return importPath;
  };

  // Рекурсивная функция для загрузки всех зависимостей
  const isCoreReactImport = (importPath: string) => /^(react|react-dom|react-native)(\/|$)/.test(String(importPath || '').trim());
  const isHttpImport = (importPath: string) => /^https?:\/\//i.test(String(importPath || '').trim());
  const isProjectAliasImport = (importPath: string) => String(importPath || '').trim().startsWith('@/');
  const isBarePackageImport = (importPath: string) => {
    const normalized = String(importPath || '').trim();
    return !!normalized &&
      !normalized.startsWith('.') &&
      !normalized.startsWith('/') &&
      !isProjectAliasImport(normalized) &&
      !isHttpImport(normalized) &&
      !isCoreReactImport(normalized);
  };
  const createExternalModuleUrl = (importPath: string) => {
    const normalized = String(importPath || '').trim().replace(/^\/*/, '');
    return LOCAL_EXTERNAL_MODULE_URLS[normalized] || `https://esm.sh/${normalized}?bundle`;
  };

  const loadAllDependencies = async (
    importPath: string,
    basePath: string,
    loadedDeps: Set<string> = new Set<string>(),
    dependencyMap: Record<string, string> = {},
    dependencyPaths: string[] = [],
    pathMap: Record<string, string> = {},
    actualPathMap: Record<string, string> = {}
  ) => {
    const baseFileName = basePath.split('/').pop() || basePath.split('\\').pop() || 'unknown';

    console.log(`[LoadAllDependencies] Starting to load dependency:`, {
      importPath,
      fromFile: baseFileName,
      basePath,
      alreadyLoaded: loadedDeps.has(importPath)
    });

    // Разрешаем путь (теперь асинхронно для поддержки @ путей)
    const resolvedPath = await resolvePathMemo(basePath, importPath);

    console.log(`[LoadAllDependencies] Resolved path:`, {
      importPath,
      fromFile: baseFileName,
      resolvedPath
    });

    // РСЃРїРѕР»СЊР·СѓРµРј абсолютный путь как ключ для предотвращения дублирования
    if (loadedDeps.has(resolvedPath)) {
      // Если файл уже загружен, добавляем только маппинг относительного пути
      console.log(`[LoadAllDependencies] Dependency already loaded: ${importPath} (resolved: ${resolvedPath}) from ${baseFileName}`);
      pathMap[importPath] = resolvedPath;
      return { pathMap, actualPathMap };
    }
    loadedDeps.add(resolvedPath);

    // Загружаем зависимость по разрешенному пути
    const depResult = await loadDependency(basePath, importPath);
    if (!depResult.success) {
      console.warn(`[LoadAllDependencies] Failed to load dependency from ${baseFileName}:`, {
        importPath,
        resolvedPath,
        error: depResult.error,
        fromFile: baseFileName
      });
      return { pathMap, actualPathMap };
    }

    console.log(`[LoadAllDependencies] Successfully loaded file:`, {
      importPath,
      resolvedPath,
      actualPath: depResult.path,
      fromFile: baseFileName,
      contentLength: depResult.content?.length || 0
    });

    const depPath = String(depResult.path ?? resolvedPath);
    const depContent = String(depResult.content ?? '');

    // Сохраняем фактический путь файла для разрешенного пути
    actualPathMap[resolvedPath] = depPath;
    actualPathMap[depPath] = depPath;

    // Сохраняем по абсолютному пути как основному ключу
    dependencyMap[resolvedPath] = depContent;
    dependencyPaths.push(depPath);

    // Сохраняем маппинг: относительный путь -> абсолютный путь
    pathMap[importPath] = resolvedPath;
    // Также сохраняем маппинг разрешенного пути (если он отличается от фактического пути файла)
    if (resolvedPath !== depPath) {
      pathMap[resolvedPath] = depPath;
    }
    // Сохраняем маппинг фактического пути файла к самому себе
    pathMap[depPath] = depPath;

    // Для относительных путей также сохраняем разрешенный путь как ключ
    // Это поможет найти модуль, когда мы разрешаем относительный путь в findModulePath
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Разрешаем путь синхронно для сохранения маппинга
      const syncResolved = resolvePathSync(basePath, importPath);
      if (syncResolved !== resolvedPath && syncResolved !== depPath && !pathMap[syncResolved]) {
        pathMap[syncResolved] = depPath;
      }
      // Также сохраняем путь без расширения
      const syncResolvedNoExt = syncResolved.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      if (syncResolvedNoExt !== syncResolved && syncResolvedNoExt !== depPath && !pathMap[syncResolvedNoExt]) {
        pathMap[syncResolvedNoExt] = depPath;
      }
      // Сохраняем последние 2 части пути (например, styles/commonStyles)
      const pathParts = syncResolved.split('/');
      if (pathParts.length >= 2) {
        const last2Parts = pathParts.slice(-2).join('/');
        if (last2Parts !== syncResolved && last2Parts !== depPath && !pathMap[last2Parts]) {
          pathMap[last2Parts] = depPath;
        }
        const last2PartsNoExt = last2Parts.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
        if (last2PartsNoExt !== last2Parts && last2PartsNoExt !== depPath && !pathMap[last2PartsNoExt]) {
          pathMap[last2PartsNoExt] = depPath;
        }
      }
    }

    // Также сохраняем путь без расширения для фактического пути файла
    const depPathNoExt = depPath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
    if (depPathNoExt !== depPath && !pathMap[depPathNoExt]) {
      pathMap[depPathNoExt] = depPath;
    }

    // Сохраняем последние 2 части фактического пути файла
    const depPathParts = depPath.split('/');
    if (depPathParts.length >= 2) {
      const depLast2Parts = depPathParts.slice(-2).join('/');
      if (depLast2Parts !== depPath && !pathMap[depLast2Parts]) {
        pathMap[depLast2Parts] = depPath;
      }
      const depLast2PartsNoExt = depLast2Parts.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      if (depLast2PartsNoExt !== depLast2Parts && depLast2PartsNoExt !== depPath && !pathMap[depLast2PartsNoExt]) {
        pathMap[depLast2PartsNoExt] = depPath;
      }
    }

    console.log('RenderFile: Saved path mappings for:', {
      importPath,
      resolvedPath,
      actualPath: depPath,
      savedKeys: Object.keys(pathMap).filter(k => pathMap[k] === depPath).slice(0, 10)
    });

    // РР·РІР»РµРєР°РµРј импорты из загруженной зависимости
    const depFileName = depPath.split('/').pop() || depPath.split('\\').pop() || 'unknown';
    const depImports = extractImports(depContent, depFileName);

    console.log(`[LoadAllDependencies] Found ${depImports.length} imports in ${depFileName}:`, {
      file: depPath,
      fileName: depFileName,
      imports: depImports.map(i => ({ path: i.path, line: i.line }))
    });

    // Рекурсивно загружаем зависимости зависимостей
    const depBasePath = depPath; // РСЃРїРѕР»СЊР·СѓРµРј фактический путь файла как базовый
    for (const depImp of depImports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      // Теперь обрабатываем локальные импорты, включая @ пути
      if (isCoreReactImport(depImp.path) ||
          isHttpImport(depImp.path) ||
          isBarePackageImport(depImp.path)) {
        console.log(`[LoadAllDependencies] Skipping external library in ${depFileName}: ${depImp.path}`);
        continue;
      }

      console.log(`[LoadAllDependencies] Recursively loading dependency from ${depFileName}:`, {
        importPath: depImp.path,
        fromFile: depFileName,
        importLine: depImp.line,
        basePath: depBasePath
      });

      // Рекурсивно загружаем с правильным базовым путем (фактический путь файла)
      const result = await loadAllDependencies(depImp.path, depBasePath, loadedDeps, dependencyMap, dependencyPaths, pathMap, actualPathMap);
      if (result) {
        Object.assign(pathMap, result.pathMap);
        Object.assign(actualPathMap, result.actualPathMap);
        console.log(`[LoadAllDependencies] Successfully loaded recursive dependency: ${depImp.path} from ${depFileName}`);
      } else {
        console.warn(`[LoadAllDependencies] Failed to load recursive dependency: ${depImp.path} from ${depFileName}`);
      }
    }

    return { pathMap, actualPathMap };
  };

  // Обрабатываем код React файла с поддержкой зависимостей
  const processReactCode = async (code, basePath) => {
    // РР·РІР»РµРєР°РµРј импорты
    const fileName = basePath.split('/').pop() || basePath.split('\\').pop() || 'unknown';
    const imports = extractImports(code, fileName);
    console.log(`[ProcessReactCode] Processing file: ${fileName}`, {
      file: basePath,
      fileName,
      importsCount: imports.length,
      imports: imports.map(i => ({ path: i.path, line: i.line }))
    });

    const dependencies: Record<string, string> = {};
    const dependencyModules: Record<string, string> = {};
    const dependencyPaths: string[] = []; // Массив путей к зависимым файлам
    const loadedDeps = new Set<string>(); // Для предотвращения циклических зависимостей
    const pathMap: Record<string, string> = {}; // Маппинг: относительный путь -> абсолютный путь
    const actualPathMap: Record<string, string> = {}; // Маппинг: разрешенный путь -> фактический путь файла
    const directCssBlocks: string[] = [];
    const directCssSeenPaths = new Set<string>();
    const externalPackageImports = new Set<string>();

    // Загружаем все зависимости рекурсивно
    for (const imp of imports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      // Теперь обрабатываем локальные импорты, включая @ пути
      if (isCoreReactImport(imp.path) || isHttpImport(imp.path)) {
        console.log(`[ProcessReactCode] Skipping external library: ${imp.path} from ${fileName}`);
        continue;
      }

      if (isBarePackageImport(imp.path)) {
        externalPackageImports.add(imp.path);
        console.log(`[ProcessReactCode] Registering bare package import for external loading: ${imp.path} from ${fileName}`);
        continue;
      }

      console.log(`[ProcessReactCode] Loading dependency from ${fileName}:`, {
        sourceFile: fileName,
        importPath: imp.path,
        importLine: imp.line,
        basePath
      });

      const result = await loadAllDependencies(imp.path, basePath, loadedDeps, dependencies, dependencyPaths, pathMap, actualPathMap);
      // Объединяем результаты
      if (result) {
        Object.assign(pathMap, result.pathMap);
        Object.assign(actualPathMap, result.actualPathMap);
        console.log(`[ProcessReactCode] Successfully loaded dependency: ${imp.path} from ${fileName}`);
      } else {
        console.warn(`[ProcessReactCode] Failed to load dependency: ${imp.path} from ${fileName}`);
      }

      if (/\.css($|\?)/i.test(String(imp.path || ''))) {
        const cssDep = await loadDependency(basePath, imp.path);
        if (cssDep?.success && typeof cssDep.content === 'string') {
          const cssPath = String(cssDep.path || imp.path);
          if (!directCssSeenPaths.has(cssPath)) {
            directCssSeenPaths.add(cssPath);
            directCssBlocks.push(`\n/* ${cssPath} */\n${cssDep.content}\n`);
          }
        }
      }
    }

    // РСЃРїРѕР»СЊР·СѓРµРј pathMap для заполнения dependencyModules
    // Основной ключ - абсолютный путь, но также сохраняем маппинг относительных путей
    for (const [relativePath, absolutePath] of Object.entries(pathMap)) {
      // Сохраняем маппинг относительного пути к абсолютному
      dependencyModules[relativePath] = absolutePath;
      // Также сохраняем абсолютный путь как ключ (если он еще не сохранен)
      if (!dependencyModules[absolutePath]) {
        dependencyModules[absolutePath] = absolutePath;
      }
    }

    // Обрабатываем код - удаляем импорты React, но сохраняем локальные
    // Сначала сохраняем информацию о default export перед удалением
    let defaultExportInfo: { name: string; type: string } | null = null;
    const defaultExportMatch = code.match(/export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (defaultExportMatch) {
      defaultExportInfo = {
        name: defaultExportMatch[1],
        type: 'default-export'
      };
    }

    let processedCode = code
      // Удаляем import React from 'react'
      .replace(/import\s+React\s+from\s+['"]react['"];?\s*/gi, '')
      // Удаляем import { ... } from 'react'
      .replace(/import\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '')
      // Удаляем export default, оставляем только определение
      .replace(/export\s+default\s+/g, '')
      .trim();

    const wrappedMainModule = wrapImportedComponentUsages(processedCode);
    processedCode = wrappedMainModule.code;
    if (wrappedMainModule.wrappedCount > 0) {
      processedCode = `${IMPORTED_COMPONENT_BOUNDARY_HELPER}\n${processedCode}`;
    }

    // Создаем код для модулей зависимостей
    let modulesCode = '';
    let collectedCss = '';
    let importReplacements = {};

    // Явно добавляем CSS, импортированный напрямую в текущем файле (side-effect imports),
    // чтобы стили гарантированно попадали в preview.
    if (directCssBlocks.length > 0) {
      collectedCss += directCssBlocks.join('');
    }

    const isCssModulePath = (modulePath: string) => /\.css($|\?)/i.test(modulePath || '');
    const isImageModulePath = (modulePath: string) =>
      /\.(png|jpe?g|gif|webp|avif|bmp|svg)($|\?)/i.test(modulePath || '');
    const isLikelyImageContent = (value: string) => {
      const sample = String(value || '').slice(0, 256);
      if (!sample) return false;
      if (sample.startsWith('data:image/')) return true;
      return (
        sample.includes('PNG') ||
        sample.includes('IHDR') ||
        sample.includes('JFIF') ||
        sample.includes('WEBP')
      );
    };
    const createCssImportReplacement = (importSpec: string) => {
      if (!importSpec) {
        return '';
      }

      const trimmed = importSpec.trim();
      if (!trimmed) {
        return '';
      }

      if (trimmed.startsWith('{')) {
        const names = trimmed
          .replace(/[{}]/g, '')
          .split(',')
          .map((name: string) => name.trim())
          .filter(Boolean);

        return names
          .map((name: string) => {
            const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
            let alias = (parts[1] || parts[0] || '').trim().replace(/[^a-zA-Z0-9_$]/g, '');
            if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
              alias = 'cssImport';
            }
            return `const ${alias} = {};`;
          })
          .join('\n');
      }

      if (trimmed.startsWith('* as ')) {
        const alias = trimmed.replace('* as ', '').trim().replace(/[^a-zA-Z0-9_$]/g, '');
        return alias ? `const ${alias} = {};` : '';
      }

      const alias = trimmed.replace(/[^a-zA-Z0-9_$]/g, '');
      return alias ? `const ${alias} = {};` : '';
    };

    // Собираем уникальные абсолютные пути из pathMap
    const uniqueAbsolutePaths = new Set(Object.values(pathMap));
    const processedDeps = new Set(); // Для отслеживания уже обработанных абсолютных путей

    // Собираем информацию о зависимостях каждого модуля для сортировки
    const moduleDependencies = new Map(); // absolutePath -> Set of absolute paths of dependencies

    // Сначала собираем зависимости для каждого модуля
    for (const absolutePath of uniqueAbsolutePaths) {
      if (processedDeps.has(absolutePath)) {
        continue;
      }

      const content = dependencies[absolutePath] || (() => {
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === absolutePath) {
            return dependencies[relPath];
          }
        }
        return null;
      })();

      if (!content) continue;

      // РР·РІР»РµРєР°РµРј импорты из модуля
      const depImports = extractImports(content, absolutePath);
      const depSet = new Set();

      for (const imp of depImports) {
        // Пропускаем внешние библиотеки
        if (isBarePackageImport(imp.path)) {
          externalPackageImports.add(imp.path);
          continue;
        }
        if (!imp.path.startsWith('.') && !imp.path.startsWith('/') && !imp.path.startsWith('@')) {
          continue;
        }

        // Находим абсолютный путь зависимости
        const depResolvedPath = pathMap[imp.path] || dependencyModules[imp.path];
        if (
          depResolvedPath &&
          uniqueAbsolutePaths.has(depResolvedPath) &&
          !isCssModulePath(String(depResolvedPath))
        ) {
          depSet.add(depResolvedPath);
        }
      }

      moduleDependencies.set(absolutePath, depSet);
    }

    // Топологическая сортировка модулей по зависимостям
    const sortedModules: string[] = [];
    const visited: Set<string> = new Set();
    const visiting: Set<string> = new Set();

    const visit = (modulePath) => {
      if (visiting.has(modulePath)) {
        // Циклическая зависимость - пропускаем
        return;
      }
      if (visited.has(modulePath)) {
        return;
      }

      visiting.add(modulePath);
      const deps = moduleDependencies.get(modulePath) || new Set();
      for (const dep of deps) {
        if (uniqueAbsolutePaths.has(dep)) {
          visit(dep);
        }
      }
      visiting.delete(modulePath);
      visited.add(modulePath);
      sortedModules.push(modulePath);
    };

    // Запускаем топологическую сортировку
    for (const absolutePath of uniqueAbsolutePaths) {
      if (!visited.has(absolutePath)) {
        visit(absolutePath);
      }
    }

    console.log('RenderFile: Sorted modules by dependencies:', sortedModules.map(p => p.split('/').pop()));

    // Обрабатываем каждую зависимость в отсортированном порядке
    processedDeps.clear(); // Сбрасываем для повторного использования
    for (const absolutePath of sortedModules) {
      if (processedDeps.has(absolutePath)) {
        continue;
      }
      processedDeps.add(absolutePath);

      // Получаем контент по абсолютному пути
      let content = dependencies[absolutePath];
      // Если не найдено по абсолютному пути, ищем по относительному из pathMap
      if (!content) {
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === absolutePath) {
            content = dependencies[relPath];
            if (content) break;
          }
        }
      }

      if (!content) {
        continue;
      }

      // РСЃРїРѕР»СЊР·СѓРµРј абсолютный путь как основной ключ для обработки
      if (isCssModulePath(absolutePath)) {
        collectedCss += `\n/* ${absolutePath} */\n${content}\n`;
        continue;
      }

      const importPath = absolutePath;
      // Обрабатываем зависимость
      // Сначала извлекаем все экспорты
      let moduleExports: Record<string, unknown> = {};
      let hasDefaultExport = false;
      let defaultExportName: string | null = null;
      const namedExports: string[] = [];

      // Получаем фактический путь файла для текущей зависимости (для разрешения относительных путей)
      // РСЃРїРѕР»СЊР·СѓРµРј actualPathMap для получения фактического пути файла
      const currentDepResolvedPath = dependencyModules[importPath] || importPath;
      const currentDepActualPath = actualPathMap[currentDepResolvedPath] || currentDepResolvedPath;
      const currentDepBasePath = currentDepActualPath.substring(0, currentDepActualPath.lastIndexOf('/'));

      const moduleAbsolutePath = dependencyModules[importPath] || importPath;
      const allRelativePaths = Object.entries(pathMap)
        .filter(([relPath, absPath]) => absPath === moduleAbsolutePath)
        .map(([relPath]) => relPath);
      const allPossiblePaths = new Set(allRelativePaths);
      allPossiblePaths.add(moduleAbsolutePath);

      const pathWithoutExt = moduleAbsolutePath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      allPossiblePaths.add(pathWithoutExt);

      const pathParts = moduleAbsolutePath.split('/');
      if (pathParts.length >= 2) {
        const last2Parts = pathParts.slice(-2).join('/');
        allPossiblePaths.add(last2Parts);
        const last2PartsNoExt = last2Parts.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
        allPossiblePaths.add(last2PartsNoExt);
      }

      const fileName = pathParts[pathParts.length - 1];
      if (fileName) {
        allPossiblePaths.add(fileName);
        const fileNameNoExt = fileName.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
        allPossiblePaths.add(fileNameNoExt);
      }

      for (const relPath of allRelativePaths) {
        allPossiblePaths.add(relPath);
        const relPathNoExt = relPath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
        allPossiblePaths.add(relPathNoExt);
        if (relPath.startsWith('./')) {
          allPossiblePaths.add(relPath.substring(2));
        }
        if (relPath.startsWith('../')) {
          const relParts = relPath.split('/');
          if (relParts.length >= 2) {
            const relLast2 = relParts.slice(-2).join('/');
            allPossiblePaths.add(relLast2);
            const relLast2NoExt = relLast2.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
            allPossiblePaths.add(relLast2NoExt);
          }
        }
      }

      if (
        isImageModulePath(moduleAbsolutePath) ||
        isImageModulePath(currentDepActualPath) ||
        isLikelyImageContent(String(content || ''))
      ) {
        let dataUrl = String(content || '');
        if (!dataUrl.startsWith('data:')) {
          const imgResult = await readFileBase64(currentDepActualPath);
          if (imgResult.success) {
            dataUrl = `data:${imgResult.mimeType};base64,${imgResult.base64}`;
          } else if (!isLikelyImageContent(dataUrl)) {
            dataUrl = '';
          }
        }
        const imageExport = JSON.stringify(dataUrl);
        modulesCode += `
        // Image module: ${importPath} (absolute: ${moduleAbsolutePath})
        (function() {
          window.__modules__ = window.__modules__ || {};
          const moduleExports = { __esModule: true, default: ${imageExport} };
          window.__modules__['${moduleAbsolutePath}'] = moduleExports;
          window.__modules__['${importPath}'] = moduleExports;
          const allPaths = ${JSON.stringify(allRelativePaths)};
          allPaths.forEach(path => {
            window.__modules__[path] = moduleExports;
          });
          const allPossiblePaths = ${JSON.stringify(Array.from(allPossiblePaths))};
          allPossiblePaths.forEach(path => {
            if (path && path.trim()) {
              window.__modules__[path] = moduleExports;
            }
          });
        })();
      `;
        continue;
      }

      // Отладочная информация
      console.log('RenderFile: Processing dependency:', {
        importPath,
        currentDepResolvedPath,
        currentDepActualPath,
        currentDepBasePath,
        pathMapKeys: Object.keys(pathMap).slice(0, 10) // Первые 10 ключей для отладки
      });

      // Обрабатываем экспорты
      const instrumentedDependency = instrumentJsx(String(content ?? ''), currentDepActualPath);
      let processedDep: string = String(instrumentedDependency.code ?? '');

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:605',message:'Processing dependency before removing imports',data:{importPath,contentLength:processedDep.length,hasImports:processedDep.includes('import'),hasExports:processedDep.includes('export')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // СНАЧАЛА обрабатываем экспорты, ПОТОМ удаляем импорты
      // Named exports: export const/let/var (обрабатываем ДО удаления импортов)
      const namedConstExports: string[] = [];
      processedDep = processedDep.replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, (match: string, keyword: string, name: string) => {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:612',message:'Found named export const',data:{importPath,name,keyword},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        namedConstExports.push(name);
        if (!namedExports.includes(name)) {
          namedExports.push(name);
        }
        return `${keyword} ${name} =`;
      });

      // Named exports: export function (обрабатываем ДО удаления импортов)
      const namedFunctionExports: string[] = [];
      processedDep = processedDep.replace(/export\s+function\s+(\w+)/g, (match: string, name: string) => {
        namedFunctionExports.push(name);
        if (!namedExports.includes(name)) {
          namedExports.push(name);
        }
        return `function ${name}`;
      });

      // Обрабатываем импорты из зависимого файла перед встраиванием
      // РРјРїРѕСЂС‚С‹ React и React Native будут доступны глобально
      // Для локальных импортов заменяем их на код доступа к модулям
      processedDep = processedDep
        // Удаляем import React from 'react'
        .replace(/import\s+React\s+from\s+['"]react['"];?\s*/gi, '')
        // Удаляем import { ... } from 'react'
        .replace(/import\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '')
        // Удаляем import { ... } from 'react-native'
        .replace(/import\s*\{[^}]*\}\s*from\s+['"]react-native['"];?\s*/gi, '')
        .replace(/import\s+['"][^'"]+['"];?\s*/g, '')
        // Заменяем все остальные импорты на код доступа к модулям
        .replace(/import\s+(.*?)\s+from\s+['"](.*?)['"];?\s*/g, (match: string, importSpec: string, depImportPath: string) => {

          const currentDepFileName = currentDepActualPath.split('/').pop() || currentDepActualPath.split('\\').pop() || 'unknown';

          // Пропускаем только внешние библиотеки (npm пакеты)
          // Теперь обрабатываем локальные импорты, включая @ пути
          if (isCoreReactImport(depImportPath) ||
              isHttpImport(depImportPath)) {
            console.log(`[ProcessDependency] Skipping external import in ${currentDepFileName}: ${depImportPath}`);
            return ''; // Удаляем импорт
          }

          // Для локальных импортов заменяем на код доступа к модулям
          // РСЃРїРѕР»СЊР·СѓРµРј фактический путь файла зависимости для разрешения относительных путей
          if (isCssModulePath(depImportPath)) {
            return createCssImportReplacement(importSpec);
          }

          const finalDepPath = findModulePath(depImportPath, currentDepActualPath, pathMap, dependencyModules);

          // Разрешаем путь синхронно для генерации всех возможных вариантов ключей
          const resolvedPathSync = resolvePathSync(currentDepActualPath, depImportPath);
          const resolvedPathNoExt = resolvedPathSync.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
          const resolvedParts = resolvedPathSync.split('/');
          const resolvedLast2 = resolvedParts.length >= 2 ? resolvedParts.slice(-2).join('/') : '';
          const resolvedLast2NoExt = resolvedLast2.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
          const resolvedFileName = resolvedParts[resolvedParts.length - 1] || '';
          const resolvedFileNameNoExt = resolvedFileName.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');

          // Создаем список всех возможных ключей для поиска модуля
          const possibleKeys = [
            finalDepPath,
            depImportPath,
            resolvedPathSync,
            resolvedPathNoExt,
            resolvedLast2,
            resolvedLast2NoExt,
            resolvedFileName,
            resolvedFileNameNoExt
          ].filter(Boolean);

          // Сериализуем для использования в шаблонной строке
          const possibleKeysJson = JSON.stringify(possibleKeys);

          console.log(`[ProcessDependency] Processing import in ${currentDepFileName}:`, {
            file: currentDepFileName,
            filePath: currentDepActualPath,
            importPath: depImportPath,
            importSpec,
            resolvedPath: finalDepPath,
            resolvedPathSync,
            possibleKeys,
            foundInPathMap: !!(pathMap as Record<string, string>)[depImportPath] || !!(pathMap as Record<string, string>)[String(finalDepPath)],
            pathMapKeys: Object.keys(pathMap).filter(k =>
              k.includes(depImportPath.replace(/\.\.?\//g, '')) ||
              k.includes('commonStyles') ||
              k.includes(finalDepPath.split('/').pop() || '')
            ).slice(0, 10)
          });

          if (importSpec.startsWith('{')) {
            // Named imports: import { a, b as c } from ...
            const names = importSpec.replace(/[{}]/g, '').split(',').map((n: string) => n.trim()).filter((n: string) => n);
            return names.map(name => {
              const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
              let orig = parts[0].trim();
              let alias = parts[1].trim();
              // Валидация имени переменной: убираем недопустимые символы
              alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
                // Если имя невалидно, используем безопасное имя
                alias = 'imported_' + Math.random().toString(36).substr(2, 9);
              }
              // Также валидируем orig, так как он используется в module.${orig}
              orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!orig) {
                orig = 'default';
              }
              return `const ${alias} = (() => {
                // Ждем, пока модули загрузятся (на случай, если модуль еще загружается)
                const waitForModule = (maxAttempts = 50) => {
                  const possibleKeys = ${possibleKeysJson};
                  let module = null;
                  
                  for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    // Пробуем найти модуль по всем возможным ключам
                    // РРіРЅРѕСЂРёСЂСѓРµРј null значения (предварительно зарегистрированные слоты)
                    for (const key of possibleKeys) {
                      if (window.__modules__ && window.__modules__[key] !== null && window.__modules__[key] !== undefined) {
                        module = window.__modules__[key];
                        break;
                      }
                    }
                    
                    // Если не нашли по точным ключам, ищем по частичному совпадению
                    if (!module && window.__modules__) {
                      const fileName = '${resolvedFileNameNoExt}';
                      const last2Parts = '${resolvedLast2NoExt}';
                      const importPathClean = '${depImportPath.replace(/\.\.?\//g, '')}';
                      for (const key of Object.keys(window.__modules__)) {
                        const value = window.__modules__[key];
                        // РРіРЅРѕСЂРёСЂСѓРµРј null значения
                        if (value !== null && value !== undefined && 
                            (key.includes(fileName) || key.includes(last2Parts) || 
                            key.endsWith('${depImportPath}') || key.includes(importPathClean))) {
                          module = value;
                          break;
                        }
                      }
                    }
                    
                    if (module) break;
                    
                    // Если модуль не найден, ждем немного и пробуем снова
                    if (attempt < maxAttempts - 1) {
                      // Синхронное ожидание (не идеально, но работает)
                      const start = Date.now();
                      while (Date.now() - start < 10) {
                        // Ждем 10ms
                      }
                    }
                  }
                  
                  return module;
                };
                
                const module = waitForModule();
                
                if (!module || module === null) {
                  console.error('Module not found for ${depImportPath}. Tried keys:', ${possibleKeysJson});
                  console.error('Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Module values:', Object.entries(window.__modules__ || {}).map(([k, v]) => [k, v === null ? 'null' : typeof v]).slice(0, 10));
                  throw new Error('Failed to import ${orig} from ${depImportPath}. Module not found.');
                }
                
                const value = module?.${orig} || module?.default?.${orig};
                if (value === undefined) {
                  console.error('Export ${orig} not found in module. Module keys:', Object.keys(module || {}));
                  throw new Error('Failed to import ${orig} from ${depImportPath}. Export not found.');
                }
                return value;
              })();`;
            }).join('\n');
          } else {
            // Default import: import name from ...
            return `const ${importSpec.trim()} = (() => {
              // Ждем, пока модули загрузятся (на случай, если модуль еще загружается)
              const waitForModule = (maxAttempts = 50) => {
                const possibleKeys = ${possibleKeysJson};
                let module = null;
                
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                  // Пробуем найти модуль по всем возможным ключам
                  // РРіРЅРѕСЂРёСЂСѓРµРј null значения (предварительно зарегистрированные слоты)
                  for (const key of possibleKeys) {
                    if (window.__modules__ && window.__modules__[key] !== null && window.__modules__[key] !== undefined) {
                      module = window.__modules__[key];
                      break;
                    }
                  }
                  
                  // Если не нашли по точным ключам, ищем по частичному совпадению
                  if (!module && window.__modules__) {
                    const fileName = '${resolvedFileNameNoExt}';
                    const last2Parts = '${resolvedLast2NoExt}';
                    const importPathClean = '${depImportPath.replace(/\.\.?\//g, '')}';
                    for (const key of Object.keys(window.__modules__)) {
                      const value = window.__modules__[key];
                      // РРіРЅРѕСЂРёСЂСѓРµРј null значения
                      if (value !== null && value !== undefined && 
                          (key.includes(fileName) || key.includes(last2Parts) || 
                          key.endsWith('${depImportPath}') || key.includes(importPathClean))) {
                        module = value;
                        break;
                      }
                    }
                  }
                  
                  if (module) break;
                  
                  // Если модуль не найден, ждем немного и пробуем снова
                  if (attempt < maxAttempts - 1) {
                    // Синхронное ожидание (не идеально, но работает)
                    const start = Date.now();
                    while (Date.now() - start < 10) {
                      // Ждем 10ms
                    }
                  }
                }
                
                return module;
              };
              
              const module = waitForModule();
              
              if (!module || module === null) {
                console.error('Module not found for ${depImportPath}. Tried keys:', ${possibleKeysJson});
                console.error('Available modules:', Object.keys(window.__modules__ || {}));
                console.error('Module values:', Object.entries(window.__modules__ || {}).map(([k, v]) => [k, v === null ? 'null' : typeof v]).slice(0, 10));
                throw new Error('Failed to import default from ${depImportPath}. Module not found.');
              }
              
              const value = module?.default || module?.styles || module;
              if (value === undefined) {
                console.error('Default export not found in module. Module keys:', Object.keys(module || {}));
                throw new Error('Failed to import default from ${depImportPath}. Default export not found.');
              }
              return value;
            })();`;
          }
        })
        .trim();

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:650',message:'Dependency processed after removing imports',data:{importPath,processedLength:processedDep.length,hasImports:processedDep.includes('import'),hasExports:processedDep.includes('export'),namedExportsCount:namedExports.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // Default export: export default ...
      const defaultExportMatch = processedDep.match(/export\s+default\s+(.+?)(;|$)/s);
      if (defaultExportMatch) {
        hasDefaultExport = true;
        const exportValue = defaultExportMatch[1].trim();
        // Если это переменная или выражение
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportValue)) {
          defaultExportName = exportValue;
          // Удаляем строку export default полностью
          processedDep = processedDep.replace(/export\s+default\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*;?\s*/g, '');
        } else {
          defaultExportName = '__defaultExport';
          processedDep = processedDep.replace(/export\s+default\s+/g, 'const __defaultExport = ');
        }
      }

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:695',message:'After processing exports',data:{importPath,hasDefaultExport,defaultExportName,hasExports:processedDep.includes('export')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion


      // Named exports: export { ... }
      const namedExportsMatch = processedDep.match(/export\s+\{([^}]+)\}/);
      if (namedExportsMatch) {
        const exports = namedExportsMatch[1].split(',').map(e => e.trim()).filter(e => e);
        exports.forEach(exp => {
          const parts = exp.includes(' as ') ? exp.split(' as ') : [exp, exp];
          const orig = parts[0].trim();
          const alias = parts[1].trim();
          moduleExports[alias] = orig;
          if (!namedExports.includes(orig)) {
            namedExports.push(orig);
          }
        });
        processedDep = processedDep.replace(/export\s+\{([^}]+)\}/g, '');
      }

      // Если нет default export, но есть named export 'styles', используем его как default
      if (!hasDefaultExport && namedExports.includes('styles')) {
        defaultExportName = 'styles';
        hasDefaultExport = true;
      }

      // Удаляем все оставшиеся экспорты (на случай, если что-то пропустили)
      processedDep = processedDep.replace(/export\s+default\s+.*?;?\s*/g, '');
      processedDep = processedDep.replace(/export\s+\{[^}]+\}\s*;?\s*/g, '');

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:740',message:'Before creating module code',data:{importPath,hasExports:processedDep.includes('export'),processedLength:processedDep.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion


      console.log(`[ProcessDependency] All possible paths for module ${moduleAbsolutePath}:`, Array.from(allPossiblePaths));

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:752',message:'Creating module code',data:{importPath,absolutePath:moduleAbsolutePath,hasDefaultExport,defaultExportName,namedExportsCount:namedExports.length,namedExports:namedExports.slice(0,5),allRelativePathsCount:allRelativePaths.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // Создаем модуль
      modulesCode += `
        // Модуль: ${importPath} (absolute: ${moduleAbsolutePath})
        (function() {
          // Убеждаемся, что window.__modules__ инициализирован
          window.__modules__ = window.__modules__ || {};
          
          // Убеждаемся, что React Native доступен (для StyleSheet и т.д.)
          const { StyleSheet } = (typeof window !== 'undefined' && window.ReactNative) || {};
          
          // ВАЖНО: Выполняем код модуля ПОСЛЕ того, как все модули предварительно зарегистрированы
          // Это гарантирует, что когда код модуля обращается к другим модулям через window.__modules__,
          // эти модули уже существуют (даже если они еще не выполнились)
          ${processedDep}
          
          // Теперь все переменные должны быть доступны в этой области видимости
          const moduleExports = {};
          
          // Добавляем named exports - используем прямую проверку в текущей области видимости
          ${namedExports.length > 0 ? namedExports
            .map(
              (name) => `if (typeof ${name} !== "undefined") {
              moduleExports.${name} = ${name};
              // #region agent log
              ,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-export',message:'Export added successfully',data:{name:'${name}',importPath:'${importPath}',exportKeys:Object.keys(moduleExports)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              console.log('Added named export ${name} to module ${importPath}:', ${name});
            } else {
              // #region agent log
              ,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-export',message:'Export variable undefined',data:{name:'${name}',importPath:'${importPath}'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              console.error('Named export ${name} is undefined in module ${importPath}!');
              console.error('Trying to find variable in different ways...');
              // Пробуем найти переменную через различные способы
              try {
                // Пробуем через window (если была объявлена глобально)
                if (typeof window !== 'undefined' && typeof window.${name} !== 'undefined') {
                  moduleExports.${name} = window.${name};
                  console.log('Found ${name} on window object');
                } else {
                  // Пробуем через this (в строгом режиме это не сработает, но попробуем)
                  try {
                    if (typeof this !== 'undefined' && typeof this.${name} !== 'undefined') {
                      moduleExports.${name} = this.${name};
                      console.log('Found ${name} on this object');
                }
              } catch(e) {}
                  // Если не нашли, выводим отладочную информацию
                  if (!moduleExports.${name}) {
                    console.error('Could not find ${name} in any scope');
                    console.error('Available variables:', Object.keys(typeof window !== 'undefined' ? window : {}));
                  }
                }
              } catch(e) {
                console.error('Error while trying to find ${name}:', e);
              }
            }`
          ).join('\n          ') : '// No named exports'}
          
          // Добавляем default export
          ${hasDefaultExport && defaultExportName ? 
            `moduleExports.default = typeof ${defaultExportName} !== "undefined" ? ${defaultExportName} : (moduleExports.styles || moduleExports);` : 
            'moduleExports.default = moduleExports.styles || moduleExports;'
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-register',message:'Registering module',data:{importPath:'${importPath}',absolutePath:'${moduleAbsolutePath}',exportKeys:Object.keys(moduleExports),namedExports:${JSON.stringify(namedExports)}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          console.log('Module loaded:', '${importPath}', 'absolute:', '${moduleAbsolutePath}', moduleExports);
          console.log('Module named exports list:', ${JSON.stringify(namedExports)});
          console.log('Module exports keys:', Object.keys(moduleExports));
          
          // Регистрируем модуль по абсолютному пути (нормализованному)
          window.__modules__['${moduleAbsolutePath}'] = moduleExports;
          // Также регистрируем по всем относительным путям из pathMap для обратной совместимости
          window.__modules__['${importPath}'] = moduleExports;
          
          // Регистрируем по всем путям, которые указывают на этот абсолютный путь
          const allPaths = ${JSON.stringify(allRelativePaths)};
          allPaths.forEach(path => {
            window.__modules__[path] = moduleExports;
          });
          
          // Регистрируем по всем возможным вариантам путей для поддержки импортов из разных контекстов
          const allPossiblePaths = ${JSON.stringify(Array.from(allPossiblePaths))};
          allPossiblePaths.forEach(path => {
            if (path && path.trim()) {
              // Экранируем путь для безопасного использования в качестве ключа
              const escapedPath = path.replace(/'/g, "\\'");
              window.__modules__[path] = moduleExports;
            }
          });
          
          // Дополнительно регистрируем по имени файла без расширения для лучшей совместимости
          const fileName = '${moduleAbsolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
          if (fileName) {
            window.__modules__[fileName] = moduleExports;
          }
          
          // Также регистрируем по всем вариантам путей, которые могут быть использованы из разных контекстов
          // (например, '../components/Header' из HomeScreen и './components/Header' из App)
          const resolvedVariants = [
            '${moduleAbsolutePath}',
            '${moduleAbsolutePath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '')}',
            '${moduleAbsolutePath.split('/').slice(-2).join('/')}',
            '${moduleAbsolutePath.split('/').slice(-2).join('/').replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '')}',
            '${moduleAbsolutePath.split('/').pop()}',
            '${moduleAbsolutePath.split('/').pop()?.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '')}'
          ];
          resolvedVariants.forEach(variant => {
            if (variant && variant.trim()) {
              window.__modules__[variant] = moduleExports;
            }
          });
          
          console.log('Registered module under keys:', allPossiblePaths);
          // #region agent log
          {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-register',message:'Module registered',data:{importPath:'${importPath}',absolutePath:'${moduleAbsolutePath}',allModules:Object.keys(window.__modules__||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
        })();
      `;

      // Заменяем импорт на доступ к модулю
      // РС‰РµРј импорт по всем возможным путям (относительному и абсолютному)
      let importStatement = imports.find(imp => imp.path === importPath);
      if (!importStatement) {
        // Если не найдено по абсолютному пути, ищем по относительным путям из pathMap
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === importPath) {
            importStatement = imports.find(imp => imp.path === relPath);
            if (importStatement) break;
          }
        }
      }
      if (importStatement) {
        // Парсим, что именно импортируется
        const match = importStatement.fullStatement.match(/import\s+(.*?)\s+from/);
        if (match) {
          const importSpec = match[1].trim();
          if (isCssModulePath(importPath)) {
            importReplacements[importStatement.fullStatement] = createCssImportReplacement(importSpec);
            continue;
          }
          // Проверяем import * as name from ...
          const starAsMatch = importStatement.fullStatement.match(/import\s+\*\s+as\s+(\w+)/);
          if (starAsMatch) {
            const alias = starAsMatch[1];
            importReplacements[importStatement.fullStatement] = `const ${alias} = window.__modules__['${importPath}'];`;
          } else if (importSpec.startsWith('{')) {
            // Named imports: import { a, b as c } from ...
            const names = importSpec.replace(/[{}]/g, '').split(',').map((n: string) => n.trim()).filter((n: string) => n);
            // Получаем абсолютный путь для этого модуля
            const absolutePath = dependencyModules[importPath] || importPath;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:795',message:'Processing named imports',data:{importPath,absolutePath,importSpec,names,namedExports:namedExports.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            const replacements = names.map(name => {
              const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
              let orig = parts[0].trim();
              let alias = parts[1].trim();
              // Валидация имени переменной: убираем недопустимые символы
              alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
                // Если имя невалидно, используем безопасное имя
                alias = 'imported_' + Math.random().toString(36).substr(2, 9);
              }
              // Также валидируем orig, так как он используется в module.${orig}
              orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!orig) {
                orig = 'default';
              }
              // Пробуем сначала абсолютный путь, потом относительный
              // Добавляем проверку и логирование для отладки
              return `const ${alias} = (() => {
                // #region agent log
                {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Resolving import',data:{orig:'${orig}',alias:'${alias}',importPath:'${importPath}',absolutePath:'${absolutePath}',modulesAvailable:Object.keys(window.__modules__||{}).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                // РС‰РµРј модуль по всем возможным путям
                const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
                const module2 = window.__modules__ && window.__modules__['${importPath}'];
                // Также пробуем найти модуль по любому пути, который содержит имя файла
                let module3 = null;
                const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
                if (window.__modules__) {
                  for (const key of Object.keys(window.__modules__)) {
                    if (key.includes(fileName) || key.endsWith('${importPath}') || key === fileName) {
                      module3 = window.__modules__[key];
                      break;
                    }
                  }
                }
                // #region agent log
                {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Module lookup',data:{orig:'${orig}',hasModule1:!!module1,hasModule2:!!module2,hasModule3:!!module3,module1Keys:module1?Object.keys(module1):[],module2Keys:module2?Object.keys(module2):[],module3Keys:module3?Object.keys(module3):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                const module = module1 || module2 || module3;
                if (!module) {
                  console.error('Module not found for ${importPath}. Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Tried paths: ${absolutePath}, ${importPath}');
                  throw new Error('Module not found: ${importPath}');
                }
                const value = module.${orig} || module.default?.${orig};
                // #region agent log
                {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Import result',data:{orig:'${orig}',alias:'${alias}',valueDefined:value!==undefined,valueType:typeof value,moduleKeys:Object.keys(module)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                if (value === undefined) {
                  console.error('Failed to import ${orig} from ${importPath}.');
                  console.error('Module found:', module);
                  console.error('Module keys:', Object.keys(module || {}));
                  console.error('Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Module ${absolutePath}:', module1);
                  console.error('Module ${importPath}:', module2);
                  console.error('Searched module:', module3);
                  throw new Error('Failed to import ${orig} from ${importPath}. Export "${orig}" not found in module. Available exports: ' + Object.keys(module || {}).join(', '));
                }
                return value;
              })();`;
            });
            importReplacements[importStatement.fullStatement] = replacements.join('\n');
          } else {
            // Default import: import name from ...
            // Получаем абсолютный путь для этого модуля (используем ту же логику, что и для named imports)
            const absolutePath = dependencyModules[importPath] || importPath;

            // Получаем информацию о default export из обработанной зависимости
            // РС‰РµРј модуль в dependencies по абсолютному пути
            const depContent = dependencies[absolutePath] || dependencies[importPath];
            let hasDefaultExport2 = false;
            let defaultExportName2: string | null = null;

            if (depContent) {
              // Проверяем наличие default export в содержимом
              const defaultExportMatch = depContent.match(/export\s+default\s+(.+?)(;|$)/s);
              if (defaultExportMatch) {
                hasDefaultExport2 = true;
                const exportValue = defaultExportMatch[1].trim();
                if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportValue)) {
                  defaultExportName2 = exportValue;
                } else {
                  defaultExportName2 = '__defaultExport';
                }
              }
            }

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:885',message:'Processing default import',data:{importPath,absolutePath,importSpec,hasDefaultExport:hasDefaultExport2,defaultExportName:defaultExportName2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            // Создаем код для импорта default значения
            importReplacements[importStatement.fullStatement] = `const ${importSpec} = (() => {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Resolving default import',data:{importSpec:'${importSpec}',importPath:'${importPath}',absolutePath:'${absolutePath}'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
              const module2 = window.__modules__ && window.__modules__['${importPath}'];
              // Также пробуем найти модуль по любому пути, который содержит имя файла
              let module3 = null;
              const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
              if (window.__modules__) {
                for (const key of Object.keys(window.__modules__)) {
                  if (key.includes(fileName) || key.endsWith('${importPath}')) {
                    module3 = window.__modules__[key];
                    break;
                  }
                }
              }
              // #region agent log
              {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Module lookup for default import',data:{importSpec:'${importSpec}',hasModule1:!!module1,hasModule2:!!module2,hasModule3:!!module3,module1Keys:module1?Object.keys(module1):[],module2Keys:module2?Object.keys(module2):[],module3Keys:module3?Object.keys(module3):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              const module = module1 || module2 || module3;
              const value = module?.default || module?.styles || module;
              // #region agent log
              {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Default import result',data:{importSpec:'${importSpec}',valueDefined:value!==undefined,valueType:typeof value,isFunction:typeof value==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              if (value === undefined) {
                console.error('Failed to import default from ${importPath}. Available modules:', Object.keys(window.__modules__ || {}));
                console.error('Module ${absolutePath}:', module1);
                console.error('Module ${importPath}:', module2);
                console.error('Searched module:', module3);
                throw new Error('Failed to import default from ${importPath}. Module not found or default export not available.');
              }
              return value;
            })();`;
          }
        }
      }
    }

    // Обрабатываем импорты в основном файле
    for (const imp of imports) {
      // Пропускаем внешние библиотеки
      if (isCoreReactImport(imp.path) || isHttpImport(imp.path)) {
        continue;
      }

      // Получаем абсолютный путь для этого импорта
      const absolutePath = dependencyModules[imp.path] || pathMap[imp.path] || imp.path;

      // Парсим, что именно импортируется
      const match = imp.fullStatement.match(/import\s+(.*?)\s+from/);
      if (!match) continue;

      const importSpec = match[1].trim();

      // Проверяем import * as name from ...
      const starAsMatch = imp.fullStatement.match(/import\s+\*\s+as\s+(\w+)/);
      if (starAsMatch) {
        const alias = starAsMatch[1];
        importReplacements[imp.fullStatement] = `const ${alias} = window.__modules__ && window.__modules__['${absolutePath}'] || window.__modules__ && window.__modules__['${imp.path}'] || {};`;
      } else if (importSpec.startsWith('{')) {
        // Named imports: import { a, b as c } from ...
        const names = importSpec.replace(/[{}]/g, '').split(',').map((n: string) => n.trim()).filter((n: string) => n);
        const replacements = names.map(name => {
          const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
          let orig = parts[0].trim();
          let alias = parts[1].trim();
          // Валидация имени переменной: убираем недопустимые символы
          alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
          if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
            // Если имя невалидно, используем безопасное имя
            alias = 'imported_' + Math.random().toString(36).substr(2, 9);
          }
          // Также валидируем orig, так как он используется в module.${orig}
          orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
          if (!orig) {
            orig = 'default';
          }
          return `const ${alias} = (() => {
            const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
            const module2 = window.__modules__ && window.__modules__['${imp.path}'];
            let module3 = null;
            const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
            if (window.__modules__) {
              for (const key of Object.keys(window.__modules__)) {
                if (key.includes(fileName) || key.endsWith('${imp.path}') || key === fileName) {
                  module3 = window.__modules__[key];
                  break;
                }
              }
            }
            const module = module1 || module2 || module3;
            if (!module) {
              console.error('Module not found for ${imp.path}. Available modules:', Object.keys(window.__modules__ || {}));
              throw new Error('Module not found: ${imp.path}');
            }
            const value = module.${orig} || module.default?.${orig};
            if (value === undefined) {
              console.error('Failed to import ${orig} from ${imp.path}.');
              console.error('Module found:', module);
              console.error('Module keys:', Object.keys(module || {}));
              console.error('Available modules:', Object.keys(window.__modules__ || {}));
              throw new Error('Failed to import ${orig} from ${imp.path}. Export "${orig}" not found in module. Available exports: ' + Object.keys(module || {}).join(', '));
            }
            return value;
          })();`;
        });
        importReplacements[imp.fullStatement] = replacements.join('\n');
      } else {
        // Default import: import name from ...
        importReplacements[imp.fullStatement] = `const ${importSpec} = (() => {
          const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
          const module2 = window.__modules__ && window.__modules__['${imp.path}'];
          let module3 = null;
          const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
          if (window.__modules__) {
            for (const key of Object.keys(window.__modules__)) {
              if (key.includes(fileName) || key.endsWith('${imp.path}')) {
                module3 = window.__modules__[key];
                break;
              }
            }
          }
          const module = module1 || module2 || module3;
          const value = module?.default || module?.styles || module;
          if (value === undefined) {
            console.error('Failed to import default from ${imp.path}. Available modules:', Object.keys(window.__modules__ || {}));
            throw new Error('Failed to import default from ${imp.path}. Module not found or default export not available.');
          }
          return value;
        })();`;
      }
    }

    // Заменяем импорты в коде
    console.log('RenderFile: Import replacements:', importReplacements);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:817',message:'Before replacing imports',data:{importReplacementsCount:Object.keys(importReplacements).length,processedCodeLength:processedCode.length,importReplacements:Object.keys(importReplacements).map(k=>k.substring(0,50))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    for (const [original, replacement] of Object.entries(importReplacements)) {
      if (processedCode.includes(original)) {
        processedCode = processedCode.replace(original, replacement);
        console.log('RenderFile: Replaced import:', original, 'with:', replacement);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:822',message:'Replaced import',data:{original:original.substring(0,50),replacement:replacement.substring(0,100),hasHeader:replacement.includes('Header')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      } else {
        console.warn('RenderFile: Import not found in code:', original);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:827',message:'Import not found in code',data:{original:original.substring(0,50),codeContains:processedCode.includes(original)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
      }
    }

    // Удаляем оставшиеся локальные импорты (которые не были заменены)
    processedCode = processedCode.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
    processedCode = processedCode.replace(/import\s+['"][^'"]+['"];?\s*/g, '');

    console.log('RenderFile: Processed code length:', processedCode.length);
    console.log('RenderFile: Modules code length:', modulesCode.length);
    console.log('RenderFile: Dependency paths:', dependencyPaths);

    // Создаем код для предварительной регистрации всех модулей
    // Это гарантирует, что модули будут доступны, даже если они еще не выполнились
    const allModulePaths = new Set<string>();
    // Собираем все возможные пути для каждого модуля
    for (const [relPath, absPath] of Object.entries(pathMap)) {
      allModulePaths.add(relPath);
      allModulePaths.add(absPath);
      // Также добавляем варианты без расширения и последние части пути
      const absPathNoExt = absPath.replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, '');
      allModulePaths.add(absPathNoExt);
      const parts = absPath.split('/');
      if (parts.length >= 2) {
        allModulePaths.add(parts.slice(-2).join('/'));
        allModulePaths.add(parts.slice(-2).join('/').replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, ''));
      }
      if (parts.length > 0) {
        allModulePaths.add(parts[parts.length - 1]);
        allModulePaths.add(parts[parts.length - 1].replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, ''));
      }
    }

    // Также добавляем все пути из allPossiblePaths для каждого модуля
    for (const absolutePath of uniqueAbsolutePaths) {
      const moduleAbsolutePath = dependencyModules[absolutePath] || absolutePath;
      const pathParts = moduleAbsolutePath.split('/');
      if (pathParts.length >= 2) {
        allModulePaths.add(pathParts.slice(-2).join('/'));
        allModulePaths.add(pathParts.slice(-2).join('/').replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, ''));
      }
      if (pathParts.length > 0) {
        allModulePaths.add(pathParts[pathParts.length - 1]);
        allModulePaths.add(pathParts[pathParts.length - 1].replace(/\.(js|jsx|ts|tsx|png|jpe?g|gif|webp|avif|bmp|svg)$/, ''));
      }
    }

    const preRegisterCode = Array.from(allModulePaths).filter(Boolean).map((path: string) => {
      // Экранируем кавычки в пути
      const escapedPath = path.replace(/'/g, "\\'");
      return `window.__modules__['${escapedPath}'] = window.__modules__['${escapedPath}'] || null;`;
    }).join('\n        ');
    const externalModulesCode = Array.from(externalPackageImports).sort().map((path: string) => {
      const escapedPath = path.replace(/'/g, "\\'");
      const externalUrl = createExternalModuleUrl(path);
      return `
        try {
          const moduleNs = await import(${JSON.stringify(externalUrl)});
          const normalizedModuleNs = window.__normalizeExternalModule__
            ? window.__normalizeExternalModule__('${escapedPath}', moduleNs)
            : moduleNs;
          window.__modules__['${escapedPath}'] = normalizedModuleNs;
          console.log('[ExternalModule] Loaded ${escapedPath} from ${externalUrl}');
        } catch (error) {
          console.error('[ExternalModule] Failed to load ${escapedPath} from ${externalUrl}', error);
          throw new Error('Module not found: ${escapedPath}');
        }`;
    }).join('\n');

    // Обертываем modulesCode, чтобы сначала предварительно зарегистрировать модули
    const wrappedModulesCode = `
        // Предварительная регистрация всех модулей (создаем пустые слоты)
        ${preRegisterCode}
        
        console.log('Pre-registered ${allModulePaths.size} module paths:', ${JSON.stringify(Array.from(allModulePaths).slice(0, 20))});
        
        // Теперь загружаем модули (они заполнят предварительно зарегистрированные слоты)
        ${modulesCode}
        
        console.log('All modules loaded. Total modules:', Object.keys(window.__modules__ || {}).length);
        console.log('Registered module keys:', Object.keys(window.__modules__ || {}));
    `;

    return {
      code: processedCode,
      modulesCode: wrappedModulesCode,
      externalModulesCode,
      stylesCode: collectedCss,
      dependencyPaths: dependencyPaths, // Возвращаем пути зависимых файлов
      defaultExportInfo: defaultExportInfo // Сохраняем информацию о default export
    };
  };

  // detectComponents теперь импортируется из модуля react-processor

  // Создаем HTML обертку для React файлов
  const createReactHTML = async (code, basePath) => {
    // ВАЖНО: сначала инструментируем РРЎРҐРћР”РќР«Р™ код, чтобы data-no-code-ui-id были стабильны относительно файла.
    // Потом уже прогоняем processReactCode вЂ” он не должен ломать data-no-code-ui-id.
    console.log('рџ”µ createReactHTML: инструментируем исходный код', {
      codeLength: code.length,
      codePreview: code.substring(0, 300),
      hasJsxElements: /<[A-Za-z]/.test(code)
    });
    const instOriginal = instrumentJsx(code, basePath);
    console.log('рџ”µ createReactHTML: результат инструментации исходного кода', {
      instOriginalMapKeys: Object.keys(instOriginal.map).length,
      instOriginalMapSample: Object.keys(instOriginal.map).slice(0, 5),
      instOriginalCodeLength: instOriginal.code.length,
      instOriginalCodeHasIds: (instOriginal.code.match(/data-no-code-ui-id/g) || []).length
    });

    // Сначала обрабатываем код (загружаем зависимости, заменяем импорты)
    const processed = await processReactCode(instOriginal.code, basePath);
    const processedCodeBeforeInst = processed.code; // уже содержит data-no-code-ui-id (или legacy data-mrpak-id)
    const modulesCode = processed.modulesCode || '';
    const externalModulesCode = processed.externalModulesCode || '';
    const stylesCode = processed.stylesCode || '';
    const dependencyPaths = processed.dependencyPaths || [];
    const defaultExportInfo = processed.defaultExportInfo || null;

    // Собираем карту для превью/редактора на обработанном коде (атрибуты уже есть).
    const instProcessed = instrumentJsx(processedCodeBeforeInst, basePath);
    const processedCode = instProcessed.code;

    // Детектируем компоненты в обработанном коде
    const detectedComponents = detectComponents(processedCode);

    // Если есть информация о default export, добавляем её с наивысшим приоритетом
    if (defaultExportInfo && !detectedComponents.find(c => c.name === defaultExportInfo.name && c.type === 'default-export')) {
      detectedComponents.unshift({
        name: defaultExportInfo.name,
        type: 'default-export',
        priority: 0
      });
    }

    // Находим компонент для рендеринга по приоритету
    let componentToRender: string | null = null;
    let componentName: string | null = null;

    // Приоритет: default export > named exports > остальные компоненты
    for (const comp of detectedComponents) {
      // Проверяем, что компонент действительно существует в коде
      const componentExists = new RegExp(`(?:const|let|var|function)\\s+${comp.name}\\s*[=(]`).test(processedCode) ||
                               new RegExp(`\\b${comp.name}\\s*=`).test(processedCode);
      if (componentExists) {
        componentToRender = comp.name;
        componentName = comp.name;
        break;
      }
    }

    // Fallback: пробуем стандартные имена
    if (!componentToRender) {
      const standardNames = ['App', 'MyComponent', 'Component'];
      for (const name of standardNames) {
        if (new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode)) {
          componentToRender = name;
          componentName = name;
          break;
        }
      }
    }

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Component Preview</title>
    <script>
        // Передаем filePath в глобальную переменную для использования в скрипте
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(basePath)};
        window.addEventListener('unhandledrejection', (event) => {
          const reason = event && event.reason;
          const message = String((reason && (reason.message || reason)) || '').toLowerCase();
          if (message.includes('canceled') || message.includes('cancelled') || message.includes('aborterror')) {
            event.preventDefault();
          }
        });
    </script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script>
      if (typeof Babel !== 'undefined' && Babel.registerPreset && Babel.availablePresets) {
        Babel.registerPreset('mrpak-tsx', {
          presets: [
            [Babel.availablePresets['react'], { runtime: 'classic' }],
            [Babel.availablePresets['typescript'], { allExtensions: true, isTSX: true }]
          ]
        });
      }
    </script>
    <script>
        if (typeof Babel !== 'undefined' && Babel.registerPreset && Babel.availablePresets) {
            Babel.registerPreset('mrpak-tsx', {
                presets: [
                    [Babel.availablePresets['react'], { runtime: 'classic' }],
                    [Babel.availablePresets['typescript'], { allExtensions: true, isTSX: true }]
                ]
            });
        }
    </script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f5f5f5;
        }
        #root {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px 0;
        }
        .info {
            color: #666;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        ${stylesCode}
    </style>
</head>
<body>
    <div class="info">
        <strong>React Component Preview</strong><br>
        Loading component from selected file...
    </div>
    <div id="root"></div>
    <script type="module">
        window.__externalModulesReady__ = (async () => {
            window.__modules__ = window.__modules__ || {};
            const adaptExternalReactNode = (node) => {
                if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
                    return node;
                }
                if (Array.isArray(node)) {
                    return node.map((child) => adaptExternalReactNode(child));
                }
                if (typeof node === 'object' && node.$$typeof && node.type) {
                    const props = { ...(node.props || {}) };
                    const children = Object.prototype.hasOwnProperty.call(props, 'children') ? props.children : undefined;
                    if (Object.prototype.hasOwnProperty.call(props, 'children')) {
                        delete props.children;
                    }
                    const normalizedChildren = children === undefined ? [] : (Array.isArray(children) ? children : [children]).map((child) => adaptExternalReactNode(child));
                    return React.createElement(node.type, props, ...normalizedChildren);
                }
                return node;
            };
            const adaptExternalReactComponent = (Component) => {
                if (typeof Component !== 'function') return Component;
                const WrappedComponent = function MrpakExternalComponentAdapter(props) {
                    return adaptExternalReactNode(Component(props));
                };
                try {
                    Object.defineProperty(WrappedComponent, 'name', {
                        value: Component.displayName || Component.name || 'MrpakExternalComponentAdapter'
                    });
                } catch {}
                WrappedComponent.displayName = Component.displayName || Component.name || 'MrpakExternalComponentAdapter';
                return WrappedComponent;
            };
            window.__normalizeExternalModule__ = (importPath, moduleNs) => {
                if (!String(importPath || '').startsWith('react-icons/')) {
                    return moduleNs;
                }
                const normalizedEntries = Object.entries(moduleNs || {}).map(([key, value]) => {
                    if (key === 'default') return [key, value];
                    return [key, adaptExternalReactComponent(value)];
                });
                return Object.fromEntries(normalizedEntries);
            };
            ${externalModulesCode || 'return window.__modules__;'}
            return window.__modules__;
        })();
    </script>
    <script type="text/babel" data-type="module" data-presets="mrpak-tsx">
        (async () => {
        // React доступен глобально через CDN
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        
        // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј window.__modules__ ДО загрузки модулей
        window.__modules__ = window.__modules__ || {};
        const __mrpakOriginalConsoleError = console.error;
        console.error = (...args) => {
          const first = args && args.length ? String(args[0] || '') : '';
          if (first.includes('Warning: Encountered two children with the same key')) {
            console.warn(...args);
            return;
          }
          __mrpakOriginalConsoleError(...args);
        };
        await (window.__externalModulesReady__ || Promise.resolve());
        console.log('Before loading modules, window.__modules__ initialized');
        
        // Загружаем модули зависимостей
        ${modulesCode}
        
        // Отладочная информация
        console.log('Available modules:', Object.keys(window.__modules__ || {}));
        Object.keys(window.__modules__ || {}).forEach(path => {
          console.log('Module:', path, window.__modules__[path]);
        });
        
        // Функция для инструментирования DOM элементов с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
        function instrumentReactDOM(rootElement, filePath) {
          if (!rootElement) return;
          
          const safeBasename = (path) => {
            try {
              const norm = String(path || '').replace(/\\\\/g, '/');
              return norm.split('/').pop() || 'unknown';
            } catch {
              return 'unknown';
            }
          };
          
          const makeSelectorForElement = (el) => {
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const tag = cur.tagName.toLowerCase();
              const parent = cur.parentElement;
              if (!parent || parent === rootElement || parent === document.body || parent === document.documentElement) {
                parts.push(tag);
                break;
              }
              const children = Array.from(parent.children);
              const idx = children.indexOf(cur);
              const nth = idx >= 0 ? idx + 1 : 1;
              parts.push(\`\${tag}:nth-child(\${nth})\`);
              cur = parent;
            }
            return parts.reverse().join(' > ');
          };
          
          const makeMrpakId = (filePath, selector, tagName) => {
            const base = safeBasename(filePath);
            return \`mrpak:\${base}:\${tagName || 'el'}:\${selector}\`;
          };
          
          const used = new Set();
          const all = rootElement.querySelectorAll ? Array.from(rootElement.querySelectorAll('*')) : [];
          
          all.forEach((el) => {
            // Пропускаем элементы, которые уже имеют id-атрибут
            const existing = (el.getAttribute && (el.getAttribute('data-no-code-ui-id') || el.getAttribute('data-mrpak-id'))) || null;
            if (existing) {
              used.add(existing);
              return;
            }
            
            // Пропускаем script, style и другие служебные элементы
            const tagName = (el.tagName || '').toLowerCase();
            if (['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
              return;
            }
            
            const selector = makeSelectorForElement(el);
            let id = makeMrpakId(filePath, selector, tagName);
            
            // Убеждаемся, что ID уникален
            if (used.has(id)) {
              let i = 2;
              while (used.has(\`\${id}:\${i}\`)) i += 1;
              id = \`\${id}:\${i}\`;
            }
            used.add(id);
            
            if (el.setAttribute) {
              el.setAttribute('data-no-code-ui-id', id);
            }
          });
        }
        
        try {
            ${processedCode}
            
            // Автоматически находим компонент для рендеринга
            let Component = null;
            ${componentToRender ? 
              `// РСЃРїРѕР»СЊР·СѓРµРј автоматически найденный компонент: ${componentName}
              if (typeof ${componentName} !== 'undefined') {
                Component = ${componentName};
              }` : 
              `// Пробуем стандартные имена как fallback
              if (typeof App !== 'undefined') {
                Component = App;
              } else if (typeof MyComponent !== 'undefined') {
                Component = MyComponent;
              } else if (typeof Component !== 'undefined') {
                Component = Component;
              } else {
                // Пробуем найти любой компонент с заглавной буквы
                const allVars = Object.keys(typeof window !== 'undefined' ? window : {});
                for (const varName of allVars) {
                  if (varName[0] === varName[0].toUpperCase() && 
                      typeof window[varName] === 'function' &&
                      varName !== 'React' && varName !== 'ReactDOM') {
                    Component = window[varName];
                    break;
                  }
                }
              }`
            }
            
            if (Component) {
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                
                // После рендеринга React инструментируем DOM и блокируем интерактивные элементы
                setTimeout(() => {
                  const rootElement = document.getElementById('root');
                  const filePath = window.__MRPAK_FILE_PATH__ || '';
                  
                  // РРЅСЃС‚СЂСѓРјРµРЅС‚РёСЂСѓРµРј DOM элементы с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
                  instrumentReactDOM(rootElement, filePath);
                  
                  // Обновляем дерево слоев после инструментирования
                  if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                    window.__MRPAK_BUILD_TREE__();
                  }
                  
                  // РСЃРїРѕР»СЊР·СѓРµРј MutationObserver для отслеживания новых элементов
                  const observer = new MutationObserver((mutations) => {
                    // РРЅСЃС‚СЂСѓРјРµРЅС‚РёСЂСѓРµРј новые элементы
                    const rootElement = document.getElementById('root');
                    if (rootElement) {
                      instrumentReactDOM(rootElement, filePath);
                      // Обновляем дерево слоев после инструментирования
                      if (typeof buildTree === 'function') {
                        buildTree();
                      }
                    }
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                }, 100);
            } else {
                const foundComponents = ${JSON.stringify(detectedComponents.map(c => c.name))};
                const errorMsg = foundComponents.length > 0 
                  ? 'Found components: ' + foundComponents.join(', ') + '. Failed to use them for rendering.'
                  : 'No component found for rendering. Make sure the file exports a React component.';
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error"><strong>Runtime error:</strong><br>' + error.message + '</div>';
            console.error('React execution error:', error);
        }
        })().catch((error) => {
            console.error('React bootstrap error:', error);
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML = '<div class="error"><strong>Runtime error:</strong><br>' + (error && error.message ? error.message : String(error)) + '</div>';
            }
        });
    </script>
</body>
</html>
    `;

    console.log('рџ”µ createReactHTML: финальный результат', {
      blockMapForEditorKeys: Object.keys(instProcessed.map).length,
      blockMapForFileKeys: Object.keys(instOriginal.map).length,
      blockMapForFileSample: Object.keys(instOriginal.map).slice(0, 5),
      blockMapForEditorSample: Object.keys(instProcessed.map).slice(0, 5)
    });

    return {
      html,
      dependencyPaths,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
    };
  };

  // Создаем HTML обертку для React Native файлов
  const createReactNativeHTML = async (code: string, basePath: string) => {
    // ВАЖНО: сначала инструментируем РРЎРҐРћР”РќР«Р™ код, чтобы data-no-code-ui-id были стабильны относительно файла.
    const instOriginal = instrumentJsx(code, basePath);

    // Сначала обрабатываем код (загружаем зависимости, заменяем импорты)
    const processed = await processReactCode(instOriginal.code, basePath);
    const processedCodeBeforeInst = processed.code; // уже содержит data-no-code-ui-id (или legacy data-mrpak-id)
    const modulesCode = processed.modulesCode || '';
    const dependencyPaths = processed.dependencyPaths || [];
    const defaultExportInfo = processed.defaultExportInfo || null;

    // Собираем карту для превью/редактора на обработанном коде (атрибуты уже есть).
    const instProcessed = instrumentJsx(processedCodeBeforeInst, basePath);
    const processedCode = instProcessed.code;

    // Детектируем компоненты в обработанном коде
    const detectedComponents = detectComponents(processedCode);

    // Если есть информация о default export, добавляем её с наивысшим приоритетом
    if (defaultExportInfo && !detectedComponents.find(c => c.name === defaultExportInfo.name && c.type === 'default-export')) {
      detectedComponents.unshift({
        name: defaultExportInfo.name,
        type: 'default-export',
        priority: 0
      });
    }

    // Находим компонент для рендеринга по приоритету
    let componentToRender: string | null = null;
    let componentName = null;

    // Приоритет: default export > named exports > остальные компоненты
    for (const comp of detectedComponents) {
      // Проверяем, что компонент действительно существует в коде
      const componentExists = new RegExp(`(?:const|let|var|function)\\s+${comp.name}\\s*[=(]`).test(processedCode) ||
                               new RegExp(`\\b${comp.name}\\s*=`).test(processedCode);
      if (componentExists) {
        componentToRender = comp.name;
        componentName = comp.name;
        break;
      }
    }

    // Fallback: пробуем стандартные имена
    if (!componentToRender) {
      const standardNames = ['App', 'MyComponent', 'Component'];
      for (const name of standardNames) {
        if (new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode)) {
          componentToRender = name;
          componentName = name;
          break;
        }
      }
    }

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Native Web Component Preview</title>
    <script>
        // Передаем filePath в глобальную переменную для использования в скрипте
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(basePath)};
        window.addEventListener('unhandledrejection', (event) => {
          const reason = event && event.reason;
          const message = String((reason && (reason.message || reason)) || '').toLowerCase();
          if (message.includes('canceled') || message.includes('cancelled') || message.includes('aborterror')) {
            event.preventDefault();
          }
        });
    </script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script>
      // Функция для нормализации стилей React Native в CSS стили
      function normalizeStyle(style) {
        if (!style) return {};
        if (Array.isArray(style)) {
          // Если массив стилей, объединяем их, пропуская null/undefined
          const validStyles = style.filter(s => s != null && typeof s === 'object');
          if (validStyles.length === 0) return {};
          // Рекурсивно нормализуем и объединяем
          const merged = {};
          validStyles.forEach(s => {
            const normalized = normalizeStyle(s);
            Object.assign(merged, normalized);
          });
          return merged;
        }
        if (typeof style !== 'object' || style === null) return {};
        
        // Создаем новый объект для безопасной работы
        const result = {};
        for (const key in style) {
          if (style.hasOwnProperty(key)) {
            const value = style[key];
            // Пропускаем null, undefined, функции и объекты (кроме Date)
            if (value === null || value === undefined) continue;
            if (typeof value === 'function') continue;
            if (typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
              // Пропускаем объекты типа shadowOffset, transform и т.д.
              // Они не поддерживаются напрямую в CSS
              continue;
            }
            
            // Список свойств, которые требуют 'px' для числовых значений
            const pixelProperties = [
              'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
              'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
              'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
              'top', 'right', 'bottom', 'left',
              'fontSize', 'lineHeight', 'letterSpacing',
              'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
              'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 
              'borderBottomLeftRadius', 'borderBottomRightRadius',
              'outlineWidth', 'gap', 'rowGap', 'columnGap'
            ];
            
            // Обрабатываем значения - ВАЖНО: только примитивы
            let cssValue;
            if (typeof value === 'number') {
              // Для числовых значений добавляем 'px' для размеров
              if (pixelProperties.includes(key)) {
                cssValue = value + 'px';
              } else if (key === 'opacity' || key === 'zIndex' || key === 'flex' || 
                         key === 'flexGrow' || key === 'flexShrink' || key === 'order' ||
                         key === 'fontWeight') {
                // Эти свойства остаются числами
                cssValue = value;
              } else {
                // По умолчанию для других числовых значений тоже добавляем px
                cssValue = value + 'px';
              }
            } else if (typeof value === 'string') {
              cssValue = value;
            } else if (Array.isArray(value)) {
              // Массивы преобразуем в строки, но только если элементы примитивы
              cssValue = value.map(v => String(v)).join(' ');
            } else if (value instanceof Date) {
              cssValue = value.toISOString();
            } else {
              // Пропускаем все остальное
              continue;
            }
            
            // Проверяем, что значение действительно примитив
            if (typeof cssValue !== 'string' && typeof cssValue !== 'number' && typeof cssValue !== 'boolean') {
              continue;
            }
            
            // ВАЖНО: React требует camelCase для inline стилей, НЕ kebab-case!
            // kebab-case используется только в CSS файлах, но не в inline стилях через объекты
            // Поэтому оставляем ключ как есть (camelCase)
            const cssKey = key; // НЕ конвертируем в kebab-case!
            
            // Убеждаемся, что мы устанавливаем только строку или число
            // Но оставляем числа как числа (для opacity, zIndex и т.д.)
            if (typeof cssValue === 'number' && (key === 'opacity' || key === 'zIndex' || key === 'flex' || 
                key === 'flexGrow' || key === 'flexShrink' || key === 'order' || key === 'fontWeight')) {
              result[cssKey] = cssValue;
            } else {
              result[cssKey] = String(cssValue);
            }
          }
        }
        return result;
      }
      
      // React Native Web компоненты через полифилл
      // Создаем базовые компоненты, совместимые с React
      window.ReactNative = {
        View: React.forwardRef((props, ref) => {
          const { style, ...otherProps } = props;
          const baseStyle = { display: 'flex', flexDirection: 'column' };
          // ВАЖНО: normalizeStyle всегда вызывается, даже если style undefined
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка: убеждаемся, что computedStyle не содержит массивов или объектов
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            ...otherProps
          }, props.children);
        }),
        Text: React.forwardRef((props, ref) => {
          const { style, ...otherProps } = props;
          const baseStyle = { display: 'inline' };
          // ВАЖНО: normalizeStyle всегда вызывается, даже если style undefined
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка: убеждаемся, что computedStyle не содержит массивов или объектов
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          return React.createElement('span', {
            ref,
            style: safeStyle,
            ...otherProps
          }, props.children);
        }),
        ScrollView: React.forwardRef((props, ref) => {
          const { style, contentContainerStyle, ...otherProps } = props;
          const baseStyle = {
            overflow: 'auto',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          };
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка для безопасности
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          const safeContentStyle = contentContainerStyle ? normalizeStyle(contentContainerStyle) : null;
          const safeContentStyleObj = {};
          if (safeContentStyle) {
            for (const key in safeContentStyle) {
              const value = safeContentStyle[key];
              if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
                safeContentStyleObj[key] = value;
              }
            }
          }
          
          const children = contentContainerStyle 
            ? React.createElement('div', { style: safeContentStyleObj }, props.children)
            : props.children;
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            ...otherProps
          }, children);
        }),
        TouchableOpacity: React.forwardRef((props, ref) => {
          const { style, onPress, ...otherProps } = props;
          const baseStyle = {
            cursor: 'pointer',
            transition: 'opacity 0.2s',
            display: 'inline-block'
          };
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка для безопасности
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          const handleClick = (e) => {
            if (onPress) {
              onPress(e);
            }
          };
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            onClick: handleClick,
            ...otherProps
          }, props.children);
        }),
        ActivityIndicator: ({ size = 'small', color = '#667eea' }) => {
          const sizeValue = size === 'large' ? '36px' : '20px';
          return React.createElement('div', {
            style: {
              display: 'inline-block',
              width: sizeValue,
              height: sizeValue,
              border: '3px solid rgba(0,0,0,0.1)',
              borderTopColor: color,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }
          });
        },
        StyleSheet: {
          create: (styles) => {
            // Возвращаем стили как есть, но с нормализацией при использовании
            const result = {};
            for (const key in styles) {
              if (styles.hasOwnProperty(key)) {
                result[key] = styles[key];
              }
            }
            return result;
          },
          flatten: (style) => {
            if (Array.isArray(style)) {
              return Object.assign({}, ...style);
            }
            return style || {};
          }
        }
      };
      
      // Добавляем анимацию для ActivityIndicator
      const styleEl = document.createElement('style');
      styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(styleEl);
    </script>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }
        #root {
            width: 100%;
            min-height: 100vh;
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px;
        }
        .info {
            color: #666;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>React Native Web Component Preview</strong><br>
        Loading component from selected file...
    </div>
    <div id="root"></div>
    <script type="text/babel" data-type="module" data-presets="mrpak-tsx">
        // React и React Native Web доступны глобально через CDN
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        const ReactNative = window.ReactNative || {};
        const { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } = ReactNative;
        
        // Деструктурируем для использования в коде
        const RN = ReactNative;
        
        // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј window.__modules__ ДО загрузки модулей
        window.__modules__ = window.__modules__ || {};
        const __mrpakOriginalConsoleError = console.error;
        console.error = (...args) => {
          const first = args && args.length ? String(args[0] || '') : '';
          if (first.includes('Warning: Encountered two children with the same key')) {
            console.warn(...args);
            return;
          }
          __mrpakOriginalConsoleError(...args);
        };
        console.log('Before loading modules, window.__modules__ initialized');
        
        // Загружаем модули зависимостей
        ${modulesCode}
        
        // Отладочная информация - проверяем, что модули загружены
        console.log('After loading modules, available modules:', Object.keys(window.__modules__ || {}));
        Object.keys(window.__modules__ || {}).forEach(path => {
          const module = window.__modules__[path];
          console.log('Module:', path, 'exports:', Object.keys(module || {}));
          if (path.includes('commonStyles')) {
            console.log('commonStyles module details:', module);
            console.log('  - colors:', module?.colors);
            console.log('  - commonStyles:', module?.commonStyles);
          }
        });
        
        // Функция для инструментирования DOM элементов с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
        function instrumentReactDOM(rootElement, filePath) {
          if (!rootElement) return;
          
          const safeBasename = (path) => {
            try {
              const norm = String(path || '').replace(/\\\\/g, '/');
              return norm.split('/').pop() || 'unknown';
            } catch {
              return 'unknown';
            }
          };
          
          const makeSelectorForElement = (el) => {
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const tag = cur.tagName.toLowerCase();
              const parent = cur.parentElement;
              if (!parent || parent === rootElement || parent === document.body || parent === document.documentElement) {
                parts.push(tag);
                break;
              }
              const children = Array.from(parent.children);
              const idx = children.indexOf(cur);
              const nth = idx >= 0 ? idx + 1 : 1;
              parts.push(\`\${tag}:nth-child(\${nth})\`);
              cur = parent;
            }
            return parts.reverse().join(' > ');
          };
          
          const makeMrpakId = (filePath, selector, tagName) => {
            const base = safeBasename(filePath);
            return \`mrpak:\${base}:\${tagName || 'el'}:\${selector}\`;
          };
          
          const used = new Set();
          const all = rootElement.querySelectorAll ? Array.from(rootElement.querySelectorAll('*')) : [];
          
          all.forEach((el) => {
            // Пропускаем элементы, которые уже имеют id-атрибут
            const existing = (el.getAttribute && (el.getAttribute('data-no-code-ui-id') || el.getAttribute('data-mrpak-id'))) || null;
            if (existing) {
              used.add(existing);
              return;
            }
            
            // Пропускаем script, style и другие служебные элементы
            const tagName = (el.tagName || '').toLowerCase();
            if (['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
              return;
            }
            
            const selector = makeSelectorForElement(el);
            let id = makeMrpakId(filePath, selector, tagName);
            
            // Убеждаемся, что ID уникален
            if (used.has(id)) {
              let i = 2;
              while (used.has(\`\${id}:\${i}\`)) i += 1;
              id = \`\${id}:\${i}\`;
            }
            used.add(id);
            
            if (el.setAttribute) {
              el.setAttribute('data-no-code-ui-id', id);
            }
          });
        }
        
        // Перехватываем createElement для обработки массивов стилей в обычных HTML элементах
        const originalCreateElement = React.createElement;
        React.createElement = function(type, props, ...children) {
          // Если это строковый тип (HTML элемент) и есть style prop
          if (typeof type === 'string' && props && props.style) {
            // Обрабатываем массив стилей, если он есть
            if (Array.isArray(props.style)) {
              props = { ...props, style: normalizeStyle(props.style) };
            } else if (props.style && typeof props.style === 'object') {
              // Нормализуем даже одиночные объекты стилей
              props = { ...props, style: normalizeStyle(props.style) };
            }
          }
          return originalCreateElement.call(this, type, props, ...children);
        };
        
        try {
            // #region agent log
            {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:main-code',message:'About to execute processed code',data:{modulesAvailable:Object.keys(window.__modules__||{}).length,codeLength:${processedCode.length}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            ${processedCode}
            
            // Автоматически находим компонент для рендеринга
            let Component = null;
            ${componentToRender ? 
              `// РСЃРїРѕР»СЊР·СѓРµРј автоматически найденный компонент: ${componentName}
              if (typeof ${componentName} !== 'undefined') {
                Component = ${componentName};
              }` : 
              `// Пробуем стандартные имена как fallback
              if (typeof App !== 'undefined') {
                Component = App;
              } else if (typeof MyComponent !== 'undefined') {
                Component = MyComponent;
              } else if (typeof Component !== 'undefined') {
                Component = Component;
              } else {
                // Пробуем найти любой компонент с заглавной буквы
                const allVars = Object.keys(typeof window !== 'undefined' ? window : {});
                for (const varName of allVars) {
                  if (varName[0] === varName[0].toUpperCase() && 
                      typeof window[varName] === 'function' &&
                      varName !== 'React' && varName !== 'ReactDOM') {
                    Component = window[varName];
                    break;
                  }
                }
              }`
            }
            
            if (Component) {
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                
                // После рендеринга React инструментируем DOM и блокируем интерактивные элементы
                setTimeout(() => {
                  const rootElement = document.getElementById('root');
                  const filePath = window.__MRPAK_FILE_PATH__ || '';
                  
                  // РРЅСЃС‚СЂСѓРјРµРЅС‚РёСЂСѓРµРј DOM элементы с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
                  instrumentReactDOM(rootElement, filePath);
                  
                  // Обновляем дерево слоев после инструментирования
                  if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                    window.__MRPAK_BUILD_TREE__();
                  }
                  
                  // РСЃРїРѕР»СЊР·СѓРµРј MutationObserver для отслеживания новых элементов
                  const observer = new MutationObserver((mutations) => {
                    // РРЅСЃС‚СЂСѓРјРµРЅС‚РёСЂСѓРµРј новые элементы
                    const rootElement = document.getElementById('root');
                    if (rootElement) {
                      instrumentReactDOM(rootElement, filePath);
                      // Обновляем дерево слоев после инструментирования
                      if (typeof buildTree === 'function') {
                        buildTree();
                      }
                    }
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                }, 100);
            } else {
                const foundComponents = ${JSON.stringify(detectedComponents.map(c => c.name))};
                const errorMsg = foundComponents.length > 0 
                  ? 'Found components: ' + foundComponents.join(', ') + '. Failed to use them for rendering.'
                  : 'No component found for rendering. Make sure the file exports a React component.';
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error"><strong>Runtime error:</strong><br>' + error.message + '<br><br><pre>' + error.stack + '</pre></div>';
            console.error('React Native execution error:', error);
        }
    </script>
</body>
</html>
    `;

    return {
      html,
      dependencyPaths,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
    };
  };

  const activeBlockEditorType: 'html' | 'react' | 'react-native' = fileType === 'react' || fileType === 'react-native' ? fileType : 'html';
  const applyStyleLibraryClassToBlock = useCallback((blockId: string, className: string) => {
    const mappedBlockId = resolveToMappedBlockId(blockId) || blockId;
    const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
    let nextContent = String(currentCode || '');
    let mapEntry = blockMapForFile?.[mappedBlockId] || null;
    const token = String(className || '').trim();
    if (!token) {
      setError('Failed to apply className: class is empty.');
      return;
    }

    if (fileType === 'html') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(nextContent, 'text/html');
        const target = mapEntry?.selector ? doc.querySelector(String(mapEntry.selector)) : null;
        if (!target) {
          setError('Failed to apply className: element not found in HTML.');
          return;
        }
        target.classList.add(token);
        const hasDoctype = /^\s*<!doctype/i.test(nextContent);
        nextContent = `${hasDoctype ? '<!DOCTYPE html>' : ''}${doc.documentElement.outerHTML}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(`Failed to apply className: ${message}`);
        return;
      }
    } else {
      const isRangeUsable = (entry: any) => {
        const start = Number(entry?.start);
        const end = Number(entry?.end);
        return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= nextContent.length;
      };
      // mapEntry may be stale after local edits; rebuild map from current editor code as fallback.
      if (!isRangeUsable(mapEntry)) {
        try {
          if (isFrameworkSupported(fileType as string)) {
            const framework = createFramework(fileType as string, filePath);
            const reInstrumented = framework.instrument(nextContent, filePath);
            mapEntry = reInstrumented?.map?.[mappedBlockId] || mapEntry;
          }
        } catch {}
      }
      const start = Number(mapEntry?.start);
      const end = Number(mapEntry?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > nextContent.length) {
        setError('Failed to apply className: invalid tag range.');
        return;
      }
      const openingTag = nextContent.slice(start, end);
      if (!openingTag.startsWith('<') || openingTag.indexOf('>') < 0) {
        try {
          if (isFrameworkSupported(fileType as string)) {
            const framework = createFramework(fileType as string, filePath);
            const reInstrumented = framework.instrument(nextContent, filePath);
            const refreshed = reInstrumented?.map?.[mappedBlockId];
            const rs = Number(refreshed?.start);
            const re = Number(refreshed?.end);
            if (Number.isFinite(rs) && Number.isFinite(re) && rs >= 0 && re > rs && re <= nextContent.length) {
              const refreshedOpeningTag = nextContent.slice(rs, re);
              const refreshedUpdated = upsertClassNameInJsxOpeningTag(refreshedOpeningTag, token);
              if (refreshedUpdated.ok) {
                nextContent = `${nextContent.slice(0, rs)}${refreshedUpdated.text}${nextContent.slice(re)}`;
                updateMonacoEditorWithScroll(nextContent);
                setFileContent(nextContent);
                setUnsavedContent(nextContent);
                setIsModified(true);
                setRenderVersion((v) => v + 1);
                return;
              }
            }
          }
        } catch {}
      }
      const updated = upsertClassNameInJsxOpeningTag(openingTag, token);
      if (!updated.ok) {
        setError(updated.error);
        return;
      }
      nextContent = `${nextContent.slice(0, start)}${updated.text}${nextContent.slice(end)}`;
    }

    updateMonacoEditorWithScroll(nextContent);
    setFileContent(nextContent);
    setUnsavedContent(nextContent);
    setIsModified(true);
    setRenderVersion((v) => v + 1);
  }, [blockMapForFile, fileContent, fileType, updateMonacoEditorWithScroll, resolveToMappedBlockId]);

  const handleApplyStyleLibraryEntry = useCallback((entryId: string) => {
    const entry = styleLibraryEntries.find((item) => item.id === entryId);
    if (!entry || !selectedBlock?.id) return;
    if (fileType !== 'react-native' && entry.className) {
      applyStyleLibraryClassToBlock(selectedBlock.id, entry.className);
      return;
    }
    const patch = entry.stylePatch || {};
    if (!patch || Object.keys(patch).length === 0) return;
    void applyAndCommitPatch(selectedBlock.id, patch);
  }, [applyAndCommitPatch, applyStyleLibraryClassToBlock, fileType, selectedBlock?.id, styleLibraryEntries]);

  const handleAddProjectDependency = useCallback(
    async (packageName: string, version?: string) => {
      try {
        const name = String(packageName || '').trim();
        if (!name) {
          setError('Library name is empty.');
          return false;
        }
        const normalizedPackageName =
          name.startsWith('react-icons/') ? 'react-icons' : name;
        const normalize = (value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const rawRoot = normalize(String(projectRoot || ''));
        const rawProjectPath = normalize(String(projectPath || ''));
        const rawFilePath = normalize(String(filePath || ''));
        const fileDir = rawFilePath.includes('/') ? rawFilePath.slice(0, rawFilePath.lastIndexOf('/')) : '';

        const collectParents = (inputPath: string) => {
          const value = normalize(inputPath);
          if (!value) return [];
          const parts = value.split('/').filter(Boolean);
          const roots: string[] = [];
          for (let i = parts.length; i >= 1; i -= 1) {
            roots.push(parts.slice(0, i).join('/'));
          }
          return roots;
        };

        const rootCandidates = Array.from(
          new Set<string>(
            [
              rawRoot,
              rawProjectPath,
              fileDir,
              ...collectParents(fileDir),
              ...collectParents(rawProjectPath),
              ...collectParents(rawRoot),
            ].filter(Boolean)
          )
        );

        const packageCandidates = Array.from(
          new Set<string>([
            ...rootCandidates.map((root) => `${root}/package.json`),
            'package.json',
          ])
        );

        let packageJsonPath = '';
        let packageRead: any = null;
        for (const candidate of packageCandidates) {
          const readRes = await readFile(candidate);
          if (readRes?.success) {
            packageJsonPath = candidate;
            packageRead = readRes;
            break;
          }
        }

        if (!packageRead?.success) {
          const probePaths = Array.from(
            new Set(
              [
                rawFilePath,
                rawProjectPath && rawFilePath ? `${rawProjectPath}/${rawFilePath}` : '',
                rawProjectPath,
                rawRoot && rawFilePath ? `${rawRoot}/${rawFilePath}` : '',
                rawRoot,
              ].filter(Boolean)
            )
          );
          for (const probe of probePaths) {
            const detectedRoot = await findProjectRoot(probe);
            if (!detectedRoot) continue;
            const detectedPath = `${normalize(detectedRoot)}/package.json`;
            const readRes = await readFile(detectedPath);
            if (readRes?.success) {
              packageJsonPath = detectedPath;
              packageRead = readRes;
              break;
            }
          }
        }

        if (!packageRead?.success || !packageJsonPath) {
          const sampleCandidates = packageCandidates.slice(0, 6).join(', ');
          setError(
            `Failed to read package.json: not found. Tried: ${sampleCandidates}${packageCandidates.length > 6 ? ', ...' : ''}`
          );
          return false;
        }

        let parsed: any = null;
        try {
          parsed = JSON.parse(String(packageRead.content || '{}'));
        } catch {
          setError('package.json has invalid JSON.');
          return false;
        }

        const nextVersion = String(version || '').trim() || 'latest';
        const nextDependencies = {
          ...(parsed?.dependencies || {}),
          [normalizedPackageName]: nextVersion,
        };
        const sortedDependencies = Object.keys(nextDependencies)
          .sort((a, b) => a.localeCompare(b))
          .reduce((acc: Record<string, string>, key) => {
            acc[key] = nextDependencies[key];
            return acc;
          }, {});

        const nextPackageJson = {
          ...parsed,
          dependencies: sortedDependencies,
        };

        const writeRes = await writeFile(packageJsonPath, JSON.stringify(nextPackageJson, null, 2) + '\n', {
          backup: false,
        });
        if (!writeRes?.success) {
          setError(`Failed to update package.json: ${writeRes?.error || 'unknown error'}`);
          return false;
        }

        setError(null);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(`Failed to add dependency: ${message}`);
        return false;
      }
    },
    [filePath, projectPath, projectRoot, writeFile]
  );

  const handleInsertComponentFromLibrary = useCallback(
    async (componentName: string, importPath: string, importKind: 'default' | 'named' = 'named') => {
      try {
        const targetId = String(selectedBlock?.id || '').trim();
        const safeName = String(componentName || '').trim();
        const safeImportPath = String(importPath || '').trim();
        const dependencyPackageName =
          safeImportPath.startsWith('react-icons/') ? 'react-icons' : safeImportPath.split('/').slice(0, safeImportPath.startsWith('@') ? 2 : 1).join('/');
        if (!targetId) {
          setError('Select a block in canvas first.');
          return;
        }
        if (!safeName || !safeImportPath) {
          setError('Icon insert failed: invalid component import data.');
          return;
        }
        if (!stageInsertBlockRef.current) {
          setError('Insert handler is not ready yet.');
          return;
        }

        if (dependencyPackageName) {
          await handleAddProjectDependency(dependencyPackageName, 'latest');
        }

        await stageInsertBlockRef.current({
          targetId,
          mode: 'child',
          snippet: `<${safeName} />`,
          skipIframeInsert: true,
        });

        updateStagedComponentImports((prev) => {
          const exists = prev.some(
            (item) =>
              item.localName === safeName &&
              item.importPath === safeImportPath &&
              item.importKind === importKind
          );
          if (exists) return prev;
          return [...prev, { localName: safeName, importPath: safeImportPath, importKind }];
        });
        updateHasStagedChanges(true);
        const liveCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
        if (typeof liveCode === 'string' && liveCode.length > 0) {
          const codeWithImport = ensureComponentImportInCode(liveCode, {
            localName: safeName,
            importPath: safeImportPath,
            importKind,
          });
          if (codeWithImport !== liveCode) {
            updateMonacoEditorWithScroll(codeWithImport);
            setUnsavedContent(codeWithImport);
            setIsModified(true);
            setFileContent(codeWithImport);
          } else {
            setFileContent(liveCode);
          }
        }
        setRenderVersion((v) => v + 1);
        setError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(`Icon insert failed: ${message}`);
      }
    },
    [fileContent, handleAddProjectDependency, selectedBlock?.id, updateMonacoEditorWithScroll, updateStagedComponentImports, updateHasStagedChanges]
  );

  const blockEditorSidebarProps = useBlockEditorSidebarController({
    fileType: activeBlockEditorType,
    selectedBlock,
    onApplyPatch: applyAndCommitPatch,
    onStagePatch: applyBlockPatch,
    onCommitStagedChanges: commitStagedPatches,
    styleSnapshot: selectedBlock?.id ? styleSnapshots[selectedBlock.id] : null,
    textSnapshot: selectedBlock?.id ? textSnapshots[selectedBlock.id] : '',
    layersTree,
    layerNames,
    onRenameLayer: handleRenameLayer,
    onSendCommand: sendIframeCommand,
    onInsertBlock: stageInsertBlock,
    onDeleteBlock: stageDeleteBlock,
    onReparentBlock: stageReparentBlock,
    onSetText: stageSetText,
    framework,
    onUndo: undo,
    onRedo: redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    livePosition,
    selectedBlockIds,
    onExtractSelection: extractSelectedToComponent,
    onOpenFile,
    styleLibraryEntries,
    onImportStyleTemplate: handleImportStyleTemplate,
    onImportStyleFromPicker: handleImportStyleFromPicker,
    onApplyStyleLibraryEntry: handleApplyStyleLibraryEntry,
    onAddProjectDependency: handleAddProjectDependency,
    onInsertComponentFromLibrary: handleInsertComponentFromLibrary,
  });

  const renderContentMetaOverlay = useCallback((label: string, componentName?: string | null) => (
    <View style={styles.contentMetaOverlay} pointerEvents="none">
      <View style={styles.fileTypeBadge}>
        <Text style={styles.fileTypeText}>
          {componentName ? `${label} • ${componentName}` : label}
        </Text>
      </View>
    </View>
  ), []);

  const setSplitContainerNode = useCallback((ref: any) => {
    if (!ref) return;
    if (ref._nativeNode) {
      splitContainerRef.current = ref._nativeNode;
      return;
    }
    if (typeof ref.getBoundingClientRect === 'function') {
      splitContainerRef.current = ref;
      return;
    }
    splitContainerRef.current = ref;
    setTimeout(() => {
      const element = document.querySelector('[data-split-container]');
      if (element) {
        splitContainerRef.current = element as HTMLElement;
      }
    }, 0);
  }, []);

  const setSplitMainPanelsNode = useCallback((ref: any) => {
    if (!ref) return;
    if (ref._nativeNode) {
      splitMainPanelsRef.current = ref._nativeNode;
      return;
    }
    if (typeof ref.getBoundingClientRect === 'function') {
      splitMainPanelsRef.current = ref;
      return;
    }
    splitMainPanelsRef.current = ref;
    setTimeout(() => {
      const element = document.querySelector('[data-split-main-panels]');
      if (element) {
        splitMainPanelsRef.current = element as HTMLElement;
      }
    }, 0);
  }, []);

  const splitSidebarStyles = useMemo(() => ({
    ...blockEditorSidebarProps.styles,
    sidebar: {
      ...blockEditorSidebarProps.styles.sidebar,
      width: '100%',
      minWidth: 0,
      height: '100%',
    },
  }), [blockEditorSidebarProps.styles]);

  const shouldOfferAggressiveMode = useMemo(() => {
    if (fileType !== 'react' && fileType !== 'react-native') {
      return false;
    }
    return isInternalSourceFilePath(filePath);
  }, [filePath, fileType]);

  const renderBlockEditorPreview = useCallback((editorType: 'html' | 'react' | 'react-native', html: string) => (
    <BlockEditorPanel
      fileType={editorType}
      html={html}
      onMessage={handleEditorMessageStable}
      outgoingMessage={iframeCommand}
    />
  ), [
    handleEditorMessageStable,
    iframeCommand,
  ]);

  const renderPreviewFallbackOverlay = useCallback(() => {
    const canUseAggressiveMode =
      shouldOfferAggressiveMode &&
      (!!previewOpenError || shouldOfferAggressiveMode) &&
      !aggressivePreviewMode;

    if (!canUseAggressiveMode && !aggressivePreviewMode) {
      return null;
    }

    return (
      <View style={styles.previewFallbackOverlay}>
        <View style={styles.previewFallbackCard}>
          <Text style={styles.previewFallbackTitle}>
            {aggressivePreviewMode ? 'Aggressive mode is active' : 'Default mode could not open this file'}
          </Text>
          <Text style={styles.previewFallbackText}>
            {aggressivePreviewMode
              ? 'Preview is running in best-effort mode. Some dependencies may be stubbed.'
              : (previewOpenError || 'This file appears to be part of a complex project. If default preview fails, use aggressive mode.')}
          </Text>
        </View>
      </View>
    );
  }, [aggressivePreviewMode, previewOpenError, shouldOfferAggressiveMode]);

  const renderBlockEditorSplitMode = useCallback((editorType: 'html' | 'react' | 'react-native', html: string) => {
    const hasAnyVisiblePanel = showSplitSidebar || showSplitPreview || showSplitCode;
    const previewWidth = showSplitCode ? `${splitLeftWidth * 100}%` : '100%';
    const codeWidth = showSplitPreview ? `${(1 - splitLeftWidth) * 100}%` : '100%';
    const dropTargetNode = externalDropTargetState?.targetId
      ? layersTree?.nodes?.[externalDropTargetState.targetId]
      : null;
    const dropTargetLabel = dropTargetNode
      ? `${dropTargetNode.componentName || dropTargetNode.tagName || 'block'} (${externalDropTargetState?.targetId})`
      : (externalDropTargetState?.targetId || 'not selected');
    const showExternalDropHint =
      (Boolean(externalComponentDrag) && externalDropTargetState?.source === 'component') ||
      (Boolean(externalFileDrag) && externalDropTargetState?.source === 'file');

    return (
      <View style={styles.splitModeRoot}>
        <View style={styles.splitContainer} data-split-container="true" ref={setSplitContainerNode}>
          {showSplitSidebar && (
            <View style={[styles.splitSidebarPane, { width: splitSidebarWidth }]}>
              <BlockEditorSidebar {...blockEditorSidebarProps} styles={splitSidebarStyles} />
            </View>
          )}
          {showSplitSidebar && (showSplitPreview || showSplitCode) && (
            <View
              style={[styles.splitDivider, isResizing && resizeTarget === 'sidebar' && styles.splitDividerActive]}
              onMouseDown={handleSplitResizeStart('sidebar')}
              onTouchStart={handleSplitResizeStart('sidebar')}
            />
          )}
          <View style={styles.splitMainPanels} data-split-main-panels="true" ref={setSplitMainPanelsNode}>
            {showSplitPreview && (
              <View style={[styles.splitLeft, { width: previewWidth, maxWidth: showSplitCode ? '80%' : '100%', minWidth: showSplitCode ? '20%' : 0 }]}>
                <View style={styles.blockEditorPreviewContainer}>
                  <View style={styles.previewViewportHost}>
                    <View
                      style={[
                        styles.previewViewportFrame,
                        previewViewportFrameStyle,
                        canvasDevice === 'mobile' && styles.previewViewportFrameMobile,
                      ]}
                    >
                      {renderBlockEditorPreview(editorType, html)}
                      {renderPreviewFallbackOverlay()}
                      {showExternalDropHint && (
                        <View style={styles.dropTargetIndicator} pointerEvents="none">
                          <Text style={styles.dropTargetIndicatorText}>
                            Insert parent: {dropTargetLabel}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={[
                          styles.quickSaveButton,
                          !(hasStagedChanges || isModified) && styles.quickSaveButtonDisabled,
                        ]}
                        disabled={!(hasStagedChanges || isModified)}
                        onPress={() => {
                          if (hasStagedChanges) {
                            void commitStagedPatches();
                            return;
                          }
                          if (isModified) {
                            void saveFile();
                          }
                        }}
                      >
                        <Text style={styles.quickSaveButtonText}>Save changes</Text>
                      </TouchableOpacity>
                      {hasStagedChanges && (
                        <View style={styles.saveIndicator} pointerEvents="none">
                          <Text style={styles.saveIndicatorText}>* Unsaved changes</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}
            {showSplitPreview && showSplitCode && (
              <View
                style={[styles.splitDivider, isResizing && resizeTarget === 'main' && styles.splitDividerActive]}
                onMouseDown={handleSplitResizeStart('main')}
                onTouchStart={handleSplitResizeStart('main')}
              />
            )}
            {showSplitCode && (
              <View style={[styles.splitRight, { width: codeWidth, maxWidth: showSplitPreview ? '80%' : '100%', minWidth: showSplitPreview ? '20%' : 0 }]}>
                <View style={styles.editorContainer}>
                  <MonacoEditorWrapper
                    value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
                    language={getMonacoLanguage(fileType, filePath)}
                    filePath={filePath}
                    onChange={handleEditorChange}
                    onSave={saveFile}
                    editorRef={monacoEditorRef}
                    onCodeCtrlClick={handleMonacoCtrlClick}
                  />
                  {isModified && (
                    <View style={styles.saveIndicator} pointerEvents="none">
                      <Text style={styles.saveIndicatorText}>* Unsaved changes (Ctrl+S)</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            {!hasAnyVisiblePanel && (
              <View style={styles.splitEmptyState}>
                <Text style={styles.splitEmptyStateText}>Enable at least one panel</Text>
              </View>
            )}
          </View>
        </View>
        {isResizing && (
          <View
            style={[
              styles.splitResizeOverlay,
              resizeTarget === 'sidebar' ? styles.splitResizeOverlaySidebar : styles.splitResizeOverlayMain,
            ]}
            onMouseMove={handleSplitResize}
            onMouseUp={handleSplitResizeEnd}
            onTouchMove={handleSplitResize}
            onTouchEnd={handleSplitResizeEnd}
          />
        )}
      </View>
    );
  }, [
    blockEditorSidebarProps,
    fileContent,
    filePath,
    fileType,
    canvasDevice,
    commitStagedPatches,
    externalComponentDrag,
    externalFileDrag,
    externalDropTargetState,
    handleEditorChange,
    handleSplitResizeStart,
    handleSplitResize,
    handleSplitResizeEnd,
    hasStagedChanges,
    isModified,
    isResizing,
    layersTree,
    resizeTarget,
    renderBlockEditorPreview,
    renderPreviewFallbackOverlay,
    saveFile,
    setSplitContainerNode,
    setSplitMainPanelsNode,
    showSplitCode,
    showSplitPreview,
    showSplitSidebar,
    shouldOfferAggressiveMode,
    previewViewportFrameStyle,
    splitLeftWidth,
    splitSidebarStyles,
    splitSidebarWidth,
    unsavedContent,
  ]);

  if (!filePath) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholderText}>
          Select a file to display
        </Text>
        <Text style={styles.hintText}>
          Supported: HTML, React (JSX/TSX), JavaScript, TypeScript, CSS, JSON
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading file...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!fileContent) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholderText}>
          File content is not loaded
        </Text>
      </View>
    );
  }

    // Рендеринг HTML файлов
  if (fileType === 'html' && fileContent) {
    if (isProcessingHTML) {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>HTML</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Processing dependencies...</Text>
          </View>
        </View>
      );
    }

    const htmlToRender = processedHTML || fileContent;
    console.log('RenderFile: Rendering HTML file, content length:', htmlToRender.length);
    console.log('RenderFile: HTML content preview:', htmlToRender.substring(0, 100));

    return (
      <View style={styles.htmlContainer}>
        {renderContentMetaOverlay('HTML')}
        {viewMode === 'preview' ? (
          <View style={styles.blockEditorPreviewContainer}>
            <View style={styles.previewViewportHost}>
              <View
                style={[
                  styles.previewViewportFrame,
                  previewViewportFrameStyle,
                  canvasDevice === 'mobile' && styles.previewViewportFrameMobile,
                ]}
              >
                <WebView
                  key={`html-${filePath}-${htmlDependencyPaths.length}-${renderVersion}-${(htmlToRender || '').length}`}
                  source={{ html: htmlToRender }}
                  style={styles.webview}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={false}
                  allowExternalScripts={true}
                  onLoad={() => {
                    console.log('RenderFile: HTML content loaded successfully');
                  }}
                  onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('RenderFile: WebView error:', nativeEvent);
                  }}
                />
              </View>
            </View>
          </View>
        ) : viewMode === 'split' ? (
          renderBlockEditorSplitMode('html', editorHTML || htmlToRender)
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>Change history</Text>
            {hasStagedChanges && (
              <Text style={styles.changesStagedHint}>
                There are unsaved editor changes. Switch mode or click "Apply to files".
              </Text>
            )}
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>No changes yet</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Block: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>File: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>
    );
  }
  // Рендеринг React файлов (JSX/TSX)
  if (fileType === 'react' && fileContent) {
    if (isProcessingReact || !reactHTML) {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>React Component</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Processing dependencies...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.htmlContainer}>
        {renderContentMetaOverlay('React', detectedComponentName)}
        {viewMode === 'preview' ? (
          <View style={styles.blockEditorPreviewContainer}>
            <View style={styles.previewViewportHost}>
              <View
                style={[
                  styles.previewViewportFrame,
                  previewViewportFrameStyle,
                  canvasDevice === 'mobile' && styles.previewViewportFrameMobile,
                ]}
              >
                <WebView
                  key={`react-${filePath}-${renderVersion}-${reactHTML?.length || 0}`}
                  source={{ html: reactHTML }}
                  style={styles.webview}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  allowExternalScripts={true}
                  renderLoading={() => (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#667eea" />
                    </View>
                  )}
                  onLoad={() => {
                    console.log('RenderFile: React component loaded successfully');
                  }}
                  onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('RenderFile: WebView error:', nativeEvent);
                    setPreviewOpenError(nativeEvent?.description || nativeEvent?.message || 'WebView failed to load preview');
                  }}
                />
                {renderPreviewFallbackOverlay()}
              </View>
            </View>
          </View>
        ) : viewMode === 'split' ? (
          renderBlockEditorSplitMode('react', editorHTML || reactHTML)
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>Change history</Text>
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>No changes yet</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Block: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>File: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>
    );
  }
  // Рендеринг React Native файлов
  if (fileType === 'react-native' && fileContent) {
    if (isProcessingReactNative || !reactNativeHTML) {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>React Native Component</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Processing dependencies...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.htmlContainer}>
        {renderContentMetaOverlay('React Native', detectedComponentName)}
        {viewMode === 'preview' ? (
          <View style={styles.blockEditorPreviewContainer}>
            <View style={styles.previewViewportHost}>
              <View
                style={[
                  styles.previewViewportFrame,
                  previewViewportFrameStyle,
                  canvasDevice === 'mobile' && styles.previewViewportFrameMobile,
                ]}
              >
                <WebView
                  key={`react-native-${filePath}-${renderVersion}-${reactNativeHTML?.length || 0}`}
                  source={{ html: reactNativeHTML }}
                  style={styles.webview}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  allowExternalScripts={true}
                  renderLoading={() => (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#667eea" />
                    </View>
                  )}
                  onLoad={() => {
                    console.log('RenderFile: React Native component loaded successfully');
                  }}
                  onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('RenderFile: WebView error:', nativeEvent);
                    setPreviewOpenError(nativeEvent?.description || nativeEvent?.message || 'WebView failed to load preview');
                  }}
                />
                {renderPreviewFallbackOverlay()}
              </View>
            </View>
          </View>
        ) : viewMode === 'split' ? (
          renderBlockEditorSplitMode('react-native', editorHTML || reactNativeHTML)
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>Change history</Text>
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>No changes yet</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Block: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>File: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>
    );
  }
  // Рендеринг текстовых файлов (JS, TS, CSS, JSON, Markdown и др.)
  console.log('RenderFile: Rendering text file, type:', fileType, 'content length:', fileContent?.length);
  const monacoLanguage = getMonacoLanguage(fileType, filePath);
  const languageNames = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'css': 'CSS',
    'json': 'JSON',
    'markdown': 'Markdown',
    'html': 'HTML',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'C/C++',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'php': 'PHP',
    'ruby': 'Ruby',
    'shell': 'Shell',
    'xml': 'XML',
    'yaml': 'YAML',
    'sql': 'SQL',
    'dockerfile': 'Dockerfile',
    'makefile': 'Makefile',
    'lua': 'Lua',
    'perl': 'Perl',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'vue': 'Vue',
    'plaintext': 'Text',
  };

  return (
    <View style={styles.textContainer}>
      {renderContentMetaOverlay(languageNames[monacoLanguage as keyof typeof languageNames] || 'Text')}
      <View style={styles.editorContainer}>
        <MonacoEditorWrapper
          value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
          language={monacoLanguage}
          filePath={filePath}
          onChange={handleEditorChange}
          onSave={saveFile}
          editorRef={monacoEditorRef}
          onCodeCtrlClick={handleMonacoCtrlClick}
        />
        {isModified && (
          <View style={styles.saveIndicator}>
            <Text style={styles.saveIndicatorText}>* Unsaved changes (Ctrl+S to save)</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 200,
  },
  placeholderText: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 12,
  },
  hintText: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.5,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.8,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.4)',
    alignItems: 'center',
    maxWidth: '100%',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  htmlContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  webview: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  contentMetaOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '70%',
  },
  fileTypeBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  fileTypeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'none',
  },
  componentNameText: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 11,
    fontWeight: '500',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    padding: 2,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    minWidth: 80,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#667eea',
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  editorContainer: {
    flex: 1,
    width: '100%',
    minHeight: 600,
    backgroundColor: '#1e1e1e',
  },
  blockEditorPreviewContainer: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  previewViewportHost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    overflow: 'auto',
    backgroundColor: '#0f1115',
  },
  previewViewportFrame: {
    position: 'relative',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
  },
  previewViewportFrameMobile: {
    borderRadius: 18,
  },
  previewFallbackOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 1200,
    alignItems: 'center',
  },
  previewFallbackCard: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: 'rgba(12, 18, 31, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.45)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
  },
  previewFallbackTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  previewFallbackText: {
    color: 'rgba(226, 232, 240, 0.82)',
    fontSize: 12,
    lineHeight: 17,
  },
  previewFallbackButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  previewFallbackButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  splitModeRoot: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    position: 'relative',
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
  },
  splitSidebarPane: {
    minWidth: 240,
    maxWidth: 520,
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  splitMainPanels: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  splitLeft: {
    minWidth: 300,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
    height: '100%',
  },
  splitRight: {
    minWidth: 300,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
    height: '100%',
  },
  splitDivider: {
    width: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    cursor: 'col-resize',
    position: 'relative',
    zIndex: 10,
  },
  splitDividerActive: {
    backgroundColor: 'rgba(102, 126, 234, 0.5)',
  },
  splitResizeOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2000,
  },
  splitResizeOverlayMain: {
    cursor: 'col-resize',
  },
  splitResizeOverlaySidebar: {
    cursor: 'col-resize',
  },
  splitEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitEmptyStateText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
  },
  changesContainer: {
    flex: 1,
    width: '100%',
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    padding: 16,
  },
  changesTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  changesStagedHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },
  changesEmpty: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  changesScroll: {
    flex: 1,
  },
  changeItem: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  changeItemTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  changeItemText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  textContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
  },
  codeScrollView: {
    flex: 1,
  },
  codeContainer: {
    padding: 0,
  },
  codeWrapper: {
    backgroundColor: '#1e1e1e',
    padding: 16,
    borderRadius: 4,
  },
  codeText: {
    fontFamily: 'Monaco, "Courier New", monospace',
    fontSize: 14,
    color: '#d4d4d4',
    lineHeight: 20,
  },
  binaryContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
  },
  binaryInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  binaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  binaryPath: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 20,
    textAlign: 'center',
  },
  binaryHint: {
    fontSize: 14,
    color: '#d4d4d4',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 20,
  },
  imagePreview: {
    marginTop: 20,
    marginBottom: 20,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveIndicator: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    zIndex: 1000,
  },
  quickSaveButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.92)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    zIndex: 1001,
  },
  quickSaveButtonDisabled: {
    backgroundColor: 'rgba(100, 116, 139, 0.65)',
  },
  quickSaveButtonText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  dropTargetIndicator: {
    position: 'absolute',
    top: 10,
    left: 170,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.65)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    zIndex: 1001,
  },
  dropTargetIndicatorText: {
    fontSize: 12,
    color: '#e2e8f0',
  },
  saveIndicatorText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '600',
  },
  saveSuccessIndicator: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
  },
  saveSuccessText: {
    color: '#ffffff',
  },
});

export default RenderFile;


