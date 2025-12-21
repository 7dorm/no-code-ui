// AST-based JSX инструментатор (адаптировано из backend/src/engine/parsers/ReactParser.ts)
// Использует @babel/parser + @babel/traverse + @babel/generator для парсинга и инструментации JSX

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { saveAstTree } from './AstTreeStore';

function safeBasename(path) {
  try {
    const norm = String(path || '').replace(/\\/g, '/');
    return norm.split('/').pop() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Создает ID в формате mrpak (совместимо с текущим форматом)
 * @param {Object} params - параметры
 * @param {string} params.filePath - путь к файлу
 * @param {number} params.start - начальная позиция
 * @param {number} params.end - конечная позиция
 * @param {string} params.tagName - имя тега
 * @returns {string} ID
 */
function makeMrpakId({ filePath, start, end, tagName }) {
  const base = safeBasename(filePath);
  return `mrpak:${base}:${start}:${end}:${tagName || 'node'}`;
}

/**
 * Получает имя тега из JSX имени
 * @param {t.JSXIdentifier|t.JSXMemberExpression|t.JSXNamespacedName} name - имя JSX элемента
 * @returns {string} имя тега
 */
function getTagName(name) {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }
  if (t.isJSXMemberExpression(name)) {
    // Для MemberExpression возвращаем имя объекта
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
 * Проверяет, есть ли уже data-no-code-ui-id или data-mrpak-id атрибут
 * @param {t.JSXOpeningElement} node - узел открывающего тега
 * @returns {string|null} существующий ID или null
 */
function findExistingId(node) {
  for (const attr of node.attributes) {
    if (t.isJSXAttribute(attr)) {
      const name = attr.name;
      if (t.isJSXIdentifier(name)) {
        if (name.name === 'data-no-code-ui-id' || name.name === 'data-mrpak-id') {
          const value = attr.value;
          if (t.isStringLiteral(value)) {
            return value.value;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Инструментирует JSX код, добавляя data-no-code-ui-id атрибуты через AST
 * @param {string} code - исходный код
 * @param {string} filePath - путь к файлу
 * @param {Object} opts - опции
 * @returns {{code: string, map: Object}} инструментированный код и карта элементов
 */
export function instrumentJsxWithAst(code, filePath, opts = {}) {
  const source = String(code ?? '');
  if (!source.trim()) {
    return { code: source, map: {} };
  }

  const ext = filePath.split('.').pop()?.toLowerCase();
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
    // Парсим через Babel (как в OCHIR-BACKEND)
    ast = parse(source, {
      sourceType: 'module',
      plugins,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (error) {
    console.warn('[AstJsxInstrumenter] Parse error, falling back to manual parser:', error);
    // Fallback на ручной парсинг при ошибках
    throw new Error('AST_PARSING_FAILED');
  }

  const map = {};
  const usedIds = new Set();

  // Обходим AST и находим JSX элементы
  try {
    traverse(ast, {
      JSXOpeningElement(path) {
        const node = path.node;
        const tagName = getTagName(node.name);
        
        // Получаем позиции из исходного кода
        const start = node.start;
        const end = node.end;
        
        if (start == null || end == null) {
          return;
        }

        // Проверяем, есть ли уже data-no-code-ui-id или data-mrpak-id
        const existingId = findExistingId(node);
        if (existingId) {
          // Нормализуем: если есть data-mrpak-id, заменяем на data-no-code-ui-id
          for (const attr of node.attributes) {
            if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
              if (attr.name.name === 'data-mrpak-id') {
                attr.name.name = 'data-no-code-ui-id';
              }
            }
          }
          
          if (!usedIds.has(existingId)) {
            usedIds.add(existingId);
            map[existingId] = {
              filePath,
              start,
              end,
              tagName,
              kind: 'jsx-opening-element',
            };
          }
          return;
        }

        // Генерируем новый ID в формате mrpak
        let id = makeMrpakId({ filePath, start, end, tagName });
        if (usedIds.has(id)) {
          let n = 2;
          while (usedIds.has(`${id}:${n}`)) {
            n++;
          }
          id = `${id}:${n}`;
        }
        usedIds.add(id);

        // Добавляем атрибут через модификацию AST
        const idAttr = t.jsxAttribute(
          t.jsxIdentifier('data-no-code-ui-id'),
          t.stringLiteral(id)
        );
        node.attributes.push(idAttr);

        map[id] = {
          filePath,
          start,
          end,
          tagName,
          kind: 'jsx-opening-element',
        };
      },
    });
  } catch (error) {
    console.warn('[AstJsxInstrumenter] Traverse error:', error);
    throw new Error('AST_TRAVERSAL_FAILED');
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
    console.warn('[AstJsxInstrumenter] Generation error:', error);
    throw new Error('AST_GENERATION_FAILED');
  }

  // Сохраняем AST дерево асинхронно в фоне, если передан projectRoot
  if (opts.projectRoot) {
    // Запускаем сохранение в фоне, не блокируя выполнение
    saveAstTree({
      projectRoot: opts.projectRoot,
      targetFilePath: filePath,
      ast: ast,
      map: map,
    }).catch(error => {
      // Не прерываем выполнение при ошибке сохранения AST
      console.warn('[AstJsxInstrumenter] Failed to save AST tree:', error);
    });
  }

  return { code: generatedCode, map, ast: opts.includeAst ? ast : undefined };
}

