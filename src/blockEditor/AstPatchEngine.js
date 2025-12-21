// Применение патчей напрямую к AST (для bidirectional editing)
// Работает с constructorAST и возвращает обновленное AST

import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { isTypeScriptFile } from './AstUtils';

/**
 * Находит JSX элемент по ID в AST
 * @param {Object} ast - AST дерево
 * @param {string} id - ID элемента
 * @returns {Object|null} { path, node } или null
 */
function findElementByIdInAst(ast, id) {
  let found = null;
  
  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node;
      
      for (const attr of node.attributes) {
        if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
          if (attr.name.name === 'data-no-code-ui-id' || attr.name.name === 'data-mrpak-id') {
            const value = attr.value;
            if (t.isStringLiteral(value) && value.value === id) {
              found = { path, node };
              path.stop();
              return;
            }
          }
        }
      }
    }
  });
  
  return found;
}

/**
 * Извлекает текущие стили из style атрибута
 * @param {t.JSXOpeningElement} node - узел открывающего тега
 * @returns {Object} объект со стилями
 */
function extractStyleFromNode(node) {
  const styles = {};
  
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
                } else {
                  // Для сложных выражений сохраняем как строку
                  styles[keyName] = String(val);
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
 * Обновляет style атрибут в JSX элементе
 * @param {t.JSXOpeningElement} node - узел открывающего тега
 * @param {Object} patch - объект с новыми стилями { property: value }
 */
function updateStyleAttribute(node, patch) {
  // Извлекаем текущие стили
  const currentStyles = extractStyleFromNode(node);
  
  // Объединяем с новыми стилями
  const updatedStyles = { ...currentStyles, ...patch };
  
  // Удаляем null значения
  for (const key in updatedStyles) {
    if (updatedStyles[key] === null || updatedStyles[key] === undefined) {
      delete updatedStyles[key];
    }
  }
  
  // Создаем свойства объекта стилей
  const properties = Object.entries(updatedStyles).map(([key, value]) => {
    let valueNode;
    
    if (typeof value === 'string') {
      valueNode = t.stringLiteral(value);
    } else if (typeof value === 'number') {
      valueNode = t.numericLiteral(value);
    } else if (typeof value === 'boolean') {
      valueNode = t.booleanLiteral(value);
    } else {
      valueNode = t.stringLiteral(String(value));
    }
    
    return t.objectProperty(t.identifier(key), valueNode);
  });
  
  // Создаем объект стилей
  const styleObject = t.objectExpression(properties);
  const styleValue = t.jsxExpressionContainer(styleObject);
  const newStyleAttr = t.jsxAttribute(t.jsxIdentifier('style'), styleValue);
  
  // Ищем существующий style атрибут
  let styleAttrIndex = -1;
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i];
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'style') {
      styleAttrIndex = i;
      break;
    }
  }
  
  // Заменяем или добавляем атрибут
  if (styleAttrIndex >= 0) {
    node.attributes[styleAttrIndex] = newStyleAttr;
  } else {
    node.attributes.push(newStyleAttr);
  }
}

/**
 * Применяет патч стилей к constructorAST
 * @param {Object} params - параметры
 * @param {Object} params.constructorAST - AST конструктора
 * @param {string} params.blockId - ID блока
 * @param {Object} params.patch - объект со стилями
 * @returns {Object} { ok: boolean, ast?: Object, error?: string }
 */
