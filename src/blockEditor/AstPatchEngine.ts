// Применение патчей напрямую к AST (для bidirectional editing)
// Работает с constructorAST и возвращает обновленное AST

import { parse, type ParserPlugin } from '@babel/parser';
import traverse, { type NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { isTypeScriptFile } from './AstUtils';

type StylePatch = Record<string, unknown>;

type AstMutationResult =
  | { ok: true; ast: t.File }
  | { ok: false; error: string };

type JsxContainerPath = NodePath<t.JSXElement> | NodePath<t.JSXFragment>;

type FoundOpeningElement = {
  path: NodePath<t.JSXOpeningElement>;
  node: t.JSXOpeningElement;
};

function findJsxContainerPath(path: NodePath<t.Node>): JsxContainerPath | null {
  let current: NodePath<t.Node> | null = path;
  while (current && !current.isJSXElement() && !current.isJSXFragment()) {
    current = current.parentPath;
  }
  return current ? (current as JsxContainerPath) : null;
}

/**
 * Находит JSX элемент по ID в AST
 */
function findElementByIdInAst(ast: t.File, id: string): FoundOpeningElement | null {
  let found: FoundOpeningElement | null = null;

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

        if (idValue === id) {
          found = { path, node };
          path.stop();
          return;
        }
      }
    }
  });

  return found;
}

/**
 * Извлекает текущие стили из style атрибута
 */
function extractStyleFromNode(node: t.JSXOpeningElement): StylePatch {
  const styles: StylePatch = {};

  for (const attr of node.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || attr.name.name !== 'style') continue;
    const value = attr.value;
    if (!t.isJSXExpressionContainer(value) || !t.isObjectExpression(value.expression)) continue;

    for (const prop of value.expression.properties) {
      if (!t.isObjectProperty(prop)) continue;
      const key = prop.key;
      const val = prop.value;
      const keyName =
        t.isIdentifier(key) ? key.name :
        t.isStringLiteral(key) ? key.value :
        null;
      if (!keyName) continue;

      if (t.isStringLiteral(val)) styles[keyName] = val.value;
      else if (t.isNumericLiteral(val)) styles[keyName] = val.value;
      else if (t.isBooleanLiteral(val)) styles[keyName] = val.value;
      else styles[keyName] = String(val.type);
    }
  }

  return styles;
}

function toStyleValueNode(value: unknown): t.Expression {
  if (typeof value === 'string') return t.stringLiteral(value);
  if (typeof value === 'number') return t.numericLiteral(value);
  if (typeof value === 'boolean') return t.booleanLiteral(value);
  return t.stringLiteral(String(value));
}

/**
 * Обновляет style атрибут в JSX элементе
 */
function updateStyleAttribute(node: t.JSXOpeningElement, patch: StylePatch): void {
  const currentStyles = extractStyleFromNode(node);
  const updatedStyles: StylePatch = { ...currentStyles, ...patch };

  for (const key of Object.keys(updatedStyles)) {
    if (updatedStyles[key] === null || updatedStyles[key] === undefined) {
      delete updatedStyles[key];
    }
  }

  const properties = Object.entries(updatedStyles).map(([key, value]) =>
    t.objectProperty(t.identifier(key), toStyleValueNode(value))
  );
  const newStyleAttr = t.jsxAttribute(
    t.jsxIdentifier('style'),
    t.jsxExpressionContainer(t.objectExpression(properties))
  );

  let styleAttrIndex = -1;
  for (let i = 0; i < node.attributes.length; i += 1) {
    const attr = node.attributes[i];
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'style') {
      styleAttrIndex = i;
      break;
    }
  }

  if (styleAttrIndex >= 0) node.attributes[styleAttrIndex] = newStyleAttr;
  else node.attributes.push(newStyleAttr);
}

