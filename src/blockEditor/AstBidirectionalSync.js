// Двусторонняя синхронизация между двумя AST: editorAST (код) и constructorAST (конструктор)
// При изменении конструктора -> обновляем код
// При изменении кода -> обновляем конструктор

import { parse } from '@babel/parser';
import generate from '@babel/generator';
import { diffAst } from './AstDiff';
import { MRPAK_CMD } from '../EditorProtocol';
import { isTypeScriptFile } from './AstUtils';

/**
 * Парсит код в AST
 * @param {string} code - исходный код
 * @param {string} filePath - путь к файлу
 * @returns {Object|null} AST или null при ошибке
 */
export function parseCodeToAst(code, filePath) {
  if (!code || typeof code !== 'string') {
    return null;
  }

  const plugins = ['jsx'];
  if (isTypeScriptFile(filePath)) {
    plugins.push('typescript', 'classProperties', 'decorators-legacy', 'optionalChaining', 'nullishCoalescingOperator');
  }

  try {
    return parse(code, {
      sourceType: 'module',
      plugins,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (error) {
    console.warn('[AstBidirectionalSync] Parse error:', error);
    return null;
  }
}

/**
 * Генерирует код из AST с сохранением форматирования
 * @param {Object} ast - AST дерево
 * @param {string} originalCode - оригинальный код (для сохранения форматирования)
 * @returns {string} сгенерированный код
 */
export function generateCodeFromAst(ast, originalCode = '') {
  if (!ast) {
    return originalCode;
  }

  try {
    const result = generate(ast, {
      retainLines: true,
      compact: false,
      jsescOption: { minimal: true },
      comments: true,
    }, originalCode);
    return result.code;
  } catch (error) {
    console.warn('[AstBidirectionalSync] Generation error:', error);
    return originalCode;
  }
}

/**
 * Синхронизирует изменения из конструктора в код
 * Обновляет editorAST на основе constructorAST и генерирует новый код
 * @param {Object} params - параметры
 * @param {Object} params.constructorAST - AST конструктора (источник изменений)
 * @param {Object} params.editorAST - текущий AST редактора кода
 * @param {string} params.filePath - путь к файлу
 * @param {string} params.originalCode - оригинальный код (для форматирования)
 * @returns {Object} { ok: boolean, code?: string, ast?: Object, error?: string }
 */
export function syncConstructorToCode({ constructorAST, editorAST, filePath, originalCode }) {
  if (!constructorAST) {
    return { ok: false, error: 'constructorAST is required' };
  }

  try {
    // Генерируем код из constructorAST
    const newCode = generateCodeFromAst(constructorAST, originalCode);
    
    // Парсим новый код обратно в editorAST для синхронизации
    const newEditorAST = parseCodeToAst(newCode, filePath);
    
    if (!newEditorAST) {
      return { ok: false, error: 'Failed to parse generated code' };
    }

    return {
      ok: true,
      code: newCode,
      ast: newEditorAST,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Синхронизирует изменения из кода в конструктор
 * Обновляет constructorAST на основе editorAST и отправляет команды в iframe
 * @param {Object} params - параметры
 * @param {Object} params.editorAST - AST редактора кода (источник изменений)
 * @param {Object} params.constructorAST - текущий AST конструктора
 * @param {string} params.filePath - путь к файлу
 * @param {Function} params.sendCommandToIframe - функция для отправки команд в iframe
 * @returns {Object} { ok: boolean, ast?: Object, changes?: Array, error?: string }
 */
export function syncCodeToConstructor({ editorAST, constructorAST, filePath, sendCommandToIframe }) {
  if (!editorAST) {
    return { ok: false, error: 'editorAST is required' };
  }

  try {
    // Если constructorAST еще нет, используем editorAST как основу
    if (!constructorAST) {
      return {
        ok: true,
        ast: editorAST,
        changes: [],
        message: 'Constructor AST initialized from editor AST',
      };
    }

    // Сравниваем AST для обнаружения изменений
    const diff = diffAst(constructorAST, editorAST);

    // Применяем изменения в конструкторе через команды iframe
    if (sendCommandToIframe && typeof sendCommandToIframe === 'function') {
      for (const change of diff.changes) {
        try {
          if (change.type === 'style') {
            sendCommandToIframe({
              type: MRPAK_CMD.SET_STYLE,
              id: change.id,
              patch: {
                [change.property]: change.newValue,
              },
            });
          } else if (change.type === 'text') {
            sendCommandToIframe({
              type: MRPAK_CMD.SET_TEXT,
              id: change.id,
              text: change.newValue,
            });
          } else if (change.type === 'structure') {
            if (change.action === 'removed') {
              sendCommandToIframe({
                type: MRPAK_CMD.DELETE,
                id: change.id,
              });
            } else if (change.action === 'moved') {
              sendCommandToIframe({
                type: MRPAK_CMD.REPARENT,
                sourceId: change.id,
                targetParentId: change.newParentId,
              });
            } else if (change.action === 'added') {
              // Для добавленных элементов нужен HTML/JSX код
              // Это будет обработано отдельно через insert команды
              console.log('[AstBidirectionalSync] Element added, may need manual insert:', change);
            }
          }
        } catch (error) {
          console.warn('[AstBidirectionalSync] Failed to apply change:', change, error);
        }
      }
    }

    // Обновляем constructorAST на основе editorAST
    return {
      ok: true,
      ast: editorAST, // Используем editorAST как новый constructorAST
      changes: diff.changes,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

