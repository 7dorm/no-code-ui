// Сравнение AST деревьев для обнаружения изменений в коде
// Используется для bidirectional editing

import traverse, { type NodePath } from '@babel/traverse';
import * as t from '@babel/types';

type StyleValue = string | number | boolean;
type StyleMap = Record<string, StyleValue>;

type ElementData = {
  id: string;
  parentId: string | null;
  styles: StyleMap;
  tagName: string;
  jsxElement: t.JSXElement | t.JSXFragment | null;
};

type StructureChange = {
  type: 'structure';
  id: string;
  action: 'added' | 'removed' | 'moved';
  tagName?: string;
  parentId?: string | null;
  oldParentId?: string | null;
  newParentId?: string | null;
};

type StyleChange = {
  type: 'style';
  id: string;
  property: string;
  oldValue: StyleValue | undefined;
  newValue: StyleValue | undefined;
};

type TextChange = {
  type: 'text';
  id: string;
  oldValue: string;
  newValue: string;
};

type AstChange = StructureChange | StyleChange | TextChange;

function extractIdFromNode(node: t.JSXOpeningElement | null | undefined): string | null {
  if (!node || !node.attributes) return null;

  for (const attr of node.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
    if (attr.name.name !== 'data-no-code-ui-id' && attr.name.name !== 'data-mrpak-id') continue;
    const value = attr.value;
    if (t.isStringLiteral(value)) return value.value;
    if (t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression)) return value.expression.value;
  }
  return null;
}

function extractStylesFromNode(node: t.JSXOpeningElement | null | undefined): StyleMap {
  const styles: StyleMap = {};
  if (!node || !node.attributes) return styles;

  for (const attr of node.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || attr.name.name !== 'style') continue;
    if (!t.isJSXExpressionContainer(attr.value) || !t.isObjectExpression(attr.value.expression)) continue;

    for (const prop of attr.value.expression.properties) {
      if (!t.isObjectProperty(prop)) continue;
      const keyName = t.isIdentifier(prop.key)
        ? prop.key.name
        : (t.isStringLiteral(prop.key) ? prop.key.value : null);
      if (!keyName) continue;

      if (t.isStringLiteral(prop.value)) styles[keyName] = prop.value.value;
      else if (t.isNumericLiteral(prop.value)) styles[keyName] = prop.value.value;
      else if (t.isBooleanLiteral(prop.value)) styles[keyName] = prop.value.value;
    }
  }

  return styles;
}

function extractTextFromNode(node: t.JSXElement | t.JSXFragment | null): string {
  if (!node || !node.children) return '';

  let text = '';
  for (const child of node.children) {
    if (t.isJSXText(child)) text += child.value;
    else if (t.isJSXExpressionContainer(child)) text += '{...}';
  }
  return text.trim();
}

function getTagName(name: t.JSXTagNameExpression): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) {
    let obj = name.object;
    while (t.isJSXMemberExpression(obj)) obj = obj.object;
    return t.isJSXIdentifier(obj) ? obj.name : 'MemberExpr';
  }
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`;
  return 'Unknown';
}

function findJsxContainer(path: NodePath<t.Node>): NodePath<t.JSXElement> | NodePath<t.JSXFragment> | null {
  let current: NodePath<t.Node> | null = path;
  while (current && !current.isJSXElement() && !current.isJSXFragment()) {
    current = current.parentPath;
  }
  if (!current) return null;
  return current.isJSXElement()
    ? (current as NodePath<t.JSXElement>)
    : (current as NodePath<t.JSXFragment>);
}

function createElementMap(ast: t.File): Map<string, ElementData> {
  const map = new Map<string, ElementData>();
  const parentStack: Array<{ id: string }> = [];

  traverse(ast, {
    JSXOpeningElement: {
      enter(path: NodePath<t.JSXOpeningElement>) {
        const id = extractIdFromNode(path.node);
        if (!id) return;

        let parentId: string | null = null;
        for (let i = parentStack.length - 1; i >= 0; i -= 1) {
          const parent = parentStack[i];
          if (parent?.id) {
            parentId = parent.id;
            break;
          }
        }

        const jsxContainerPath = findJsxContainer(path);
        map.set(id, {
          id,
          parentId,
          styles: extractStylesFromNode(path.node),
          tagName: getTagName(path.node.name),
          jsxElement: jsxContainerPath ? jsxContainerPath.node : null,
        });

        parentStack.push({ id });
      },
      exit(path: NodePath<t.JSXOpeningElement>) {
        const id = extractIdFromNode(path.node);
        if (!id) return;
        const top = parentStack[parentStack.length - 1];
        if (top?.id === id) parentStack.pop();
      },
    }
  });

  return map;
}

export function diffAst(oldAst: t.File | null | undefined, newAst: t.File | null | undefined) {
  if (!oldAst || !newAst) {
    return { changes: [] as AstChange[], added: [] as AstChange[], removed: [] as AstChange[], modified: [] as AstChange[] };
  }

  const oldMap = createElementMap(oldAst);
  const newMap = createElementMap(newAst);

  const changes: AstChange[] = [];
  const added: AstChange[] = [];
  const removed: AstChange[] = [];
  const modified: AstChange[] = [];

  for (const [id, newData] of newMap.entries()) {
    if (oldMap.has(id)) continue;
    const change: StructureChange = {
      type: 'structure',
      id,
      action: 'added',
      tagName: newData.tagName,
      parentId: newData.parentId,
    };
    added.push(change);
    changes.push(change);
  }

  for (const [id, oldData] of oldMap.entries()) {
    if (newMap.has(id)) continue;
    const change: StructureChange = {
      type: 'structure',
      id,
      action: 'removed',
      tagName: oldData.tagName,
    };
    removed.push(change);
    changes.push(change);
  }

  for (const [id, newData] of newMap.entries()) {
    const oldData = oldMap.get(id);
    if (!oldData) continue;

    if (oldData.parentId !== newData.parentId) {
      const moveChange: StructureChange = {
        type: 'structure',
        id,
        action: 'moved',
        oldParentId: oldData.parentId,
        newParentId: newData.parentId,
      };
      changes.push(moveChange);
      modified.push(moveChange);
    }

    const allStyleKeys = new Set([...Object.keys(oldData.styles || {}), ...Object.keys(newData.styles || {})]);
    for (const key of allStyleKeys) {
      const oldValue = oldData.styles[key];
      const newValue = newData.styles[key];
      if (oldValue === newValue) continue;
      const styleChange: StyleChange = {
        type: 'style',
        id,
        property: key,
        oldValue,
        newValue,
      };
      changes.push(styleChange);
      modified.push(styleChange);
    }

    if (oldData.jsxElement && newData.jsxElement) {
      const oldText = extractTextFromNode(oldData.jsxElement);
      const newText = extractTextFromNode(newData.jsxElement);
      if (oldText !== newText) {
        const textChange: TextChange = {
          type: 'text',
          id,
          oldValue: oldText,
          newValue: newText,
        };
        changes.push(textChange);
        modified.push(textChange);
      }
    }
  }

  return { changes, added, removed, modified };
}
