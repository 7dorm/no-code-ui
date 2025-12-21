// Синхронизация изменений кода с визуальным редактором через AST
// Используется для bidirectional editing

import { parse } from '@babel/parser';
import { diffAst } from './AstDiff';
import { loadAstTree } from './AstTreeStore';

/**
 * Парсит код в AST
 * @param {string} code - исходный код
 * @param {string} filePath - путь к файлу
 * @returns {Object|null} AST или null при ошибке
 */
function parseCodeToAst(code, filePath) {
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

  try {
    return parse(String(code ?? ''), {
      sourceType: 'module',
      plugins,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (error) {
    console.warn('[AstSync] Parse error:', error);
    return null;
  }
}

/**
 * Восстанавливает AST из сериализованного формата (упрощенная версия)
 * Для полного восстановления нужно парсить код заново
 * @param {Object} serializedAst - сериализованное AST из ast-tree.json
 * @returns {Object|null} AST или null
 */
function deserializeAst(serializedAst) {
  // Для упрощения, мы будем использовать сохраненный AST только для сравнения ID
  // Полное восстановление AST требует парсинга кода
  return serializedAst;
}

/**
 * Синхронизирует изменения в коде с визуальным редактором
 * @param {Object} params - параметры
 * @param {string} params.code - новый код
 * @param {string} params.filePath - путь к файлу
 * @param {string} params.projectRoot - корень проекта
 * @param {Object} params.oldAst - старое AST (опционально, будет загружено если не передано)
 * @param {Function} params.onChange - callback для применения изменений в редакторе
 * @returns {Promise<Object>} { ok: boolean, changes?: Array, error?: string }
 */
export async function syncCodeChangesToEditor({ code, filePath, projectRoot, oldAst, onChange }) {
  if (!code || !filePath) {
    return { ok: false, error: 'code and filePath are required' };
  }

  // Парсим новый код в AST
  const newAst = parseCodeToAst(code, filePath);
  if (!newAst) {
    return { ok: false, error: 'Failed to parse new code' };
  }

  // Загружаем старое AST, если не передано
  let previousAst = oldAst;
  if (!previousAst && projectRoot) {
    const loadResult = await loadAstTree({ projectRoot, targetFilePath: filePath });
    if (loadResult.ok && loadResult.data && loadResult.data.ast) {
      // Для сравнения используем сохраненный AST
      // Но для точного diff нужно парсить старый код
      previousAst = loadResult.data.ast;
    }
  }

  // Если нет старого AST, не можем сделать diff
  if (!previousAst) {
    return { ok: true, changes: [], message: 'No previous AST to compare' };
  }

  // Сравниваем AST
  const diff = diffAst(previousAst, newAst);

  // Применяем изменения через callback
  if (onChange && typeof onChange === 'function') {
    for (const change of diff.changes) {
      try {
        await onChange(change);
      } catch (error) {
        console.warn('[AstSync] Failed to apply change:', change, error);
      }
    }
  }

  return { ok: true, changes: diff.changes, diff };
}

/**
 * Создает команды для обновления визуального редактора на основе изменений AST
 * @param {Array} changes - массив изменений из diffAst
 * @returns {Array} массив команд для iframe
 */
export function createEditorCommandsFromChanges(changes) {
  const commands = [];

  for (const change of changes) {
    if (change.type === 'style') {
      // Команда для обновления стиля
      commands.push({
        type: 'CMD_SET_STYLE',
        id: change.id,
        patch: {
          [change.property]: change.newValue,
        },
      });
    } else if (change.type === 'text') {
      // Команда для обновления текста
      commands.push({
        type: 'CMD_SET_TEXT',
        id: change.id,
        text: change.newValue,
      });
    } else if (change.type === 'structure') {
      if (change.action === 'added') {
        // Новый элемент - нужно будет добавить через insert
        // Но для этого нужен HTML/JSX код элемента
        commands.push({
          type: 'CMD_INSERT',
          targetId: change.parentId,
          mode: 'child',
          // snippet будет добавлен отдельно
        });
      } else if (change.action === 'removed') {
        // Удаление элемента
        commands.push({
          type: 'CMD_DELETE',
          id: change.id,
        });
      } else if (change.action === 'moved') {
        // Перемещение элемента
        commands.push({
          type: 'CMD_REPARENT',
          sourceId: change.id,
          targetParentId: change.newParentId,
        });
      }
    }
  }

  return commands;
}

