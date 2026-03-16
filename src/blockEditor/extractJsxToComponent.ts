import { parse } from '@babel/parser';
import generate from '@babel/generator';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

type ExtractParams = {
  code: string;
  filePath: string;
  selectedIds: string[];
  componentName: string;
  fileType: 'react' | 'react-native';
  blockMap?: Record<string, any>;
};

type ExtractResult =
  | {
      ok: true;
      newMainCode: string;
      newComponentCode: string;
      importPath: string;
      selectedCount: number;
    }
  | {
      ok: false;
      error: string;
    };

const RN_BUILTIN_TAGS = new Set([
  'View',
  'Text',
  'TouchableOpacity',
  'Pressable',
  'Image',
  'ScrollView',
  'FlatList',
  'SectionList',
  'TextInput',
  'SafeAreaView',
  'Switch',
  'ActivityIndicator',
]);

function getParserPlugins(filePath: string) {
  const lower = String(filePath || '').toLowerCase();
  const plugins: any[] = ['jsx'];
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    plugins.push(
      'typescript',
      'classProperties',
      'decorators-legacy',
      'optionalChaining',
      'nullishCoalescingOperator'
    );
  }
  return plugins;
}

function normalizeSelectedIds(ids: string[]) {
  return Array.from(
    new Set(
      (ids || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .map((id) => {
          const m = id.match(/^(.*):\d+$/);
          return m ? m[1] : id;
        })
    )
  );
}

function getIdFromOpeningElement(node: any): string | null {
  if (!node || !node.attributes) return null;
  for (const attr of node.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
    const attrName = attr.name.name;
    if (attrName !== 'data-no-code-ui-id' && attrName !== 'data-mrpak-id') continue;
    if (t.isStringLiteral(attr.value)) return attr.value.value;
    if (t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression)) {
      return attr.value.expression.value;
    }
  }
  return null;
}

function cloneNode<T>(node: T): T {
  return t.cloneNode(node as any, true) as any;
}

function stripMrpakAttrsFromJsx(node: any) {
  if (!node) return node;
  traverse(
    t.file(t.program([t.expressionStatement(t.isExpression(node) ? node : t.identifier('undefined'))])),
    {
      JSXOpeningElement(path: any) {
        path.node.attributes = (path.node.attributes || []).filter((attr: any) => {
          if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return true;
          return attr.name.name !== 'data-no-code-ui-id' && attr.name.name !== 'data-mrpak-id';
        });
      },
    },
    undefined,
    undefined
  );
  return node;
}

function collectReferencedIdentifiers(node: any): Set<string> {
  const refs = new Set<string>();
  if (!node) return refs;
  traverse(
    t.file(t.program([t.expressionStatement(t.isExpression(node) ? node : t.identifier('undefined'))])),
    {
      Identifier(path: any) {
        if (!path.isReferencedIdentifier()) return;
        const name = String(path.node.name || '');
        if (!name) return;
        refs.add(name);
      },
      JSXIdentifier() {
        // Ignore JSX tag identifiers.
      },
    },
    undefined,
    undefined
  );
  return refs;
}

function collectStatementRefs(stmt: any): Set<string> {
  const refs = new Set<string>();
  if (!stmt) return refs;
  traverse(
    t.file(t.program([stmt])),
    {
      Identifier(path: any) {
        if (!path.isReferencedIdentifier()) return;
        refs.add(String(path.node.name || ''));
      },
    },
    undefined,
    undefined
  );
  return refs;
}

function resolveTargetsFromBlockMap(ids: string[], blockMap?: Record<string, any>) {
  const result = new Map<string, { start: number; end: number }>();
  if (!blockMap) return result;
  const keys = Object.keys(blockMap);
  ids.forEach((id) => {
    const direct = blockMap[id];
    if (direct && Number.isFinite(direct.start) && Number.isFinite(direct.end)) {
      result.set(id, { start: Number(direct.start), end: Number(direct.end) });
      return;
    }
    const pref = `${id}:`;
    const key = keys.find((k) => k === id || k.startsWith(pref));
    const entry = key ? blockMap[key] : null;
    if (entry && Number.isFinite(entry.start) && Number.isFinite(entry.end)) {
      result.set(id, { start: Number(entry.start), end: Number(entry.end) });
    }
  });
  return result;
}

