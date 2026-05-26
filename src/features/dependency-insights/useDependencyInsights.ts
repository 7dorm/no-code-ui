import { useEffect, useMemo, useState } from 'react';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { readDirectory, readFile } from '../../shared/api/electron-api';
import { detectComponents } from '../editor/lib/react-processor';
import { resolvePath } from '../editor/lib/path-resolver';
import { getPathBasename, toPosixPath } from '../editor/utils';

type SelectedFileTarget = {
  filePath: string;
  componentName?: string | null;
  selectionKey?: string;
} | null;

type ImportKind = 'module' | 'css-import' | 'html-link' | 'html-script';
type FileKind = 'script' | 'style' | 'html';

type ImportSpecifierRef = {
  importedName: string;
  localName: string;
};

type FileImportRef = {
  kind: ImportKind;
  sourcePath: string;
  resolvedPath: string | null;
  defaultLocalName: string | null;
  namespaceLocalName: string | null;
  namedImports: ImportSpecifierRef[];
  sideEffectOnly: boolean;
};

type AnalyzedComponent = {
  name: string;
  hasDefaultExport: boolean;
  hasNamedExport: boolean;
};

type ProjectFileAnalysis = {
  filePath: string;
  fileKind: FileKind;
  imports: FileImportRef[];
  componentUsages: Record<string, number>;
  detectedComponents: AnalyzedComponent[];
};

type ProjectUsageIndex = {
  files: ProjectFileAnalysis[];
  filesByPath: Record<string, ProjectFileAnalysis>;
  scannedFileCount: number;
};

export type DependencyInsightItem = {
  importerPath: string;
  importerLabel: string;
  importKinds: Array<'default' | 'named' | 'namespace' | 'side-effect' | 'css-import' | 'html-link' | 'html-script'>;
  matchedLocalNames: string[];
  matchedImportedNames: string[];
  usageCount: number;
};

export type DependencyInsight = {
  kind: 'component' | 'style' | 'file';
  targetPath: string;
  targetLabel: string;
  targetSubtitle: string;
  importerCount: number;
  totalUsageCount: number;
  items: DependencyInsightItem[];
  note?: string | null;
};

type UseDependencyInsightsParams = {
  projectPath: string | null;
  selectedFile: SelectedFileTarget;
  refreshToken?: number;
};

type UseDependencyInsightsResult = {
  indexLoading: boolean;
  indexError: string | null;
  scannedFileCount: number;
  insight: DependencyInsight | null;
};

