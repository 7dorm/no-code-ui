// AST-based применение стилей к JSX коду
// Использует @babel/parser + @babel/traverse + @babel/generator для точного применения изменений

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

/**
 * Находит JSX элемент по data-no-code-ui-id через AST обход
 * @param {Object} ast - AST дерево
 * @param {string} id - ID элемента
 * @returns {Object|null} { path, node } или null
 */
function findElementByIdInAst(ast, id) {
  let found = null;
  
  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node;
      
      // Ищем атрибут data-no-code-ui-id
      for (const attr of node.attributes) {
        if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
          if (attr.name.name === 'data-no-code-ui-id' || attr.name.name === 'data-mrpak-id') {
            const value = attr.value;
            if (t.isStringLiteral(value) && value.value === id) {
              found = { path, node, openingElement: node };
              path.stop(); // Останавливаем обход
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
 * Извлекает текущие стили из style атрибута JSX элемента
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
        
        // style={{ color: 'red' }}
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
                  // Для сложных выражений сохраняем как есть
                  styles[keyName] = null; // Будет заменено
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
 * Создает или обновляет style атрибут в JSX элементе
 * @param {t.JSXOpeningElement} node - узел открывающего тега
 * @param {Object} patch - объект с новыми стилями { property: value }
 */
function updateStyleAttribute(node, patch) {
  // Ищем существующий style атрибут
  let styleAttrIndex = -1;
  let styleAttr = null;
  
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i];
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'style') {
      styleAttrIndex = i;
      styleAttr = attr;
      break;
    }
  }
  
  // Извлекаем текущие стили
  const currentStyles = extractStyleFromNode(node);
  
  // Объединяем с новыми стилями
  const updatedStyles = { ...currentStyles, ...patch };
  
  // Удаляем null значения (удаление свойств)
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
      // Fallback на строку
      valueNode = t.stringLiteral(String(value));
    }
    
    return t.objectProperty(
      t.identifier(key),
      valueNode
    );
  });
  
  // Создаем объект стилей
  const styleObject = t.objectExpression(properties);
  
  // Создаем JSXExpressionContainer
  const styleValue = t.jsxExpressionContainer(styleObject);
  
  // Создаем или обновляем атрибут
  const newStyleAttr = t.jsxAttribute(
    t.jsxIdentifier('style'),
    styleValue
  );
  
  if (styleAttrIndex >= 0) {
    // Заменяем существующий атрибут
    node.attributes[styleAttrIndex] = newStyleAttr;
  } else {
    // Добавляем новый атрибут
    node.attributes.push(newStyleAttr);
  }
}

/**
 * Применяет патч стилей к JSX коду через AST
 * @param {Object} params - параметры
 * @param {string} params.code - исходный код
 * @param {Object} params.target - { start, end } или { id } - целевой элемент
 * @param {Object} params.patch - объект со стилями для применения
 * @param {string} params.filePath - путь к файлу (для парсинга)
 * @returns {Object} { ok: boolean, code?: string, error?: string }
 */
export function applyStylePatchWithAst({ code, target, patch, filePath }) {
  const source = String(code ?? '');
  if (!source.trim()) {
    return { ok: false, error: 'Empty code' };
  }

  const ext = filePath?.split('.').pop()?.toLowerCase();
  let plugins = ['jsx'];
  
  if (ext === 'ts' || ext === 'tsx') {
    plugins.push(
      'typescript',
      'classProperties',
      'decorators-legacy',
      'optionalChaining',
      'nullishCoalescingOperator'
    );
  }

  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (error) {
    return { ok: false, error: `Parse error: ${error.message}` };
  }

  // Находим элемент по ID или по позиции
  let element = null;
  
  if (target.id) {
    // Ищем по ID через AST
    const found = findElementByIdInAst(ast, target.id);
    if (found) {
      element = found;
    }
  } else if (target.start != null && target.end != null) {
    // Ищем по позиции (менее надежно, но для обратной совместимости)
    traverse(ast, {
      JSXOpeningElement(path) {
        const node = path.node;
        if (node.start === target.start && node.end === target.end) {
          element = { path, node, openingElement: node };
          path.stop();
        }
      }
    });
  }

  if (!element) {
    return { ok: false, error: 'Element not found in AST' };
  }

  // Применяем патч стилей
  try {
    updateStyleAttribute(element.node, patch);
  } catch (error) {
    return { ok: false, error: `Failed to update style: ${error.message}` };
  }

  // Генерируем код с сохранением форматирования
  let generatedCode;
  try {
    const result = generate(ast, {
      retainLines: true,
      compact: false,
      jsescOption: { minimal: true },
      comments: true,
    }, source);
    generatedCode = result.code;
  } catch (error) {
    return { ok: false, error: `Generation error: ${error.message}` };
  }

  return { ok: true, code: generatedCode, changed: true };
}

