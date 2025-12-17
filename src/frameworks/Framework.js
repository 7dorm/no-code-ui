/**
 * Абстрактный класс Framework - интерфейс для обработки разных типов файлов
 * Каждая реализация (HTML, React, React Native) должна реализовать все методы
 */
export class Framework {
  /**
   * Инструментирует код, добавляя data-no-code-ui-id атрибуты к элементам
   * @param {string} code - исходный код файла
   * @param {string} filePath - путь к файлу
   * @returns {Object} { code: string, map: Object } - инструментированный код и карта элементов
   */
  instrument(code, filePath) {
    throw new Error('Framework.instrument() must be implemented');
  }

  /**
   * Генерирует HTML для превью/редактора
   * @param {string} code - исходный код файла
   * @param {string} filePath - путь к файлу
   * @param {Object} options - дополнительные опции (например, режим редактора)
   * @returns {Promise<Object>} { html: string, blockMapForEditor: Object, blockMapForFile: Object, dependencyPaths: string[] }
   */
  async generateHTML(code, filePath, options = {}) {
    throw new Error('Framework.generateHTML() must be implemented');
  }

  /**
   * Обрабатывает зависимости файла (CSS, JS, модули и т.д.)
   * @param {string} code - исходный код файла
   * @param {string} filePath - путь к файлу
   * @returns {Promise<Object>} { processedCode: string, dependencyPaths: string[] }
   */
  async processDependencies(code, filePath) {
    throw new Error('Framework.processDependencies() must be implemented');
  }

  /**
   * Применяет патч стилей к элементу
   * @param {Object} params
   * @param {string} params.code - код файла
   * @param {Object} params.mapEntry - запись из blockMap с информацией об элементе
   * @param {Object} params.patch - объект с изменениями стилей
   * @param {Object} params.externalStylesMap - карта внешних стилей
   * @returns {Object} { ok: boolean, code?: string, html?: string, error?: string, needsExternalPatch?: boolean, ... }
   */
  applyStylePatch({ code, mapEntry, patch, externalStylesMap }) {
    throw new Error('Framework.applyStylePatch() must be implemented');
  }

  /**
   * Вставляет новый элемент
   * @param {Object} params
   * @param {string} params.code - код файла
   * @param {Object} params.targetEntry - запись target элемента из blockMap
   * @param {string} params.targetId - ID target элемента (ключ в blockMap)
   * @param {string} params.mode - 'child' или 'sibling'
   * @param {string} params.snippet - HTML/JSX код для вставки
   * @returns {Object} { ok: boolean, code?: string, error?: string }
   */
  applyInsert({ code, targetEntry, targetId, mode, snippet }) {
    throw new Error('Framework.applyInsert() must be implemented');
  }

  /**
   * Удаляет элемент
   * @param {Object} params
   * @param {string} params.code - код файла
   * @param {Object} params.entry - запись элемента из blockMap
   * @param {string} params.blockId - ID элемента (ключ в blockMap)
   * @returns {Object} { ok: boolean, code?: string, error?: string }
   */
  applyDelete({ code, entry, blockId }) {
    throw new Error('Framework.applyDelete() must be implemented');
  }

  /**
   * Переносит элемент в другого родителя
   * @param {Object} params
   * @param {string} params.code - код файла
   * @param {Object} params.sourceEntry - запись исходного элемента
   * @param {string} params.sourceId - ID исходного элемента
   * @param {Object} params.targetEntry - запись целевого родителя
   * @param {string} params.targetId - ID целевого родителя
   * @returns {Object} { ok: boolean, code?: string, error?: string }
   */
  applyReparent({ code, sourceEntry, sourceId, targetEntry, targetId }) {
    throw new Error('Framework.applyReparent() must be implemented');
  }

  /**
   * Изменяет текст элемента
   * @param {Object} params
   * @param {string} params.code - код файла
   * @param {Object} params.entry - запись элемента из blockMap
   * @param {string} params.blockId - ID элемента (ключ в blockMap)
   * @param {string} params.text - новый текст
   * @returns {Object} { ok: boolean, code?: string, error?: string }
   */
  applySetText({ code, entry, blockId, text }) {
    throw new Error('Framework.applySetText() must be implemented');
  }

  /**
   * Парсит импорты стилей из кода
   * @param {string} code - исходный код файла
   * @returns {Object} { [varName]: { path: string, type: string } }
   */
  parseStyleImports(code) {
    throw new Error('Framework.parseStyleImports() must be implemented');
  }

  /**
   * Удаляет служебные атрибуты (data-no-code-ui-id, data-mrpak-id) перед записью в файл
   * @param {string} code - инструментированный код
   * @returns {string} - код без служебных атрибутов
   */
  stripInstrumentationIds(code) {
    throw new Error('Framework.stripInstrumentationIds() must be implemented');
  }

  /**
   * Получает blockMap для исходного файла и обработанного кода
   * @param {string} instrumentedCode - инструментированный код
   * @param {string} originalCode - исходный код
   * @param {string} filePath - путь к файлу
   * @returns {Object} { blockMapForFile: Object, blockMapForEditor: Object }
   */
  getBlockMaps(instrumentedCode, originalCode, filePath) {
    throw new Error('Framework.getBlockMaps() must be implemented');
  }

  /**
   * Коммитит накопленные патчи и операции в файл
   * @param {Object} params
   * @param {string} params.originalCode - исходный код файла
   * @param {Object} params.stagedPatches - { [blockId]: patchObject }
   * @param {Array} params.stagedOps - [{type:'insert'|'delete'|'reparent'|'setText', ...}]
   * @param {Object} params.blockMapForFile - карта элементов исходного файла
   * @param {Object} params.externalStylesMap - карта внешних стилей
   * @param {string} params.filePath - путь к файлу
   * @param {Function} params.resolvePath - функция для разрешения путей
   * @param {Function} params.readFile - функция для чтения файлов
   * @param {Function} params.writeFile - функция для записи файлов
   * @returns {Promise<Object>} { ok: boolean, code?: string, externalPatches?: Array, error?: string }
   */
  async commitPatches({ originalCode, stagedPatches, stagedOps, blockMapForFile, externalStylesMap, filePath, resolvePath, readFile, writeFile }) {
    throw new Error('Framework.commitPatches() must be implemented');
  }

  /**
   * Находит элемент по ID в коде
   * @param {string} code - код файла
   * @param {string} id - ID элемента (data-no-code-ui-id)
   * @returns {Object|null} { start: number, end: number, tagName: string } или null
   */
  findElementById(code, id) {
    throw new Error('Framework.findById() must be implemented');
  }

  /**
   * Добавляет data-no-code-ui-id в HTML/JSX сниппет, если атрибут ещё не задан
   * @param {string} snippet - HTML/JSX сниппет
   * @param {string} mrpakId - ID для добавления
   * @returns {string} - сниппет с добавленным атрибутом
   */
  ensureSnippetHasMrpakId(snippet, mrpakId) {
    throw new Error('Framework.ensureSnippetHasMrpakId() must be implemented');
  }

  /**
   * Строит сниппет для вставки нового блока
   * @param {Object} params
   * @param {string} params.tag - имя тега (div, View, Text и т.д.)
   * @param {string} params.text - текст содержимого
   * @param {Object} params.stylePatch - объект с изменениями стилей
   * @returns {string} - HTML/JSX сниппет для вставки
   */
  buildInsertSnippet({ tag, text, stylePatch }) {
    throw new Error('Framework.buildInsertSnippet() must be implemented');
  }
}