const SCRIPT_EXT_RE = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;
const STYLE_EXT_RE = /\.(css|scss|sass|less)$/i;
const HTML_EXT_RE = /\.(html|htm)$/i;
const QUERY_SUFFIX_RE = /[?#].*$/;
const RESOLVE_EXTENSIONS = [
  '',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
];
const SKIP_DIR_NAMES = new Set([
  '.git',
  '.idea',
  '.mrpak',
  '.next',
  '.nuxt',
  '.turbo',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'tmp',
]);

function normalizePath(value: string | null | undefined) {
  return toPosixPath(String(value || '')).replace(/^\/+/, '');
}

function stripImportQuery(value: string | null | undefined) {
  return String(value || '').replace(QUERY_SUFFIX_RE, '').trim();
}

function isLocalProjectImport(importPath: string) {
  const value = String(importPath || '').trim();
  return value.startsWith('./') || value.startsWith('../') || value.startsWith('/') || value.startsWith('@/');
}

function shouldAnalyzeFile(filePath: string) {
  const normalized = normalizePath(filePath);
  return SCRIPT_EXT_RE.test(normalized) || STYLE_EXT_RE.test(normalized) || HTML_EXT_RE.test(normalized);
}

function shouldSkipDirectory(dirPath: string) {
  const normalized = normalizePath(dirPath);
  const lastSegment = normalized.split('/').filter(Boolean).pop() || '';
  return SKIP_DIR_NAMES.has(lastSegment);
}

function incrementCounter(target: Record<string, number>, key: string | null | undefined) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function getJsxName(node: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string | null {
  if (t.isJSXIdentifier(node)) {
    return node.name;
  }
  if (t.isJSXMemberExpression(node)) {
    const objectName = getJsxName(node.object);
    const propertyName = getJsxName(node.property);
    return objectName && propertyName ? `${objectName}.${propertyName}` : null;
  }
  if (t.isJSXNamespacedName(node)) {
    return `${node.namespace.name}:${node.name.name}`;
  }
  return null;
}

function getMemberExpressionName(node: t.Node | null | undefined): string | null {
  if (!node) return null;
  if (t.isIdentifier(node)) return node.name;
  if (t.isThisExpression(node)) return 'this';
  if (t.isMemberExpression(node)) {
    const objectName = getMemberExpressionName(node.object);
    const propertyName = node.computed
      ? (t.isStringLiteral(node.property) ? node.property.value : null)
      : getMemberExpressionName(node.property);
    return objectName && propertyName ? `${objectName}.${propertyName}` : null;
  }
  return null;
}

function getCreateElementUsageName(node: t.CallExpression): string | null {
  const callee = node.callee;
  const isCreateElement =
    (t.isIdentifier(callee) && callee.name === 'createElement') ||
    (t.isMemberExpression(callee) &&
      t.isIdentifier(callee.object, { name: 'React' }) &&
      t.isIdentifier(callee.property, { name: 'createElement' }));
  if (!isCreateElement) return null;

  const firstArg = node.arguments[0];
  if (t.isIdentifier(firstArg)) return firstArg.name;
  if (t.isMemberExpression(firstArg)) return getMemberExpressionName(firstArg);
  return null;
}

async function collectProjectFiles(dirPath = ''): Promise<string[]> {
  const result = await readDirectory(dirPath);
  if (!result?.success || !Array.isArray(result.items)) {
    return [];
  }

  const files: string[] = [];
  const childDirs: string[] = [];

  for (const item of result.items) {
    const itemPath = normalizePath(item?.path);
    if (!itemPath) continue;
    if (item?.isDirectory) {
      if (!shouldSkipDirectory(itemPath)) {
        childDirs.push(itemPath);
      }
      continue;
    }
    if (item?.isFile && shouldAnalyzeFile(itemPath)) {
      files.push(itemPath);
    }
  }

  childDirs.sort((a, b) => a.localeCompare(b));
  files.sort((a, b) => a.localeCompare(b));

  for (const childDir of childDirs) {
    files.push(...(await collectProjectFiles(childDir)));
  }

  return files;
}

async function resolveLocalImportPath(
  fromFilePath: string,
  importPath: string,
  cache: Map<string, Promise<string | null>>
) {
  const normalizedFrom = normalizePath(fromFilePath);
  const sourceValue = stripImportQuery(importPath);
  if (!normalizedFrom || !isLocalProjectImport(sourceValue)) {
    return null;
  }

  const cacheKey = `${normalizedFrom}::${sourceValue}`;
  if (!cache.has(cacheKey)) {
    cache.set(
      cacheKey,
      (async () => {
        try {
          const resolvedBase = normalizePath(await resolvePath(normalizedFrom, sourceValue));
          if (!resolvedBase) {
            return null;
          }

          const directRead = await readFile(resolvedBase);
          if (directRead?.success) {
            return resolvedBase;
          }

          for (const ext of RESOLVE_EXTENSIONS) {
            if (!ext) continue;
            const withExt = `${resolvedBase}${ext}`;
            const readResult = await readFile(withExt);
            if (readResult?.success) {
              return normalizePath(withExt);
            }
          }

          for (const ext of RESOLVE_EXTENSIONS) {
            const indexCandidate = `${resolvedBase}/index${ext}`;
            const readResult = await readFile(indexCandidate);
            if (readResult?.success) {
              return normalizePath(indexCandidate);
            }
          }

          return resolvedBase;
        } catch {
          return null;
        }
      })()
    );
  }

  return cache.get(cacheKey) as Promise<string | null>;
}

async function resolveImportRecordPaths(
  imports: FileImportRef[],
  filePath: string,
  resolveCache: Map<string, Promise<string | null>>
) {
  await Promise.all(
    imports.map(async (record) => {
      if (!isLocalProjectImport(record.sourcePath)) {
        record.resolvedPath = null;
        return;
      }
      record.resolvedPath = await resolveLocalImportPath(filePath, record.sourcePath, resolveCache);
    })
  );
}

async function analyzeScriptFile(
  filePath: string,
  code: string,
  resolveCache: Map<string, Promise<string | null>>
): Promise<ProjectFileAnalysis> {
  const imports: FileImportRef[] = [];
  const componentUsages: Record<string, number> = {};
  let detectedComponents: AnalyzedComponent[] = detectComponents(code).map((component) => ({
    name: String(component.name || ''),
    hasDefaultExport: component.exportType === 'default',
    hasNamedExport: component.exportType === 'named',
  }));

  try {
    const ast = parse(String(code || ''), {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'decorators-legacy',
        'dynamicImport',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });

    const defaultExportNames = new Set<string>();
    const namedExportNames = new Set<string>();

    ast.program.body.forEach((statement: any) => {
      if (t.isExportDefaultDeclaration(statement)) {
        const declaration = statement.declaration;
        if ((t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) && declaration.id?.name) {
          defaultExportNames.add(declaration.id.name);
        } else if (t.isIdentifier(declaration)) {
          defaultExportNames.add(declaration.name);
        }
        return;
      }

      if (!t.isExportNamedDeclaration(statement)) return;

      if (statement.declaration) {
        if ((t.isFunctionDeclaration(statement.declaration) || t.isClassDeclaration(statement.declaration)) && statement.declaration.id?.name) {
          namedExportNames.add(statement.declaration.id.name);
          return;
        }
        if (t.isVariableDeclaration(statement.declaration)) {
          statement.declaration.declarations.forEach((declaration: any) => {
            if (t.isIdentifier(declaration.id)) {
              namedExportNames.add(declaration.id.name);
            }
          });
        }
        return;
      }

      if (!statement.source) {
        statement.specifiers.forEach((specifier: any) => {
          if (!t.isExportSpecifier(specifier)) return;
          if (t.isIdentifier(specifier.local)) {
            namedExportNames.add(specifier.local.name);
          }
        });
      }
    });

    detectedComponents = detectedComponents.map((component) => ({
      ...component,
      hasDefaultExport: component.hasDefaultExport || defaultExportNames.has(component.name),
      hasNamedExport: component.hasNamedExport || namedExportNames.has(component.name),
    }));

    traverse(ast, {
      ImportDeclaration(path) {
        const sourcePath = String(path.node.source.value || '').trim();
        const record: FileImportRef = {
          kind: 'module',
          sourcePath,
          resolvedPath: null,
          defaultLocalName: null,
          namespaceLocalName: null,
          namedImports: [],
          sideEffectOnly: path.node.specifiers.length === 0,
        };

        for (const specifier of path.node.specifiers) {
          if (t.isImportDefaultSpecifier(specifier)) {
            record.defaultLocalName = specifier.local.name;
            continue;
          }
          if (t.isImportNamespaceSpecifier(specifier)) {
            record.namespaceLocalName = specifier.local.name;
            continue;
          }
          if (t.isImportSpecifier(specifier)) {
            const importedName = t.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : specifier.imported.value;
            record.namedImports.push({
              importedName: String(importedName || ''),
              localName: specifier.local.name,
            });
          }
        }

        imports.push(record);
      },
      JSXOpeningElement(path) {
        incrementCounter(componentUsages, getJsxName(path.node.name));
      },
      CallExpression(path) {
        incrementCounter(componentUsages, getCreateElementUsageName(path.node));
      },
    });
  } catch {
    const fallbackImportRegex = /import\s+(?:[\s\S]*?)from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
    for (const match of String(code || '').matchAll(fallbackImportRegex)) {
      const sourcePath = String(match[1] || match[2] || '').trim();
      if (!sourcePath) continue;
      imports.push({
        kind: 'module',
        sourcePath,
        resolvedPath: null,
        defaultLocalName: null,
        namespaceLocalName: null,
        namedImports: [],
        sideEffectOnly: true,
      });
    }
  }

  await resolveImportRecordPaths(imports, filePath, resolveCache);

  return {
    filePath,
    fileKind: 'script',
    imports,
    componentUsages,
    detectedComponents,
  };
}

async function analyzeStyleFile(
  filePath: string,
  code: string,
  resolveCache: Map<string, Promise<string | null>>
): Promise<ProjectFileAnalysis> {
  const imports: FileImportRef[] = [];
  const importRegex = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?/gi;

  for (const match of String(code || '').matchAll(importRegex)) {
    const sourcePath = String(match[1] || '').trim();
    if (!sourcePath) continue;
    imports.push({
      kind: 'css-import',
      sourcePath,
      resolvedPath: null,
      defaultLocalName: null,
      namespaceLocalName: null,
      namedImports: [],
      sideEffectOnly: true,
    });
  }

  await resolveImportRecordPaths(imports, filePath, resolveCache);

  return {
    filePath,
    fileKind: 'style',
    imports,
    componentUsages: {},
    detectedComponents: [],
  };
}

async function analyzeHtmlFile(
  filePath: string,
  code: string,
  resolveCache: Map<string, Promise<string | null>>
): Promise<ProjectFileAnalysis> {
  const imports: FileImportRef[] = [];
  const linkRegex = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const scriptRegex = /<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi;

  for (const match of String(code || '').matchAll(linkRegex)) {
    const sourcePath = String(match[1] || '').trim();
    if (!sourcePath) continue;
    imports.push({
      kind: 'html-link',
      sourcePath,
      resolvedPath: null,
      defaultLocalName: null,
      namespaceLocalName: null,
      namedImports: [],
      sideEffectOnly: true,
    });
  }

  for (const match of String(code || '').matchAll(scriptRegex)) {
    const sourcePath = String(match[1] || '').trim();
    if (!sourcePath) continue;
    imports.push({
      kind: 'html-script',
      sourcePath,
      resolvedPath: null,
      defaultLocalName: null,
      namespaceLocalName: null,
      namedImports: [],
      sideEffectOnly: true,
    });
  }

  await resolveImportRecordPaths(imports, filePath, resolveCache);

  return {
    filePath,
    fileKind: 'html',
    imports,
    componentUsages: {},
    detectedComponents: [],
  };
}

async function buildProjectUsageIndex(): Promise<ProjectUsageIndex> {
  const filePaths = await collectProjectFiles('');
  const resolveCache = new Map<string, Promise<string | null>>();
  const files: ProjectFileAnalysis[] = [];

  for (const filePath of filePaths) {
    const readResult = await readFile(filePath);
    if (!readResult?.success) continue;
    const code = String(readResult.content || '');

    if (SCRIPT_EXT_RE.test(filePath)) {
      files.push(await analyzeScriptFile(filePath, code, resolveCache));
      continue;
    }
    if (STYLE_EXT_RE.test(filePath)) {
      files.push(await analyzeStyleFile(filePath, code, resolveCache));
      continue;
    }
    if (HTML_EXT_RE.test(filePath)) {
      files.push(await analyzeHtmlFile(filePath, code, resolveCache));
    }
  }

  const filesByPath = files.reduce<Record<string, ProjectFileAnalysis>>((acc, file) => {
    acc[file.filePath] = file;
    return acc;
  }, {});

  return {
    files,
    filesByPath,
    scannedFileCount: files.length,
  };
}

function addComponentInsightFromImport(
  entry: DependencyInsightItem,
  importer: ProjectFileAnalysis,
  importRef: FileImportRef,
  exportInfo: { hasDefaultExport: boolean; hasNamedExport: boolean } | null,
  componentName: string
) {
  if (exportInfo?.hasDefaultExport && importRef.defaultLocalName) {
    entry.importKinds.push('default');
    entry.matchedImportedNames.push('default');
    entry.matchedLocalNames.push(importRef.defaultLocalName);
    entry.usageCount += importer.componentUsages[importRef.defaultLocalName] || 0;
  }

  if (exportInfo?.hasNamedExport) {
    for (const namedImport of importRef.namedImports) {
      if (namedImport.importedName !== componentName) continue;
      entry.importKinds.push('named');
      entry.matchedImportedNames.push(componentName);
      entry.matchedLocalNames.push(namedImport.localName);
      entry.usageCount += importer.componentUsages[namedImport.localName] || 0;
    }

    if (importRef.namespaceLocalName) {
      const memberName = `${importRef.namespaceLocalName}.${componentName}`;
      const namespaceUsages = importer.componentUsages[memberName] || 0;
      if (namespaceUsages > 0) {
        entry.importKinds.push('namespace');
        entry.matchedImportedNames.push(componentName);
        entry.matchedLocalNames.push(memberName);
        entry.usageCount += namespaceUsages;
      }
    }
  }
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function buildInsightForSelection(index: ProjectUsageIndex, selectedFile: SelectedFileTarget): DependencyInsight | null {
  if (!selectedFile?.filePath) {
    return null;
  }

  const targetPath = normalizePath(selectedFile.filePath);
  if (!targetPath) {
    return null;
  }

  const targetAnalysis = index.filesByPath[targetPath] || null;
  const selectedComponentName = String(selectedFile.componentName || '').trim();
  const targetBaseName = getPathBasename(targetPath);

  if (selectedComponentName) {
    const detectedComponent = targetAnalysis?.detectedComponents?.find((item) => item.name === selectedComponentName) || null;

    const items = index.files
      .filter((file) => file.filePath !== targetPath)
      .map((file) => {
        const entry: DependencyInsightItem = {
          importerPath: file.filePath,
          importerLabel: getPathBasename(file.filePath),
          importKinds: [],
          matchedLocalNames: [],
          matchedImportedNames: [],
          usageCount: 0,
        };

        for (const importRef of file.imports) {
          if (importRef.kind !== 'module' || importRef.resolvedPath !== targetPath) continue;
          addComponentInsightFromImport(entry, file, importRef, detectedComponent, selectedComponentName);
        }

        entry.importKinds = uniq(entry.importKinds);
        entry.matchedImportedNames = uniq(entry.matchedImportedNames);
        entry.matchedLocalNames = uniq(entry.matchedLocalNames);
        return entry;
      })
      .filter((entry) => entry.importKinds.length > 0)
      .sort((a, b) => (b.usageCount - a.usageCount) || a.importerPath.localeCompare(b.importerPath));

    const importerCount = items.length;
    const totalUsageCount = items.reduce((sum, item) => sum + item.usageCount, 0);

    return {
      kind: 'component',
      targetPath,
      targetLabel: selectedComponentName,
      targetSubtitle: targetBaseName,
      importerCount,
      totalUsageCount,
      items,
      note:
        detectedComponent && !detectedComponent.hasDefaultExport && !detectedComponent.hasNamedExport
          ? 'Компонент не экспортируется из файла, поэтому внешние использования не определены.'
          : null,
    };
  }

  const kind: DependencyInsight['kind'] = STYLE_EXT_RE.test(targetPath) ? 'style' : 'file';
  const items = index.files
    .filter((file) => file.filePath !== targetPath)
    .map((file) => {
      const entry: DependencyInsightItem = {
        importerPath: file.filePath,
        importerLabel: getPathBasename(file.filePath),
        importKinds: [],
        matchedLocalNames: [],
        matchedImportedNames: [],
        usageCount: 0,
      };

      for (const importRef of file.imports) {
        if (importRef.resolvedPath !== targetPath) continue;
        if (importRef.kind === 'module') {
          if (importRef.defaultLocalName) {
            entry.importKinds.push('default');
            entry.matchedLocalNames.push(importRef.defaultLocalName);
            entry.usageCount += file.componentUsages[importRef.defaultLocalName] || 0;
          }
          if (importRef.namespaceLocalName) {
            entry.importKinds.push('namespace');
            entry.matchedLocalNames.push(importRef.namespaceLocalName);
          }
          if (importRef.namedImports.length > 0) {
            entry.importKinds.push('named');
            for (const namedImport of importRef.namedImports) {
              entry.matchedImportedNames.push(namedImport.importedName);
              entry.matchedLocalNames.push(namedImport.localName);
              entry.usageCount += file.componentUsages[namedImport.localName] || 0;
            }
          }
          if (importRef.sideEffectOnly || (!importRef.defaultLocalName && !importRef.namespaceLocalName && importRef.namedImports.length === 0)) {
            entry.importKinds.push('side-effect');
          }
          continue;
        }

        entry.importKinds.push(importRef.kind);
      }

      entry.importKinds = uniq(entry.importKinds);
      entry.matchedImportedNames = uniq(entry.matchedImportedNames);
      entry.matchedLocalNames = uniq(entry.matchedLocalNames);
      return entry;
    })
    .filter((entry) => entry.importKinds.length > 0)
    .sort((a, b) => a.importerPath.localeCompare(b.importerPath));

  return {
    kind,
    targetPath,
    targetLabel: targetBaseName,
    targetSubtitle: kind === 'style' ? 'Файл стилей' : 'Файл проекта',
    importerCount: items.length,
    totalUsageCount: items.reduce((sum, item) => sum + item.usageCount, 0),
    items,
    note: null,
  };
}

export function useDependencyInsights({
  projectPath,
  selectedFile,
  refreshToken = 0,
}: UseDependencyInsightsParams): UseDependencyInsightsResult {
  const [index, setIndex] = useState<ProjectUsageIndex | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath) {
      setIndex(null);
      setIndexLoading(false);
      setIndexError(null);
      return;
    }

    let disposed = false;
    setIndexLoading(true);
    setIndexError(null);

    void buildProjectUsageIndex()
      .then((nextIndex) => {
        if (disposed) return;
        setIndex(nextIndex);
      })
      .catch((error) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        setIndexError(message);
        setIndex(null);
      })
      .finally(() => {
        if (!disposed) {
          setIndexLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [projectPath, refreshToken]);

  const insight = useMemo(() => {
    if (!index || !selectedFile?.filePath) {
      return null;
    }
    return buildInsightForSelection(index, selectedFile);
  }, [index, selectedFile]);

  return {
    indexLoading,
    indexError,
    scannedFileCount: index?.scannedFileCount || 0,
    insight,
  };
}
