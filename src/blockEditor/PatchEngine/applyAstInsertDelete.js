// AST-based вставка и удаление элементов в JSX коде
// Использует @babel/parser + @babel/traverse + @babel/generator

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

/**
 * Находит JSX элемент по data-no-code-ui-id через AST обход
 * @param {Object} ast - AST дерево
 * @param {string} id - ID элемента
 * @returns {Object|null} { path, node, parentPath } или null
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
              // Находим родительский JSX элемент
              let parentPath = path;
              while (parentPath && !t.isJSXElement(parentPath.node) && !t.isJSXFragment(parentPath.node)) {
                parentPath = parentPath.parentPath;
              }
              
              found = { 
                path, 
                node, 
                openingElement: node,
                parentPath: parentPath || path.parentPath
              };
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
 * Парсит JSX код из строки в AST элемент
 * @param {string} jsxCode - JSX код для вставки
 * @param {string} filePath - путь к файлу (для парсинга)
 * @returns {t.JSXElement|null} AST элемент или null
 */
function parseJsxSnippet(jsxCode, filePath) {
  const ext = filePath?.split('.').pop()?.toLowerCase();
  let plugins = ['jsx'];
  
  if (ext === 'ts' || ext === 'tsx') {
    plugins.push('typescript', 'classProperties', 'decorators-legacy');
  }

  try {
    // Оборачиваем в программу для парсинга
    const wrapped = `function _() { return (${jsxCode}); }`;
    const ast = parse(wrapped, {
      sourceType: 'module',
      plugins,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });

    // Извлекаем JSX из return statement
    let jsxNode = null;
    traverse(ast, {
      ReturnStatement(path) {
        const arg = path.node.argument;
        if (t.isJSXElement(arg) || t.isJSXFragment(arg)) {
          jsxNode = arg;
          path.stop();
        } else if (t.isParenthesizedExpression(arg) && (t.isJSXElement(arg.expression) || t.isJSXFragment(arg.expression))) {
          jsxNode = arg.expression;
          path.stop();
        }
      }
    });

    return jsxNode;
  } catch (error) {
    console.warn('[applyAstInsertDelete] Failed to parse JSX snippet:', error);
    return null;
  }
}

/**
 * Удаляет JSX элемент из AST по ID
 * @param {Object} params - параметры
 * @param {string} params.code - исходный код
 * @param {string} params.id - ID элемента для удаления
 * @param {string} params.filePath - путь к файлу
 * @returns {Object} { ok: boolean, code?: string, error?: string }
 */
export function applyDeleteWithAst({ code, id, filePath }) {
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

  // Находим элемент по ID
  const element = findElementByIdInAst(ast, id);
  if (!element) {
    return { ok: false, error: 'Element not found in AST' };
  }

  // Находим родительский JSX элемент или фрагмент
  let parentJsxPath = element.path;
  while (parentJsxPath && !t.isJSXElement(parentJsxPath.node) && !t.isJSXFragment(parentJsxPath.node)) {
    parentJsxPath = parentJsxPath.parentPath;
  }

  if (!parentJsxPath) {
    return { ok: false, error: 'Parent JSX element not found' };
  }

  // Находим полный JSX элемент (открывающий до закрывающего)
  let jsxElementPath = element.path;
  while (jsxElementPath && !t.isJSXElement(jsxElementPath.node) && !t.isJSXFragment(jsxElementPath.node)) {
    jsxElementPath = jsxElementPath.parentPath;
  }

  if (!jsxElementPath || (!t.isJSXElement(jsxElementPath.node) && !t.isJSXFragment(jsxElementPath.node))) {
    return { ok: false, error: 'JSX element path not found' };
  }

  // Удаляем элемент из родителя
  try {
    jsxElementPath.remove();
  } catch (error) {
    return { ok: false, error: `Failed to remove element: ${error.message}` };
  }

  // Генерируем код
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

/**
 * Вставляет JSX элемент в AST
 * @param {Object} params - параметры
 * @param {string} params.code - исходный код
 * @param {string} params.targetId - ID целевого элемента
 * @param {string} params.mode - 'child' или 'sibling'
 * @param {string} params.snippet - JSX код для вставки
 * @param {string} params.filePath - путь к файлу
 * @returns {Object} { ok: boolean, code?: string, error?: string }
 */
export function applyInsertWithAst({ code, targetId, mode, snippet, filePath }) {
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

  // Находим целевой элемент
  const targetElement = findElementByIdInAst(ast, targetId);
  if (!targetElement) {
    return { ok: false, error: 'Target element not found in AST' };
  }

  // Парсим сниппет в AST
  const newElement = parseJsxSnippet(snippet, filePath);
  if (!newElement) {
    return { ok: false, error: 'Failed to parse JSX snippet' };
  }

  // Находим родительский JSX элемент целевого элемента
  let targetJsxPath = targetElement.path;
  while (targetJsxPath && !t.isJSXElement(targetJsxPath.node) && !t.isJSXFragment(targetJsxPath.node)) {
    targetJsxPath = targetJsxPath.parentPath;
  }

  if (!targetJsxPath) {
    return { ok: false, error: 'Target JSX element not found' };
  }

  try {
    if (mode === 'child') {
      // Вставляем как дочерний элемент
      if (t.isJSXElement(targetJsxPath.node)) {
        targetJsxPath.node.children.push(newElement);
      } else if (t.isJSXFragment(targetJsxPath.node)) {
        targetJsxPath.node.children.push(newElement);
      }
    } else if (mode === 'sibling') {
      // Вставляем как соседний элемент
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
  } catch (error) {
    return { ok: false, error: `Failed to insert element: ${error.message}` };
  }

  // Генерируем код
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

