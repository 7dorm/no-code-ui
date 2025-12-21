// Сравнение AST деревьев для обнаружения изменений в коде
// Используется для bidirectional editing

import traverse from '@babel/traverse';
import * as t from '@babel/types';

/**
 * Извлекает ID из JSX элемента
 * @param {t.JSXOpeningElement} node - узел открывающего тега
 * @returns {string|null} ID или null
 */
function extractIdFromNode(node) {
  if (!node || !node.attributes) return null;
  
  for (const attr of node.attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
      if (attr.name.name === 'data-no-code-ui-id' || attr.name.name === 'data-mrpak-id') {
        const value = attr.value;
        if (t.isStringLiteral(value)) {
          return value.value;
        }
      }
    }
  }
  return null;
}

/**
 * Извлекает стили из JSX элемента
 * @param {t.JSXOpeningElement} node - узел открывающего тега
 * @returns {Object} объект со стилями
 */
function extractStylesFromNode(node) {
  const styles = {};
  
  if (!node || !node.attributes) return styles;
  
  for (const attr of node.attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'style') {
      const value = attr.value;
      
      if (t.isJSXExpressionContainer(value)) {
        const expr = value.expression;
        
        if (t.isObjectExpression(expr)) {
          for (const prop of expr.properties) {
            if (t.isObjectProperty(prop)) {
              const key = prop.key;
              const val = prop.value;
              
              let keyName = null;
              if (t.isIdentifier(key)) {
                keyName = key.name;
              } else if (t.isStringLiteral(key)) {
                keyName = key.value;
              }
              
              if (keyName) {
                if (t.isStringLiteral(val)) {
                  styles[keyName] = val.value;
                } else if (t.isNumericLiteral(val)) {
                  styles[keyName] = val.value;
                } else if (t.isBooleanLiteral(val)) {
                  styles[keyName] = val.value;
                }
              }
            }
          }
        }
      }
    }
  }
  
  return styles;
}

/**
 * Извлекает текстовое содержимое JSX элемента
 * @param {t.JSXElement} node - JSX элемент
 * @returns {string} текст
 */
function extractTextFromNode(node) {
  if (!node || !node.children) return '';
  
  let text = '';
  for (const child of node.children) {
    if (t.isJSXText(child)) {
      text += child.value;
    } else if (t.isJSXExpressionContainer(child)) {
      // Для выражений возвращаем маркер
      text += '{...}';
    }
  }
  
  return text.trim();
}

/**
 * Создает карту элементов по ID из AST
 * @param {Object} ast - AST дерево
 * @returns {Map<string, Object>} карта ID → { node, path, parentId }
 */
function createElementMap(ast) {
  const map = new Map();
  const parentStack = [];
  
  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node;
      const id = extractIdFromNode(node);
      
      if (id) {
        // Находим родительский элемент с ID
        let parentId = null;
        for (let i = parentStack.length - 1; i >= 0; i--) {
          const parent = parentStack[i];
          if (parent && parent.id) {
            parentId = parent.id;
            break;
          }
        }
        
        // Находим полный JSX элемент
        let jsxElementPath = path;
        while (jsxElementPath && !t.isJSXElement(jsxElementPath.node) && !t.isJSXFragment(jsxElementPath.node)) {
          jsxElementPath = jsxElementPath.parentPath;
        }
        
        map.set(id, {
          id,
          node,
          path,
          jsxElement: jsxElementPath?.node || null,
          parentId,
          styles: extractStylesFromNode(node),
          tagName: getTagName(node.name),
        });
        
        parentStack.push({ id, node });
      }
    },
    JSXClosingElement() {
      // Убираем из стека при закрытии элемента
      if (parentStack.length > 0) {
        parentStack.pop();
      }
    }
  });
  
  return map;
}

/**
 * Получает имя тега из JSX имени
 */
function getTagName(name) {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }
  if (t.isJSXMemberExpression(name)) {
    let obj = name.object;
    while (t.isJSXMemberExpression(obj)) {
      obj = obj.object;
    }
    if (t.isJSXIdentifier(obj)) {
      return obj.name;
    }
    return 'MemberExpr';
  }
  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return 'Unknown';
}

/**
 * Сравнивает два AST дерева и находит различия
 * @param {Object} oldAst - старое AST дерево
 * @param {Object} newAst - новое AST дерево
 * @returns {Object} { changes: Array, added: Array, removed: Array, modified: Array }
 */
export function diffAst(oldAst, newAst) {
  if (!oldAst || !newAst) {
    return { changes: [], added: [], removed: [], modified: [] };
  }

  const oldMap = createElementMap(oldAst);
  const newMap = createElementMap(newAst);
  
  const changes = [];
  const added = [];
  const removed = [];
  const modified = [];
  
  // Находим добавленные элементы
  for (const [id, newData] of newMap) {
    if (!oldMap.has(id)) {
      added.push({
        type: 'structure',
        id,
        action: 'added',
        tagName: newData.tagName,
        parentId: newData.parentId,
      });
      changes.push({
        type: 'structure',
        id,
        action: 'added',
        tagName: newData.tagName,
        parentId: newData.parentId,
      });
    }
  }
  
  // Находим удаленные элементы
  for (const [id, oldData] of oldMap) {
    if (!newMap.has(id)) {
      removed.push({
        type: 'structure',
        id,
        action: 'removed',
        tagName: oldData.tagName,
      });
      changes.push({
        type: 'structure',
        id,
        action: 'removed',
        tagName: oldData.tagName,
      });
    }
  }
  
  // Находим измененные элементы
  for (const [id, newData] of newMap) {
    const oldData = oldMap.get(id);
    if (oldData) {
      const styleChanges = [];
      
      // Сравниваем стили
      const oldStyles = oldData.styles || {};
      const newStyles = newData.styles || {};
      
      // Находим измененные стили
      const allStyleKeys = new Set([...Object.keys(oldStyles), ...Object.keys(newStyles)]);
      for (const key of allStyleKeys) {
        const oldValue = oldStyles[key];
        const newValue = newStyles[key];
        
        if (oldValue !== newValue) {
          styleChanges.push({
            property: key,
            oldValue,
            newValue,
          });
        }
      }
      
      // Сравниваем родителя (перемещение)
      if (oldData.parentId !== newData.parentId) {
        changes.push({
          type: 'structure',
          id,
          action: 'moved',
          oldParentId: oldData.parentId,
          newParentId: newData.parentId,
        });
        modified.push({
          type: 'structure',
          id,
          action: 'moved',
          oldParentId: oldData.parentId,
          newParentId: newData.parentId,
        });
      }
      
      // Если есть изменения стилей
      if (styleChanges.length > 0) {
        for (const styleChange of styleChanges) {
          changes.push({
            type: 'style',
            id,
            property: styleChange.property,
            oldValue: styleChange.oldValue,
            newValue: styleChange.newValue,
          });
          modified.push({
            type: 'style',
            id,
            property: styleChange.property,
            oldValue: styleChange.oldValue,
            newValue: styleChange.newValue,
          });
        }
      }
      
      // Сравниваем текст (если есть)
      if (oldData.jsxElement && newData.jsxElement) {
        const oldText = extractTextFromNode(oldData.jsxElement);
        const newText = extractTextFromNode(newData.jsxElement);
        
        if (oldText !== newText) {
          changes.push({
            type: 'text',
            id,
            oldValue: oldText,
            newValue: newText,
          });
          modified.push({
            type: 'text',
            id,
            oldValue: oldText,
            newValue: newText,
          });
        }
      }
    }
  }
  
  return { changes, added, removed, modified };
}

