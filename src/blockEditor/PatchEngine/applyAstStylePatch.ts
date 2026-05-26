// AST-based применение стилей к JSX коду
// Использует @babel/parser + @babel/traverse + @babel/generator для точного применения изменений

import { parse, type ParserPlugin } from '@babel/parser';
import traverse, { type NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

type StylePatch = Record<string, unknown>;

type TargetById = { id: string; start?: number; end?: number };
type TargetByRange = { id?: string; start: number; end: number };
type StyleTarget = TargetById | TargetByRange;

type FoundElement = {
  path: NodePath<t.JSXOpeningElement>;
  node: t.JSXOpeningElement;
};

type StylePatchResult =
  | { ok: true; code: string; changed: true }
  | { ok: false; error: string };

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

function toValueNode(value: unknown): t.Expression {
  if (typeof value === 'string') return t.stringLiteral(value);
  if (typeof value === 'number') return t.numericLiteral(value);
  if (typeof value === 'boolean') return t.booleanLiteral(value);
  return t.stringLiteral(String(value));
}

function findElementByIdInAst(ast: t.File, id: string): FoundElement | null {
  let found: FoundElement | null = null;

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      for (const attr of path.node.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
        if (attr.name.name !== 'data-no-code-ui-id' && attr.name.name !== 'data-mrpak-id') continue;

        const value = attr.value;
        const idValue = t.isStringLiteral(value)
          ? value.value
          : (t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression) ? value.expression.value : null);

        if (idValue === id) {
          found = { path, node: path.node };
          path.stop();
          return;
        }
      }
    }
  });

  return found;
}

function findElementByRangeInAst(ast: t.File, start: number, end: number): FoundElement | null {
  let found: FoundElement | null = null;
  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      if (path.node.start === start && path.node.end === end) {
        found = { path, node: path.node };
        path.stop();
      }
    }
  });
  return found;
}

function extractStyleFromNode(node: t.JSXOpeningElement): StylePatch {
  const styles: StylePatch = {};

  for (const attr of node.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || attr.name.name !== 'style') continue;
    if (!t.isJSXExpressionContainer(attr.value) || !t.isObjectExpression(attr.value.expression)) continue;

    for (const prop of attr.value.expression.properties) {
      if (!t.isObjectProperty(prop)) continue;
      const keyName = t.isIdentifier(prop.key)
        ? prop.key.name
        : (t.isStringLiteral(prop.key) ? prop.key.value : null);
      if (!keyName) continue;

      const val = prop.value;
      if (t.isStringLiteral(val)) styles[keyName] = val.value;
      else if (t.isNumericLiteral(val)) styles[keyName] = val.value;
      else if (t.isBooleanLiteral(val)) styles[keyName] = val.value;
    }
  }

  return styles;
}

function updateStyleAttribute(node: t.JSXOpeningElement, patch: StylePatch) {
  const currentStyles = extractStyleFromNode(node);
  const updatedStyles: StylePatch = { ...currentStyles, ...patch };

  for (const key of Object.keys(updatedStyles)) {
    if (updatedStyles[key] === null || updatedStyles[key] === undefined) {
      delete updatedStyles[key];
    }
  }

  const styleAttr = t.jsxAttribute(
    t.jsxIdentifier('style'),
    t.jsxExpressionContainer(
      t.objectExpression(
        Object.entries(updatedStyles).map(([key, value]) =>
          t.objectProperty(t.identifier(key), toValueNode(value))
        )
      )
    )
  );

  const idx = node.attributes.findIndex(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'style'
  );

  if (idx >= 0) node.attributes[idx] = styleAttr;
  else node.attributes.push(styleAttr);
}

export function applyStylePatchWithAst({
  code,
  target,
  patch,
  filePath,
}: {
  code: string;
  target: StyleTarget;
  patch: StylePatch;
  filePath: string;
}): StylePatchResult {
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

  let element: FoundElement | null = null;
  if ('id' in target && target.id) {
    element = findElementByIdInAst(ast, target.id);
  }
  if (!element && target.start != null && target.end != null) {
    element = findElementByRangeInAst(ast, target.start, target.end);
  }
  if (!element) return { ok: false, error: 'Element not found in AST' };

  try {
    updateStyleAttribute(element.node, patch);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to update style: ${message}` };
  }

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