export function applyStylePatchToAst({ constructorAST, blockId, patch }) {
  if (!constructorAST) {
    return { ok: false, error: 'constructorAST is required' };
  }
  
  if (!blockId) {
    return { ok: false, error: 'blockId is required' };
  }
  
  // Находим элемент по ID
  const element = findElementByIdInAst(constructorAST, blockId);
  if (!element) {
    return { ok: false, error: `Element with ID ${blockId} not found` };
  }
  
  // Применяем патч стилей
  try {
    updateStyleAttribute(element.node, patch);
    return { ok: true, ast: constructorAST };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Применяет операцию удаления к constructorAST
 * @param {Object} params - параметры
 * @param {Object} params.constructorAST - AST конструктора
 * @param {string} params.blockId - ID блока для удаления
 * @returns {Object} { ok: boolean, ast?: Object, error?: string }
 */
export function applyDeleteToAst({ constructorAST, blockId }) {
  if (!constructorAST) {
    return { ok: false, error: 'constructorAST is required' };
  }
  
  if (!blockId) {
    return { ok: false, error: 'blockId is required' };
  }
  
  // Находим элемент по ID
  const element = findElementByIdInAst(constructorAST, blockId);
  if (!element) {
    return { ok: false, error: `Element with ID ${blockId} not found` };
  }
  
  // Находим родительский JSX элемент
  let jsxElementPath = element.path;
  while (jsxElementPath && !t.isJSXElement(jsxElementPath.node) && !t.isJSXFragment(jsxElementPath.node)) {
    jsxElementPath = jsxElementPath.parentPath;
  }
  
  if (!jsxElementPath) {
    return { ok: false, error: 'JSX element not found' };
  }
  
  try {
    // Удаляем элемент
    jsxElementPath.remove();
    return { ok: true, ast: constructorAST };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Применяет операцию вставки к constructorAST
 * @param {Object} params - параметры
 * @param {Object} params.constructorAST - AST конструктора
 * @param {string} params.targetId - ID целевого элемента
 * @param {string} params.mode - 'child' или 'sibling'
 * @param {string} params.snippet - JSX код для вставки
 * @param {string} params.filePath - путь к файлу (для парсинга)
 * @returns {Object} { ok: boolean, ast?: Object, error?: string }
 */
export function applyInsertToAst({ constructorAST, targetId, mode, snippet, filePath }) {
  if (!constructorAST) {
    return { ok: false, error: 'constructorAST is required' };
  }
  
  if (!targetId || !snippet) {
    return { ok: false, error: 'targetId and snippet are required' };
  }
  
  // Парсим snippet в AST
  const plugins = ['jsx'];
  if (isTypeScriptFile(filePath)) {
    plugins.push('typescript', 'classProperties', 'decorators-legacy', 'optionalChaining', 'nullishCoalescingOperator');
  }
  
  let newElementAst;
  try {
    newElementAst = parse(snippet, {
      sourceType: 'module',
      plugins,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (error) {
    return { ok: false, error: `Failed to parse snippet: ${error.message}` };
  }
  
  // Извлекаем JSX элемент из snippet
  let newElement = null;
  traverse(newElementAst, {
    JSXElement(path) {
      newElement = path.node;
      path.stop();
    }
  });
  
  if (!newElement) {
    return { ok: false, error: 'No JSX element found in snippet' };
  }
  
  // Находим целевой элемент
  const targetElement = findElementByIdInAst(constructorAST, targetId);
  if (!targetElement) {
    return { ok: false, error: `Target element with ID ${targetId} not found` };
  }
  
  // Находим родительский JSX элемент
  let targetJsxPath = targetElement.path;
  while (targetJsxPath && !t.isJSXElement(targetJsxPath.node) && !t.isJSXFragment(targetJsxPath.node)) {
    targetJsxPath = targetJsxPath.parentPath;
  }
  
  if (!targetJsxPath) {
    return { ok: false, error: 'Target JSX element not found' };
  }
  
  try {
    if (mode === 'child') {
      targetJsxPath.node.children.push(newElement);
    } else if (mode === 'sibling') {
      const parentPath = targetJsxPath.parentPath;
      if (parentPath && (t.isJSXElement(parentPath.node) || t.isJSXFragment(parentPath.node))) {
        const index = parentPath.node.children.indexOf(targetJsxPath.node);
        if (index >= 0) {
          parentPath.node.children.splice(index + 1, 0, newElement);
        } else {
          parentPath.node.children.push(newElement);
        }
      }
    }
    
    return { ok: true, ast: constructorAST };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Применяет операцию изменения текста к constructorAST
 * @param {Object} params - параметры
 * @param {Object} params.constructorAST - AST конструктора
 * @param {string} params.blockId - ID блока
 * @param {string} params.text - новый текст
 * @returns {Object} { ok: boolean, ast?: Object, error?: string }
 */
export function applySetTextToAst({ constructorAST, blockId, text }) {
  if (!constructorAST) {
    return { ok: false, error: 'constructorAST is required' };
  }
  
  if (!blockId) {
    return { ok: false, error: 'blockId is required' };
  }
  
  // Находим элемент по ID
  const element = findElementByIdInAst(constructorAST, blockId);
  if (!element) {
    return { ok: false, error: `Element with ID ${blockId} not found` };
  }
  
  // Находим JSX элемент
  let jsxElementPath = element.path;
  while (jsxElementPath && !t.isJSXElement(jsxElementPath.node) && !t.isJSXFragment(jsxElementPath.node)) {
    jsxElementPath = jsxElementPath.parentPath;
  }
  
  if (!jsxElementPath || !t.isJSXElement(jsxElementPath.node)) {
    return { ok: false, error: 'JSX element not found' };
  }
  
  try {
    // Заменяем все текстовые дочерние элементы на новый текст
    const textNode = t.jsxText(String(text || ''));
    jsxElementPath.node.children = [textNode];
    
    return { ok: true, ast: constructorAST };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Применяет операцию перемещения (reparent) к constructorAST
 * @param {Object} params - параметры
 * @param {Object} params.constructorAST - AST конструктора
 * @param {string} params.sourceId - ID перемещаемого элемента
 * @param {string} params.targetParentId - ID нового родителя
 * @returns {Object} { ok: boolean, ast?: Object, error?: string }
 */
export function applyReparentToAst({ constructorAST, sourceId, targetParentId }) {
  if (!constructorAST) {
    return { ok: false, error: 'constructorAST is required' };
  }
  
  if (!sourceId || !targetParentId) {
    return { ok: false, error: 'sourceId and targetParentId are required' };
  }
  
  // Находим исходный элемент
  const sourceElement = findElementByIdInAst(constructorAST, sourceId);
  if (!sourceElement) {
    return { ok: false, error: `Source element with ID ${sourceId} not found` };
  }
  
  // Находим целевой родительский элемент
  const targetElement = findElementByIdInAst(constructorAST, targetParentId);
  if (!targetElement) {
    return { ok: false, error: `Target parent element with ID ${targetParentId} not found` };
  }
  
  // Находим JSX элементы
  let sourceJsxPath = sourceElement.path;
  while (sourceJsxPath && !t.isJSXElement(sourceJsxPath.node) && !t.isJSXFragment(sourceJsxPath.node)) {
    sourceJsxPath = sourceJsxPath.parentPath;
  }
  
  let targetJsxPath = targetElement.path;
  while (targetJsxPath && !t.isJSXElement(targetJsxPath.node) && !t.isJSXFragment(targetJsxPath.node)) {
    targetJsxPath = targetJsxPath.parentPath;
  }
  
  if (!sourceJsxPath || !targetJsxPath) {
    return { ok: false, error: 'JSX elements not found' };
  }
  
  try {
    // Удаляем элемент из старого места
    const sourceNode = sourceJsxPath.node;
    sourceJsxPath.remove();
    
    // Добавляем в новое место
    if (t.isJSXElement(targetJsxPath.node) || t.isJSXFragment(targetJsxPath.node)) {
      targetJsxPath.node.children.push(sourceNode);
    }
    
    return { ok: true, ast: constructorAST };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