export function applyStylePatchToAst({
  constructorAST,
  blockId,
  patch,
}: {
  constructorAST: t.File;
  blockId: string;
  patch: StylePatch;
}): AstMutationResult {
  if (!constructorAST) return { ok: false, error: 'constructorAST is required' };
  if (!blockId) return { ok: false, error: 'blockId is required' };

  const element = findElementByIdInAst(constructorAST, blockId);
  if (!element) return { ok: false, error: `Element with ID ${blockId} not found` };

  try {
    updateStyleAttribute(element.node, patch);
    return { ok: true, ast: constructorAST };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export function applyDeleteToAst({
  constructorAST,
  blockId,
}: {
  constructorAST: t.File;
  blockId: string;
}): AstMutationResult {
  if (!constructorAST) return { ok: false, error: 'constructorAST is required' };
  if (!blockId) return { ok: false, error: 'blockId is required' };

  const element = findElementByIdInAst(constructorAST, blockId);
  if (!element) return { ok: false, error: `Element with ID ${blockId} not found` };

  const jsxElementPath = findJsxContainerPath(element.path);
  if (!jsxElementPath) return { ok: false, error: 'JSX element not found' };

  try {
    jsxElementPath.remove();
    return { ok: true, ast: constructorAST };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

function parseSnippet(snippet: string, filePath: string): t.JSXElement | t.JSXFragment | null {
  const plugins: ParserPlugin[] = ['jsx'];
  if (isTypeScriptFile(filePath)) {
    plugins.push(
      'typescript',
      'classProperties',
      'decorators-legacy',
      'optionalChaining',
      'nullishCoalescingOperator'
    );
  }

  try {
    const wrapped = `function _() { return (${snippet}); }`;
    const snippetAst = parse(wrapped, {
      sourceType: 'module',
      plugins,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });

    let extracted: t.JSXElement | t.JSXFragment | null = null;
    traverse(snippetAst, {
      ReturnStatement(path: NodePath<t.ReturnStatement>) {
        const argumentNode = path.node.argument;
        if (t.isJSXElement(argumentNode) || t.isJSXFragment(argumentNode)) {
          extracted = argumentNode;
          path.stop();
        } else if (
          t.isParenthesizedExpression(argumentNode) &&
          (t.isJSXElement(argumentNode.expression) || t.isJSXFragment(argumentNode.expression))
        ) {
          extracted = argumentNode.expression;
          path.stop();
        }
      }
    });

    return extracted;
  } catch {
    return null;
  }
}

export function applyInsertToAst({
  constructorAST,
  targetId,
  mode,
  snippet,
  filePath,
}: {
  constructorAST: t.File;
  targetId: string;
  mode: 'child' | 'sibling';
  snippet: string;
  filePath: string;
}): AstMutationResult {
  if (!constructorAST) return { ok: false, error: 'constructorAST is required' };
  if (!targetId || !snippet) return { ok: false, error: 'targetId and snippet are required' };

  const newElement = parseSnippet(snippet, filePath);
  if (!newElement) return { ok: false, error: 'Failed to parse snippet' };

  const targetElement = findElementByIdInAst(constructorAST, targetId);
  if (!targetElement) return { ok: false, error: `Target element with ID ${targetId} not found` };

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
    return { ok: true, ast: constructorAST };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export function applySetTextToAst({
  constructorAST,
  blockId,
  text,
}: {
  constructorAST: t.File;
  blockId: string;
  text: string;
}): AstMutationResult {
  if (!constructorAST) return { ok: false, error: 'constructorAST is required' };
  if (!blockId) return { ok: false, error: 'blockId is required' };

  const element = findElementByIdInAst(constructorAST, blockId);
  if (!element) return { ok: false, error: `Element with ID ${blockId} not found` };

  const jsxElementPath = findJsxContainerPath(element.path);
  if (!jsxElementPath || !jsxElementPath.isJSXElement()) {
    return { ok: false, error: 'JSX element not found' };
  }

  try {
    jsxElementPath.node.children = [t.jsxText(String(text || ''))];
    return { ok: true, ast: constructorAST };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export function applyReparentToAst({
  constructorAST,
  sourceId,
  targetParentId,
}: {
  constructorAST: t.File;
  sourceId: string;
  targetParentId: string;
}): AstMutationResult {
  if (!constructorAST) return { ok: false, error: 'constructorAST is required' };
  if (!sourceId || !targetParentId) {
    return { ok: false, error: 'sourceId and targetParentId are required' };
  }

  const sourceElement = findElementByIdInAst(constructorAST, sourceId);
  if (!sourceElement) return { ok: false, error: `Source element with ID ${sourceId} not found` };

  const targetElement = findElementByIdInAst(constructorAST, targetParentId);
  if (!targetElement) {
    return { ok: false, error: `Target parent element with ID ${targetParentId} not found` };
  }

  const sourceJsxPath = findJsxContainerPath(sourceElement.path);
  const targetJsxPath = findJsxContainerPath(targetElement.path);
  if (!sourceJsxPath || !targetJsxPath) return { ok: false, error: 'JSX elements not found' };

  try {
    const sourceNode = sourceJsxPath.node;
    sourceJsxPath.remove();
    targetJsxPath.node.children.push(sourceNode);
    return { ok: true, ast: constructorAST };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