function buildComponentAst(params: {
  jsxNode: any;
  componentName: string;
  fileType: 'react' | 'react-native';
  importDecls: t.ImportDeclaration[];
  topLevelDeps: t.Statement[];
  propNames: string[];
}) {
  const { jsxNode, componentName, fileType, importDecls, topLevelDeps, propNames } = params;
  const programBody: any[] = [];

  if (fileType === 'react') {
    const hasReactDefault = importDecls.some(
      (decl) => decl.source.value === 'react' && decl.specifiers.some((s) => t.isImportDefaultSpecifier(s))
    );
    if (!hasReactDefault) {
      programBody.push(
        t.importDeclaration(
          [t.importDefaultSpecifier(t.identifier('React'))],
          t.stringLiteral('react')
        )
      );
    }
  } else {
    const usedRnTags = new Set<string>();
    traverse(
      t.file(t.program([t.expressionStatement(jsxNode)])),
      {
        JSXOpeningElement(path: any) {
          const name = path.node?.name;
          if (t.isJSXIdentifier(name)) {
            const tag = String(name.name || '');
            if (RN_BUILTIN_TAGS.has(tag)) usedRnTags.add(tag);
          }
        },
      },
      undefined,
      undefined
    );
    if (usedRnTags.size > 0) {
      const rnDecl = importDecls.find((decl) => decl.source.value === 'react-native');
      if (rnDecl) {
        const existing = new Set<string>();
        rnDecl.specifiers.forEach((s) => {
          if (t.isImportSpecifier(s) && t.isIdentifier(s.local)) existing.add(s.local.name);
        });
        usedRnTags.forEach((tag) => {
          if (!existing.has(tag)) {
            rnDecl.specifiers.push(t.importSpecifier(t.identifier(tag), t.identifier(tag)));
          }
        });
      } else {
        const rnSpecifiers = Array.from(usedRnTags)
          .sort()
          .map((tag) => t.importSpecifier(t.identifier(tag), t.identifier(tag)));
        importDecls.push(t.importDeclaration(rnSpecifiers, t.stringLiteral('react-native')));
      }
    }
  }

  importDecls.forEach((decl) => programBody.push(decl));
  topLevelDeps.forEach((stmt) => programBody.push(stmt));

  const fnParams = propNames.length
    ? [
        t.objectPattern(
          propNames.map((name) =>
            t.objectProperty(t.identifier(name), t.identifier(name), false, true)
          )
        ),
      ]
    : [];
  const fnBody = [t.returnStatement(jsxNode)];
  const componentFn = t.functionDeclaration(
    t.identifier(componentName),
    fnParams,
    t.blockStatement(fnBody)
  );
  programBody.push(componentFn);
  programBody.push(t.exportDefaultDeclaration(t.identifier(componentName)));

  return t.file(t.program(programBody));
}

function buildComponentUsage(componentName: string, propNames: string[]) {
  return t.jsxElement(
    t.jsxOpeningElement(
      t.jsxIdentifier(componentName),
      propNames.map((name) =>
        t.jsxAttribute(
          t.jsxIdentifier(name),
          t.jsxExpressionContainer(t.identifier(name))
        )
      ),
      true
    ),
    null,
    [],
    true
  );
}

function ensureImport(ast: any, componentName: string, importPath: string) {
  let hasImport = false;
  let insertIndex = 0;
  for (let i = 0; i < ast.program.body.length; i += 1) {
    const node = ast.program.body[i];
    if (t.isImportDeclaration(node)) {
      insertIndex = i + 1;
      for (const spec of node.specifiers) {
        if (t.isImportDefaultSpecifier(spec) && spec.local?.name === componentName) {
          hasImport = true;
        }
      }
    }
  }
  if (hasImport) return;
  ast.program.body.splice(
    insertIndex,
    0,
    t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier(componentName))],
      t.stringLiteral(importPath)
    )
  );
}

