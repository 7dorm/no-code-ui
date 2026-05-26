// AST-based вставка и удаление элементов в JSX коде
// Использует @babel/parser + @babel/traverse + @babel/generator

import { parse, type ParserPlugin } from '@babel/parser';
import traverse, { type NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

type PatchResult =
  | { ok: true; code: string; changed: true }
  | { ok: false; error: string };

type JsxContainerPath = NodePath<t.JSXElement> | NodePath<t.JSXFragment>;

type FoundElement = {
  path: NodePath<t.JSXOpeningElement>;
  node: t.JSXOpeningElement;
};

function getParserPlugins(filePath: string): ParserPlugin[] {
  const ext = filePath?.split('.').pop()?.toLowerCase();
  const plugins: ParserPlugin[] = ['jsx'];

  if (ext === 'ts' || ext === 'tsx') {
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

function findJsxContainerPath(path: NodePath<t.Node>): JsxContainerPath | null {
  let current: NodePath<t.Node> | null = path;
  while (current && !current.isJSXElement() && !current.isJSXFragment()) {
    current = current.parentPath;
  }
  return current ? (current as JsxContainerPath) : null;
}

/**
 * Находит JSX элемент по data-no-code-ui-id через AST обход
 */
function findElementByIdInAst(ast: t.File, id: string): FoundElement | null {
  let found: FoundElement | null = null;

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const node = path.node;

      for (const attr of node.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
        if (attr.name.name !== 'data-no-code-ui-id' && attr.name.name !== 'data-mrpak-id') continue;

        const value = attr.value;
        const idValue = t.isStringLiteral(value)
          ? value.value
          : (t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression) ? value.expression.value : null);
        if (idValue !== id) continue;

        found = { path, node };
        path.stop();
        return;
      }
    }
  });

  return found;
}

/**
 * Парсит JSX код из строки в AST элемент
 */
function parseJsxSnippet(jsxCode: string, filePath: string): t.JSXElement | t.JSXFragment | null {
  const plugins = getParserPlugins(filePath);

  try {
    const wrapped = `function _() { return (${jsxCode}); }`;
    const ast = parse(wrapped, {
      sourceType: 'module',
      plugins,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });

    let jsxNode: t.JSXElement | t.JSXFragment | null = null;
    traverse(ast, {
      ReturnStatement(path: NodePath<t.ReturnStatement>) {
        const arg = path.node.argument;
        if (t.isJSXElement(arg) || t.isJSXFragment(arg)) {
          jsxNode = arg;
          path.stop();
        } else if (
          t.isParenthesizedExpression(arg) &&
          (t.isJSXElement(arg.expression) || t.isJSXFragment(arg.expression))
        ) {
          jsxNode = arg.expression;
          path.stop();
        }
      }
    });

    return jsxNode;
  } catch (error: unknown) {
    console.warn('[applyAstInsertDelete] Failed to parse JSX snippet:', error);
    return null;
  }
}

function generateCode(ast: t.File, source: string): PatchResult {
  try {
    const result = generate(ast, {
      retainLines: false,
      compact: false,
      concise: false,
      jsescOption: { minimal: true },
      comments: true,
    }, source);
    return { ok: true, code: result.code, changed: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Generation error: ${message}` };
  }
}

export function applyDeleteWithAst({
  code,
  id,
  filePath,
}: {
  code: string;
  id: string;
  filePath: string;
}): PatchResult {
  const source = String(code ?? '');
  if (!source.trim()) return { ok: false, error: 'Empty code' };

  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: getParserPlugins(filePath),
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Parse error: ${message}` };
  }

  const element = findElementByIdInAst(ast, id);
  if (!element) return { ok: false, error: 'Element not found in AST' };

  const jsxElementPath = findJsxContainerPath(element.path);
  if (!jsxElementPath) return { ok: false, error: 'JSX element path not found' };

  try {
    jsxElementPath.remove();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to remove element: ${message}` };
  }

  return generateCode(ast, source);
}

export function applyInsertWithAst({
  code,
  targetId,
  mode,
  snippet,
  filePath,
}: {
  code: string;
  targetId: string;
  mode: 'child' | 'sibling';
  snippet: string;
  filePath: string;
}): PatchResult {
  const source = String(code ?? '');
  if (!source.trim()) return { ok: false, error: 'Empty code' };

  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: getParserPlugins(filePath),
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Parse error: ${message}` };
  }

  const targetElement = findElementByIdInAst(ast, targetId);
  if (!targetElement) return { ok: false, error: 'Target element not found in AST' };

  const newElement = parseJsxSnippet(snippet, filePath);
  if (!newElement) return { ok: false, error: 'Failed to parse JSX snippet' };

  const targetJsxPath = findJsxContainerPath(targetElement.path);
  if (!targetJsxPath) return { ok: false, error: 'Target JSX element not found' };

  try {
    if (mode === 'child') {
      targetJsxPath.node.children.push(newElement);
    } else {
      const parentPath = targetJsxPath.parentPath;
      if (parentPath && (parentPath.isJSXElement() || parentPath.isJSXFragment())) {
        const index = parentPath.node.children.indexOf(targetJsxPath.node);
        if (index >= 0) parentPath.node.children.splice(index + 1, 0, newElement);
        else parentPath.node.children.push(newElement);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to insert element: ${message}` };
  }

  return generateCode(ast, source);
}
