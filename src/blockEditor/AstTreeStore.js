// Хранилище AST деревьев в .mrpak/ast-tree.json
// Аналогично LayerNamesStore.js

import { readFile, writeFile, ensureDir } from '../shared/api/electron-api';

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/');
}

function joinPath(a, b) {
  const aa = normalizePath(a).replace(/\/+$/, '');
  const bb = normalizePath(b).replace(/^\/+/, '');
  return `${aa}/${bb}`;
}

export function getAstTreeStorePaths(projectRoot) {
  const root = normalizePath(projectRoot);
  const dirPath = joinPath(root, '.mrpak');
  const filePath = joinPath(dirPath, 'ast-tree.json');
  return { dirPath, filePath };
}

/**
 * Сериализует AST узел в упрощенный JSON формат
 * @param {Object} node - AST узел из Babel
 * @param {Object} options - опции
 * @returns {Object} упрощенное представление узла
 */
function serializeAstNode(node, options = {}) {
  if (!node || typeof node !== 'object') {
    return node;
  }

  const { maxDepth = 10, currentDepth = 0 } = options;
  
  if (currentDepth >= maxDepth) {
    return { type: '...', message: 'Max depth reached' };
  }

  const result = {
    type: node.type || 'Unknown',
  };

  // Добавляем позиции, если есть
  if (node.start != null) result.start = node.start;
  if (node.end != null) result.end = node.end;
  if (node.loc) {
    result.loc = {
      start: node.loc.start ? { line: node.loc.start.line, column: node.loc.start.column } : null,
      end: node.loc.end ? { line: node.loc.end.line, column: node.loc.end.column } : null,
    };
  }

  // Обрабатываем специфичные поля в зависимости от типа узла
  if (node.type === 'JSXOpeningElement' || node.type === 'JSXElement') {
    if (node.name) {
      if (node.name.type === 'JSXIdentifier') {
        result.name = node.name.name;
      } else if (node.name.type === 'JSXMemberExpression') {
        result.name = 'MemberExpression';
        result.nameObject = serializeAstNode(node.name.object, { ...options, currentDepth: currentDepth + 1 });
      } else {
        result.name = serializeAstNode(node.name, { ...options, currentDepth: currentDepth + 1 });
      }
    }
    
    if (node.attributes && Array.isArray(node.attributes)) {
      result.attributes = node.attributes.slice(0, 20).map(attr => {
        if (attr.type === 'JSXAttribute') {
          return {
            type: 'JSXAttribute',
            name: attr.name?.name || 'unknown',
            value: attr.value ? serializeAstNode(attr.value, { ...options, currentDepth: currentDepth + 1 }) : null,
          };
        }
        return serializeAstNode(attr, { ...options, currentDepth: currentDepth + 1 });
      });
      if (node.attributes.length > 20) {
        result.attributesTruncated = true;
        result.totalAttributes = node.attributes.length;
      }
    }
  }

  if (node.type === 'JSXFragment') {
    result.fragment = true;
  }

  if (node.type === 'JSXText') {
    result.value = String(node.value || '').substring(0, 100);
    if (node.value && node.value.length > 100) {
      result.valueTruncated = true;
    }
  }

  if (node.type === 'JSXExpressionContainer') {
    result.expression = serializeAstNode(node.expression, { ...options, currentDepth: currentDepth + 1 });
  }

  // Для детей JSX элементов
  if (node.children && Array.isArray(node.children)) {
    result.children = node.children.slice(0, 50).map(child => 
      serializeAstNode(child, { ...options, currentDepth: currentDepth + 1 })
    );
    if (node.children.length > 50) {
      result.childrenTruncated = true;
      result.totalChildren = node.children.length;
    }
  }

  // Для других типов узлов - добавляем основные поля
  if (node.type === 'Program') {
    result.bodyLength = node.body?.length || 0;
  }

  if (node.type === 'ImportDeclaration') {
    result.source = node.source?.value || null;
    result.specifiers = node.specifiers?.map(s => ({
      type: s.type,
      imported: s.imported?.name || null,
      local: s.local?.name || null,
    })) || [];
  }

  if (node.type === 'ExportDefaultDeclaration' || node.type === 'ExportNamedDeclaration') {
    result.declaration = serializeAstNode(node.declaration, { ...options, currentDepth: currentDepth + 1 });
  }

  return result;
}

/**
 * Сохраняет AST дерево для файла
 * @param {Object} params - параметры
 * @param {string} params.projectRoot - корень проекта
 * @param {string} params.targetFilePath - путь к файлу
 * @param {Object} params.ast - AST дерево из Babel
 * @param {Object} params.map - карта элементов (из instrumentJsxWithAst)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function saveAstTree({ projectRoot, targetFilePath, ast, map }) {
  if (!projectRoot || !targetFilePath) {
    return { ok: false, error: 'projectRoot and targetFilePath are required' };
  }

  const { dirPath, filePath } = getAstTreeStorePaths(projectRoot);
  const key = normalizePath(targetFilePath);

  try {
    await ensureDir(dirPath);

    let json = {};
    const readRes = await readFile(filePath);
    if (readRes?.success) {
      try {
        json = JSON.parse(readRes.content || '{}') || {};
      } catch {
        json = {};
      }
    }

    // Сериализуем AST
    const serializedAst = ast ? serializeAstNode(ast, { maxDepth: 15 }) : null;

    // Сохраняем данные для файла
    json[key] = {
      timestamp: new Date().toISOString(),
      ast: serializedAst,
      map: map || {},
      astType: ast?.type || 'unknown',
      programBodyLength: ast?.program?.body?.length || 0,
    };

    const writeRes = await writeFile(filePath, JSON.stringify(json, null, 2), { backup: true });
    if (!writeRes?.success) {
      return { ok: false, error: writeRes?.error || 'Ошибка записи ast-tree.json' };
    }
    
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Загружает AST дерево для файла
 * @param {Object} params - параметры
 * @param {string} params.projectRoot - корень проекта
 * @param {string} params.targetFilePath - путь к файлу
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function loadAstTree({ projectRoot, targetFilePath }) {
  const { filePath } = getAstTreeStorePaths(projectRoot);
  const key = normalizePath(targetFilePath);

  try {
    const res = await readFile(filePath);
    if (!res?.success) {
      return { ok: true, data: null };
    }

    const json = JSON.parse(res.content || '{}');
    const data = json && typeof json === 'object' && json[key] ? json[key] : null;
    
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message, data: null };
  }
}