export function extractJsxToComponent(params: ExtractParams): ExtractResult {
  const { code, filePath, selectedIds, componentName, fileType, blockMap } = params;
  const normalizedIds = normalizeSelectedIds(selectedIds);
  if (normalizedIds.length === 0) {
    return { ok: false, error: 'Не выбраны блоки для выноса.' };
  }

  let ast: any;
  try {
    ast = parse(String(code ?? ''), {
      sourceType: 'module',
      plugins: getParserPlugins(filePath),
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (e: any) {
    return { ok: false, error: `Ошибка парсинга файла: ${e?.message || e}` };
  }

  const targetsByRange = resolveTargetsFromBlockMap(normalizedIds, blockMap);
  const idToPath = new Map<string, any>();

  traverse(ast, {
    JSXOpeningElement(path: any) {
      const nodeStart = Number(path.node?.start);
      const nodeEnd = Number(path.node?.end);

      for (const [id, entry] of targetsByRange.entries()) {
        if (idToPath.has(id)) continue;
        if (entry.start === nodeStart && entry.end === nodeEnd) {
          const jsxElementPath = path.findParent((p: any) => t.isJSXElement(p.node));
          if (jsxElementPath) idToPath.set(id, jsxElementPath);
        }
      }

      const fallbackId = getIdFromOpeningElement(path.node);
      if (fallbackId && normalizedIds.includes(fallbackId) && !idToPath.has(fallbackId)) {
        const jsxElementPath = path.findParent((p: any) => t.isJSXElement(p.node));
        if (jsxElementPath) idToPath.set(fallbackId, jsxElementPath);
      }
    },
  });

  const targetPaths = normalizedIds.map((id) => idToPath.get(id)).filter(Boolean);
  if (targetPaths.length !== normalizedIds.length) {
    const found = new Set(Array.from(idToPath.keys()));
    const missing = normalizedIds.filter((id) => !found.has(id));
    return { ok: false, error: `Не удалось найти выбранные блоки в AST: ${missing.join(', ')}` };
  }

  let extractedJsxNode: any;
  if (targetPaths.length === 1) {
    const replacementTargetPath = targetPaths[0];
    extractedJsxNode = cloneNode(replacementTargetPath.node);
  } else {
    const parentPath = targetPaths[0].parentPath;
    const allSameParent = targetPaths.every((p) => p.parentPath === parentPath);
    if (!allSameParent || !(t.isJSXElement(parentPath?.node) || t.isJSXFragment(parentPath?.node))) {
      return { ok: false, error: 'Множественный вынос возможен только для sibling-элементов одного родителя.' };
    }

    const parentChildren = parentPath.node.children || [];
    const indexed = targetPaths
      .map((p) => ({ path: p, idx: parentChildren.indexOf(p.node) }))
      .filter((entry) => entry.idx >= 0)
      .sort((a, b) => a.idx - b.idx);

    if (indexed.length !== targetPaths.length) {
      return { ok: false, error: 'Не удалось определить порядок выбранных sibling-элементов.' };
    }

    const clones = indexed.map((entry) => cloneNode(entry.path.node));
    extractedJsxNode = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), clones);

    const firstIdx = indexed[0].idx;
    for (let i = indexed.length - 1; i >= 1; i -= 1) {
      parentChildren.splice(indexed[i].idx, 1);
    }
  }

  extractedJsxNode = stripMrpakAttrsFromJsx(extractedJsxNode);

  const initialRefs = collectReferencedIdentifiers(extractedJsxNode);

  const firstTarget = targetPaths[0];
  const enclosingFnPath = firstTarget.findParent((p: any) =>
    p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression()
  );
  const programPath = firstTarget.findParent((p: any) => p.isProgram());

  const topVarMap = new Map<string, t.Statement>();
  const topFnMap = new Map<string, t.FunctionDeclaration>();
  const importLocalMap = new Map<string, { source: string; specifier: t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier }>();

  if (programPath) {
    for (const stmt of programPath.node.body) {
      if (t.isImportDeclaration(stmt)) {
        stmt.specifiers.forEach((spec) => {
          if (t.isIdentifier(spec.local)) {
            importLocalMap.set(spec.local.name, {
              source: String(stmt.source.value || ''),
              specifier: cloneNode(spec),
            });
          }
        });
      } else if (t.isVariableDeclaration(stmt)) {
        stmt.declarations.forEach((decl) => {
          if (t.isIdentifier(decl.id)) {
            topVarMap.set(
              decl.id.name,
              t.variableDeclaration(stmt.kind, [cloneNode(decl)])
            );
          }
        });
      } else if (t.isFunctionDeclaration(stmt) && stmt.id && t.isIdentifier(stmt.id)) {
        topFnMap.set(stmt.id.name, cloneNode(stmt));
      }
    }
  }

  const ignoreRefs = new Set([
    'undefined',
    'NaN',
    'Infinity',
    'Math',
    'Date',
    'Number',
    'String',
    'Boolean',
    'Object',
    'Array',
    'JSON',
    'console',
    'window',
    'document',
    'globalThis',
  ]);

  const importBySource = new Map<string, t.ImportDeclaration>();
  const topDepStmts: t.Statement[] = [];
  const resolvedNames = new Set<string>();
  const propNames = new Set<string>();

  const componentScope = enclosingFnPath?.scope;

  const addImportSpecifier = (name: string) => {
    const meta = importLocalMap.get(name);
    if (!meta) return;
    const source = meta.source;
    if (!source) return;
    const current = importBySource.get(source);
    if (!current) {
      importBySource.set(
        source,
        t.importDeclaration([cloneNode(meta.specifier)], t.stringLiteral(source))
      );
      return;
    }
    const has = current.specifiers.some((s) => t.isIdentifier((s as any).local) && (s as any).local.name === name);
    if (!has) current.specifiers.push(cloneNode(meta.specifier));
  };

  const resolveName = (name: string) => {
    if (!name || resolvedNames.has(name) || ignoreRefs.has(name)) return;
    resolvedNames.add(name);

    const componentBinding = componentScope?.getBinding(name);
    if (
      componentBinding &&
      componentBinding.scope === componentScope &&
      !topVarMap.has(name) &&
      !topFnMap.has(name) &&
      !importLocalMap.has(name)
    ) {
      propNames.add(name);
      return;
    }

    if (topVarMap.has(name)) {
      const stmt = cloneNode(topVarMap.get(name)!);
      const refs = collectStatementRefs(stmt);
      refs.forEach((r) => resolveName(r));
      topDepStmts.push(stmt);
      return;
    }

    if (topFnMap.has(name)) {
      const fn = cloneNode(topFnMap.get(name)!);
      const refs = collectStatementRefs(fn);
      refs.forEach((r) => resolveName(r));
      topDepStmts.push(fn);
      return;
    }

    addImportSpecifier(name);
  };

  initialRefs.forEach((name) => resolveName(name));

  const sortedPropNames = Array.from(propNames).sort();
  const replacementNode = buildComponentUsage(componentName, sortedPropNames);

  if (targetPaths.length === 1) {
    targetPaths[0].replaceWith(replacementNode);
  } else {
    const parentChildren = targetPaths[0].parentPath.node.children || [];
    const firstIdx = parentChildren.findIndex((child: any) => child === targetPaths[0].node);
    if (firstIdx >= 0) {
      parentChildren[firstIdx] = replacementNode;
    }
  }

  const importPath = `./${componentName}`;
  ensureImport(ast, componentName, importPath);

  const mainGenerated = generate(
    ast,
    {
      retainLines: true,
      compact: false,
      comments: true,
      jsescOption: { minimal: true },
    },
    code
  );

  const componentAst = buildComponentAst({
    jsxNode: extractedJsxNode,
    componentName,
    fileType,
    importDecls: Array.from(importBySource.values()),
    topLevelDeps: topDepStmts,
    propNames: sortedPropNames,
  });
  const componentGenerated = generate(componentAst, {
    retainLines: false,
    compact: false,
    comments: true,
    jsescOption: { minimal: true },
  });

  return {
    ok: true,
    newMainCode: String(mainGenerated.code || ''),
    newComponentCode: String(componentGenerated.code || '') + '\n',
    importPath,
    selectedCount: targetPaths.length,
  };
}
