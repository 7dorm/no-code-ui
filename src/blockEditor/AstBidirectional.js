// Система bidirectional editing через два AST дерева
// codeAST - AST из кода (парсится из файла)
// constructorAST - AST для конструктора (изменяется при взаимодействии)

import { parse } from '@babel/parser';
import generate from '@babel/generator';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { isTypeScriptFile, isJavaScriptFile } from './AstUtils';
import { saveAstTree } from './AstTreeStore';
import { instrumentJsxWithAst } from './AstJsxInstrumenter';

/**
 * Парсит код в AST
 */
function parseCodeToAst(code, filePath) {
  const plugins = ['jsx'];
  if (isTypeScriptFile(filePath)) {
    plugins.push('typescript', 'classProperties', 'decorators-legacy', 'optionalChaining', 'nullishCoalescingOperator');
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
    console.warn('[AstBidirectional] Parse error:', error);
    return null;
  }
}

/**
 * Генерирует код из AST
 */
function generateCodeFromAst(ast, originalCode) {
  try {
    const result = generate(ast, {
      retainLines: true,
      compact: false,
      jsescOption: { minimal: true },
      comments: true,
    }, originalCode);
    return { ok: true, code: result.code };
  } catch (error) {
    console.warn('[AstBidirectional] Generate error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Класс для управления двумя AST деревьями
 */
export class AstBidirectionalManager {
  constructor(filePath, projectRoot) {
    this.filePath = filePath;
    this.projectRoot = projectRoot;
    this.codeAST = null; // AST из кода
    this.constructorAST = null; // AST для конструктора
    this.originalCode = ''; // Оригинальный код для генерации
  }

  /**
   * Инициализирует оба AST из кода
   * ВАЖНО: код должен быть уже инструментирован (содержать data-no-code-ui-id)
   */
  async initializeFromCode(code) {
    // Для JS/TS файлов: инструментируем код перед парсингом, если он еще не инструментирован
    let codeToParse = code;
    if (isJavaScriptFile(this.filePath)) {
      try {
        // Проверяем, есть ли уже ID в коде
        const hasIds = /data-no-code-ui-id|data-mrpak-id/.test(code);
        if (!hasIds) {
          // Инструментируем код через AST, чтобы добавить ID
          const instResult = instrumentJsxWithAst(code, this.filePath, { projectRoot: this.projectRoot });
          codeToParse = instResult.code;
          console.log('[AstBidirectional] Code instrumented during initialization');
        }
      } catch (error) {
        console.warn('[AstBidirectional] Failed to instrument code during initialization:', error);
        // Продолжаем с исходным кодом
      }
    }
    
    this.originalCode = codeToParse;
    this.codeAST = parseCodeToAst(codeToParse, this.filePath);
    
    if (!this.codeAST) {
      return { ok: false, error: 'Failed to parse code to AST' };
    }

    // Клонируем AST для конструктора (глубокая копия через JSON)
    // Для полного клонирования используем traverse
    this.constructorAST = this.cloneAst(this.codeAST);

    return { ok: true, codeAST: this.codeAST, constructorAST: this.constructorAST };
  }

  /**
   * Клонирует AST через парсинг сгенерированного кода
   * Это более надежный способ, чем JSON сериализация
   */
  cloneAst(ast) {
    try {
      // Генерируем код из AST
      const generated = generateCodeFromAst(ast, this.originalCode);
      if (!generated.ok) {
        console.warn('[AstBidirectional] Failed to generate code for cloning, using original AST');
        return ast;
      }
      
      // Парсим обратно в AST
      const cloned = parseCodeToAst(generated.code, this.filePath);
      if (!cloned) {
        console.warn('[AstBidirectional] Failed to parse cloned code, using original AST');
        return ast;
      }
      
      return cloned;
    } catch (error) {
      console.warn('[AstBidirectional] Clone error, using original:', error);
      return ast;
    }
  }

  /**
   * Восстанавливает AST из сериализованного формата
   */
  reconstructAst(serialized) {
    // Для упрощения, просто возвращаем сериализованный объект
    // В будущем можно добавить полное восстановление через Babel builders
    return serialized;
  }

  /**
   * Извлекает ID из JSX узла
   */
  extractIdFromNode(node) {
    if (!node || !node.attributes) return null;
    for (const attr of node.attributes) {
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
        const attrName = attr.name.name;
        if (attrName === 'data-no-code-ui-id' || attrName === 'data-mrpak-id') {
          const value = attr.value;
          if (t.isStringLiteral(value)) {
            return value.value;
          }
          // Также проверяем JSXExpressionContainer с строкой
          if (t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression)) {
            return value.expression.value;
          }
        }
      }
    }
    return null;
  }

  /**
   * Обновляет стили в JSX узле
   */
  updateStyleInNode(node, patch) {
    // Находим или создаем style атрибут
    let styleAttr = node.attributes.find(
      attr => t.isJSXAttribute(attr) && 
              t.isJSXIdentifier(attr.name) && 
              attr.name.name === 'style'
    );

    if (!styleAttr) {
      // Создаем новый style атрибут
      styleAttr = t.jsxAttribute(
        t.jsxIdentifier('style'),
        t.jsxExpressionContainer(t.objectExpression([]))
      );
      node.attributes.push(styleAttr);
    }

    // Обновляем объект стилей
    if (t.isJSXExpressionContainer(styleAttr.value) && 
        t.isObjectExpression(styleAttr.value.expression)) {
      const styleObj = styleAttr.value.expression;
      
      // Обновляем или добавляем свойства
      for (const [key, value] of Object.entries(patch)) {
        const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        const existingProp = styleObj.properties.find(
          p => t.isObjectProperty(p) && 
               t.isIdentifier(p.key) && 
               p.key.name === camelKey
        );

        const valueNode = typeof value === 'string' 
          ? t.stringLiteral(value)
          : typeof value === 'number'
          ? t.numericLiteral(value)
          : typeof value === 'boolean'
          ? t.booleanLiteral(value)
          : t.stringLiteral(String(value));

        if (existingProp) {
          existingProp.value = valueNode;
        } else {
          styleObj.properties.push(
            t.objectProperty(t.identifier(camelKey), valueNode)
          );
        }
      }
    }
  }

  /**
   * Обновляет текст в JSX элементе
   */
  updateTextInNode(jsxElementPath, text) {
    if (!jsxElementPath || !t.isJSXElement(jsxElementPath.node)) return;
    
    // Заменяем детей на новый текст
    const textNode = t.jsxText(String(text || ''));
    jsxElementPath.node.children = [textNode];
  }

  /**
   * Парсит JSX snippet в AST элемент
   */
  parseJsxSnippet(jsxCode) {
    const plugins = ['jsx'];
    if (isTypeScriptFile(this.filePath)) {
      plugins.push('typescript', 'classProperties', 'decorators-legacy', 'optionalChaining', 'nullishCoalescingOperator');
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
      console.warn('[AstBidirectional] Failed to parse JSX snippet:', error);
      return null;
    }
  }

  /**
   * Обновляет codeAST при изменении в конструкторе
   * @param {string} elementId - ID элемента
   * @param {Object} changes - изменения { type: 'style'|'text'|'delete'|'insert'|'reparent', ... }
   */
  updateCodeAST(elementId, changes) {
    if (!this.codeAST) {
      console.warn('[AstBidirectional] codeAST not initialized');
      return { ok: false, error: 'codeAST not initialized' };
    }

    let modified = false;
    const self = this;

    if (changes.type === 'delete') {
      // Удаление элемента
      traverse(this.codeAST, {
        JSXElement(path) {
          const openingElement = path.node.openingElement;
          const id = self.extractIdFromNode(openingElement);
          
          if (id === elementId) {
            path.remove();
            modified = true;
            path.stop();
          }
        }
      });
    } else if (changes.type === 'insert') {
      // Вставка элемента
      const targetId = changes.targetId;
      const snippet = changes.snippet;
      const mode = changes.mode || 'child';
      
      if (!targetId || !snippet) {
        return { ok: false, error: 'targetId and snippet required for insert' };
      }
      
      // Парсим snippet в AST
      const jsxNode = this.parseJsxSnippet(snippet);
      if (!jsxNode) {
        return { ok: false, error: 'Failed to parse snippet' };
      }
      
      // Находим целевой элемент
      let targetPath = null;
      traverse(this.codeAST, {
        JSXOpeningElement(path) {
          const node = path.node;
          const id = self.extractIdFromNode(node);
          if (id === targetId) {
            // Находим JSX элемент
            let jsxElementPath = path;
            while (jsxElementPath && !t.isJSXElement(jsxElementPath.node) && !t.isJSXFragment(jsxElementPath.node)) {
              jsxElementPath = jsxElementPath.parentPath;
            }
            if (jsxElementPath) {
              targetPath = jsxElementPath;
              path.stop();
            }
          }
        }
      });
      
      if (!targetPath) {
        return { ok: false, error: 'Target element not found' };
      }
      
      // Вставляем элемент
      if (mode === 'child') {
        targetPath.node.children.push(jsxNode);
      } else if (mode === 'sibling') {
        // Вставляем как соседний элемент
        const parentPath = targetPath.parentPath;
        if (parentPath && (t.isJSXElement(parentPath.node) || t.isJSXFragment(parentPath.node))) {
          const index = parentPath.node.children.indexOf(targetPath.node);
          if (index >= 0) {
            parentPath.node.children.splice(index + 1, 0, jsxNode);
          } else {
            parentPath.node.children.push(jsxNode);
          }
        }
      }
      
      modified = true;
    } else if (changes.type === 'reparent') {
      // Перемещение элемента
      const sourceId = changes.sourceId;
      const targetParentId = changes.targetParentId;
      
      if (!sourceId || !targetParentId) {
        return { ok: false, error: 'sourceId and targetParentId required for reparent' };
      }
      
      // Находим исходный элемент
      let sourcePath = null;
      let targetParentPath = null;
      
      traverse(this.codeAST, {
        JSXOpeningElement(path) {
          const node = path.node;
          const id = self.extractIdFromNode(node);
          
          if (id === sourceId) {
            let jsxElementPath = path;
            while (jsxElementPath && !t.isJSXElement(jsxElementPath.node) && !t.isJSXFragment(jsxElementPath.node)) {
              jsxElementPath = jsxElementPath.parentPath;
            }
            if (jsxElementPath) {
              sourcePath = jsxElementPath;
            }
          }
          
          if (id === targetParentId) {
            let jsxElementPath = path;
            while (jsxElementPath && !t.isJSXElement(jsxElementPath.node) && !t.isJSXFragment(jsxElementPath.node)) {
              jsxElementPath = jsxElementPath.parentPath;
            }
            if (jsxElementPath) {
              targetParentPath = jsxElementPath;
            }
          }
        }
      });
      
      if (!sourcePath || !targetParentPath) {
        return { ok: false, error: 'Source or target parent element not found' };
      }
      
      // Удаляем из старого места
      const sourceParentPath = sourcePath.parentPath;
      if (sourceParentPath && (t.isJSXElement(sourceParentPath.node) || t.isJSXFragment(sourceParentPath.node))) {
        const index = sourceParentPath.node.children.indexOf(sourcePath.node);
        if (index >= 0) {
          sourceParentPath.node.children.splice(index, 1);
        }
      }
      
      // Добавляем в новое место
      targetParentPath.node.children.push(sourcePath.node);
      
      modified = true;
    } else {
      // style или text
      let foundElement = false;
      traverse(this.codeAST, {
        JSXOpeningElement(path) {
          const node = path.node;
          const id = self.extractIdFromNode(node);
          
          if (id === elementId) {
            foundElement = true;
            console.log('[AstBidirectional] Element found, applying changes:', changes.type);
            
            if (changes.type === 'style' && changes.patch) {
              // Обновляем стили в AST
              self.updateStyleInNode(node, changes.patch);
              modified = true;
              path.stop();
            } else if (changes.type === 'text' && changes.text !== undefined) {
              // Находим JSX элемент для обновления текста
              const jsxElementPath = path.findParent(p => t.isJSXElement(p.node));
              if (jsxElementPath) {
                self.updateTextInNode(jsxElementPath, changes.text);
                modified = true;
                path.stop();
              }
            }
          }
        }
      });
      
      if (!foundElement) {
        console.warn('[AstBidirectional] Element not found in AST:', {
          elementId,
          astType: this.codeAST?.type,
          hasProgram: !!this.codeAST?.program,
          programBodyLength: this.codeAST?.program?.body?.length
        });
        
        // Попробуем найти все ID в AST для отладки
        const allIds = [];
        const allAttributes = [];
        traverse(this.codeAST, {
          JSXOpeningElement(path) {
            const id = self.extractIdFromNode(path.node);
            if (id) {
              allIds.push(id);
            }
            // Собираем все атрибуты для отладки
            if (path.node.attributes) {
              path.node.attributes.forEach(attr => {
                if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                  const attrName = attr.name.name;
                  if (attrName === 'data-no-code-ui-id' || attrName === 'data-mrpak-id') {
                    allAttributes.push({
                      name: attrName,
                      value: attr.value ? (t.isStringLiteral(attr.value) ? attr.value.value : 'non-string') : 'null'
                    });
                  }
                }
              });
            }
          }
        });
        console.log('[AstBidirectional] All IDs found in AST:', allIds);
        console.log('[AstBidirectional] All ID attributes found in AST:', allAttributes);
        console.log('[AstBidirectional] Looking for elementId:', elementId);
        
        // Проверяем, есть ли элемент с похожим ID
        const similarIds = allIds.filter(id => id && elementId && (
          id.includes(elementId.split(':').pop()) || 
          elementId.includes(id.split(':').pop())
        ));
        if (similarIds.length > 0) {
          console.log('[AstBidirectional] Found similar IDs:', similarIds);
        }
      }
    }

    if (modified) {
      return { ok: true, modified: true, ast: this.codeAST };
    }

    return { ok: false, error: 'Element not found or no changes applied' };
  }

  /**
   * Обновляет constructorAST при изменении кода
   * @param {string} elementId - ID элемента (опционально, для логирования)
   * @param {Object} changes - изменения из diff
   */
  updateConstructorASTFromCode(changes) {
    if (!this.codeAST) {
      console.warn('[AstBidirectional] codeAST not initialized');
      return { ok: false, error: 'codeAST not initialized' };
    }

    // Синхронизируем constructorAST с codeAST (клонируем)
    this.constructorAST = this.cloneAst(this.codeAST);
    
    return { ok: true, ast: this.constructorAST };
  }

  /**
   * Генерирует код из codeAST
   */
  generateCodeFromCodeAST() {
    if (!this.codeAST) {
      return { ok: false, error: 'codeAST not initialized' };
    }

    // Проверяем, что в AST есть ID перед генерацией
    const idsBeforeGenerate = [];
    const self = this;
    traverse(this.codeAST, {
      JSXOpeningElement(path) {
        const id = self.extractIdFromNode(path.node);
        if (id) {
          idsBeforeGenerate.push(id);
        }
      }
    });
    
    if (idsBeforeGenerate.length === 0) {
      console.warn('[AstBidirectional] No IDs found in codeAST before generation!');
    } else {
      console.log('[AstBidirectional] Found', idsBeforeGenerate.length, 'IDs in codeAST before generation');
    }

    const result = generateCodeFromAst(this.codeAST, this.originalCode);
    
    // Проверяем, что ID сохранились в сгенерированном коде
    if (result.ok && result.code) {
      const idsInGenerated = (result.code.match(/data-no-code-ui-id=["']([^"']+)["']/g) || []).length;
      const idsInGeneratedLegacy = (result.code.match(/data-mrpak-id=["']([^"']+)["']/g) || []).length;
      const totalIdsInGenerated = idsInGenerated + idsInGeneratedLegacy;
      
      if (totalIdsInGenerated === 0 && idsBeforeGenerate.length > 0) {
        console.error('[AstBidirectional] IDs were lost during code generation!', {
          idsBefore: idsBeforeGenerate.length,
          idsAfter: totalIdsInGenerated
        });
      } else if (totalIdsInGenerated !== idsBeforeGenerate.length) {
        console.warn('[AstBidirectional] ID count mismatch:', {
          idsBefore: idsBeforeGenerate.length,
          idsAfter: totalIdsInGenerated
        });
      }
    }

    return result;
  }

  /**
   * Обновляет constructorAST из codeAST (синхронизация)
   * Не обновляет конструктор напрямую - только обновляет AST дерево
   */
  syncConstructorASTFromCodeAST() {
    if (!this.codeAST) {
      return { ok: false, error: 'codeAST not initialized' };
    }

    // Синхронизируем constructorAST с codeAST (клонируем)
    this.constructorAST = this.cloneAst(this.codeAST);

    return { ok: true, constructorAST: this.constructorAST };
  }

  /**
   * Обновляет codeAST из нового кода и синхронизирует constructorAST
   * НЕ обновляет конструктор напрямую - он работает только через constructorAST
   * @param {string} newCode - новый код
   * @param {boolean} skipSyncConstructor - если true, не синхронизирует constructorAST (для предотвращения рекурсии)
   */
  async updateCodeASTFromCode(newCode, skipSyncConstructor = false) {
    // Для JS/TS файлов: убеждаемся, что код инструментирован
    let codeToParse = newCode;
    if (isJavaScriptFile(this.filePath)) {
      try {
        // Проверяем, есть ли уже ID в коде
        const hasIds = /data-no-code-ui-id|data-mrpak-id/.test(newCode);
        if (!hasIds) {
          // Инструментируем код через AST, чтобы добавить ID
          const instResult = instrumentJsxWithAst(newCode, this.filePath, { projectRoot: this.projectRoot });
          codeToParse = instResult.code;
          console.log('[AstBidirectional] Code instrumented during updateCodeASTFromCode');
        }
      } catch (error) {
        console.warn('[AstBidirectional] Failed to instrument code during updateCodeASTFromCode:', error);
        // Продолжаем с исходным кодом
      }
    }
    
    const newCodeAST = parseCodeToAst(codeToParse, this.filePath);
    
    if (!newCodeAST) {
      return { ok: false, error: 'Failed to parse new code' };
    }

    this.originalCode = codeToParse;
    this.codeAST = newCodeAST;
    
    // Синхронизируем constructorAST из codeAST только если не пропущено
    if (!skipSyncConstructor) {
      this.constructorAST = this.cloneAst(this.codeAST);
    }

    return { ok: true, codeAST: this.codeAST, constructorAST: this.constructorAST };
  }

  /**
   * Сохраняет constructorAST в файл
   */
  async saveConstructorAST(blockMap) {
    if (!this.projectRoot || !this.constructorAST) {
      return { ok: false, error: 'projectRoot or constructorAST not set' };
    }

    return await saveAstTree({
      projectRoot: this.projectRoot,
      targetFilePath: this.filePath,
      ast: this.constructorAST,
      map: blockMap || {},
    });
  }

  /**
   * Получает codeAST
   */
  getCodeAST() {
    return this.codeAST;
  }

  /**
   * Получает constructorAST
   */
  getConstructorAST() {
    return this.constructorAST;
  }
}

