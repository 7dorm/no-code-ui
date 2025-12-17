import { Framework } from './Framework';
import { instrumentHtml } from '../blockEditor/HtmlInstrumenter';
import { applyHtmlOp } from '../blockEditor/PatchEngine/applyHtmlInsertDelete';
import { applyStylePatch } from '../blockEditor/PatchEngine';
import { readFile, readFileBase64 } from '../shared/api/electron-api';
import { resolvePath } from '../features/file-renderer/lib/path-resolver';
import { toHtmlStyleAttr } from '../blockEditor/styleUtils';

/**
 * Реализация Framework для HTML файлов
 */
export class HtmlFramework extends Framework {
  /**
   * Инструментирует HTML код, добавляя data-no-code-ui-id атрибуты
   */
  instrument(code, filePath) {
    return instrumentHtml(code, filePath);
  }

  /**
   * Обрабатывает зависимости HTML файла (CSS, JS, изображения)
   */
  async processDependencies(code, filePath) {
    const dependencyPaths = [];
    let processedHTML = code;

    // Загружаем зависимый файл относительно основного файла
    const loadDependency = async (basePath, importPath) => {
      try {
        let resolvedPath = await resolvePath(basePath, importPath);
        
        // Если файл без расширения, пробуем добавить расширения
        const extMatch = resolvedPath.match(/\.([^.]+)$/);
        if (!extMatch) {
          const tryPaths = [
            resolvedPath + '.js',
            resolvedPath + '.jsx',
            resolvedPath + '.css',
            resolvedPath + '/index.js',
            resolvedPath + '/index.jsx'
          ];
          
          for (const tryPath of tryPaths) {
            try {
              const result = await readFile(tryPath);
              if (result.success) {
                return { success: true, content: result.content, path: tryPath };
              }
            } catch (e) {
              // Пробуем следующий путь
            }
          }
        } else {
          const result = await readFile(resolvedPath);
          if (result.success) {
            return { success: true, content: result.content, path: resolvedPath };
          }
        }
        
        return { success: false, error: `Файл не найден: ${importPath}` };
      } catch (error) {
        console.error('HtmlFramework: Error loading dependency:', error);
        return { success: false, error: error.message };
      }
    };

    // Регулярные выражения для поиска внешних зависимостей
    const cssLinkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const imgSrcRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

    // Обработка CSS файлов
    const cssMatches = [...code.matchAll(cssLinkRegex)];
    for (const match of cssMatches) {
      const cssPath = match[1];
      // Пропускаем внешние URL
      if (cssPath.startsWith('http://') || cssPath.startsWith('https://') || cssPath.startsWith('//')) {
        continue;
      }
      
      const depResult = await loadDependency(filePath, cssPath);
      if (depResult.success) {
        dependencyPaths.push(depResult.path);
        // Заменяем link на style с встроенным CSS
        const styleTag = `<style>\n/* ${cssPath} */\n${depResult.content}\n</style>`;
        processedHTML = processedHTML.replace(match[0], styleTag);
        console.log('HtmlFramework: Inlined CSS:', cssPath);
      } else {
        console.warn('HtmlFramework: Failed to load CSS:', cssPath, depResult.error);
      }
    }

    // Обработка внешних JS файлов (не модулей)
    const scriptMatches = [...code.matchAll(scriptSrcRegex)];
    for (const match of scriptMatches) {
      const scriptPath = match[1];
      // Пропускаем внешние URL и CDN
      if (scriptPath.startsWith('http://') || scriptPath.startsWith('https://') || scriptPath.startsWith('//')) {
        continue;
      }
      
      const depResult = await loadDependency(filePath, scriptPath);
      if (depResult.success) {
        dependencyPaths.push(depResult.path);
        // Заменяем script src на встроенный script
        const scriptTag = `<script>\n/* ${scriptPath} */\n${depResult.content}\n</script>`;
        processedHTML = processedHTML.replace(match[0], scriptTag);
        console.log('HtmlFramework: Inlined JS:', scriptPath);
      } else {
        console.warn('HtmlFramework: Failed to load JS:', scriptPath, depResult.error);
      }
    }

    // Обработка изображений (конвертируем в base64 для локальных файлов)
    const imgMatches = [...code.matchAll(imgSrcRegex)];
    for (const match of imgMatches) {
      const imgPath = match[1];
      // Пропускаем внешние URL и data: URLs
      if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('//') || imgPath.startsWith('data:')) {
        continue;
      }
      
      // Разрешаем путь к изображению
      const resolvedPath = await resolvePath(filePath, imgPath);
      
      // Читаем изображение как base64
      try {
        const result = await readFileBase64(resolvedPath);
        if (result.success) {
          dependencyPaths.push(resolvedPath);
          // Заменяем путь на data URL
          const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
          processedHTML = processedHTML.replace(match[1], dataUrl);
          console.log('HtmlFramework: Converted image to base64:', imgPath);
        } else {
          console.warn('HtmlFramework: Failed to load image:', imgPath, result.error);
        }
      } catch (e) {
        console.warn('HtmlFramework: Could not process image:', imgPath, e);
      }
    }

    return { processedCode: processedHTML, dependencyPaths };
  }

  /**
   * Генерирует HTML для превью/редактора
   */
  async generateHTML(code, filePath, options = {}) {
    // Обрабатываем зависимости
    const { processedCode, dependencyPaths } = await this.processDependencies(code, filePath);
    
    // Инструментируем исходный код для blockMapForFile
    const instOriginal = this.instrument(code, filePath);
    
    // Инструментируем обработанный код для blockMapForEditor
    const instProcessed = this.instrument(processedCode, filePath);
    
    return {
      html: instProcessed.html,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
      dependencyPaths
    };
  }

  /**
   * Применяет патч стилей к HTML элементу
   */
  applyStylePatch({ code, mapEntry, patch, externalStylesMap }) {
    return applyStylePatch({
      fileType: 'html',
      fileContent: code,
      mapEntry,
      patch,
      externalStylesMap
    });
  }

  /**
   * Вставляет новый элемент в HTML
   * @param {Object} params
   * @param {string} params.code - HTML код
   * @param {Object} params.targetEntry - запись target элемента (содержит selector)
   * @param {string} params.targetId - ID target элемента (ключ в blockMap)
   * @param {string} params.mode - 'child' или 'sibling'
   * @param {string} params.snippet - HTML код для вставки
   */
  applyInsert({ code, targetEntry, targetId, mode, snippet }) {
    return applyHtmlOp({
      html: code,
      op: {
        type: 'insert',
        targetSelector: targetEntry?.selector || null,
        targetId: targetId || null,
        mode: mode === 'sibling' ? 'sibling' : 'child',
        html: snippet
      }
    });
  }

  /**
   * Удаляет элемент из HTML
   * @param {Object} params
   * @param {string} params.code - HTML код
   * @param {Object} params.entry - запись элемента (содержит selector)
   * @param {string} params.blockId - ID элемента (ключ в blockMap)
   */
  applyDelete({ code, entry, blockId }) {
    return applyHtmlOp({
      html: code,
      op: {
        type: 'delete',
        selector: entry?.selector || null,
        id: blockId || null
      }
    });
  }

  /**
   * Переносит элемент в другого родителя
   * @param {Object} params
   * @param {string} params.code - HTML код
   * @param {Object} params.sourceEntry - запись исходного элемента
   * @param {string} params.sourceId - ID исходного элемента
   * @param {Object} params.targetEntry - запись целевого родителя
   * @param {string} params.targetId - ID целевого родителя
   */
  applyReparent({ code, sourceEntry, sourceId, targetEntry, targetId }) {
    return applyHtmlOp({
      html: code,
      op: {
        type: 'reparent',
        sourceSelector: sourceEntry?.selector || null,
        sourceId: sourceId || null,
        targetSelector: targetEntry?.selector || null,
        targetId: targetId || null
      }
    });
  }

  /**
   * Изменяет текст элемента
   * @param {Object} params
   * @param {string} params.code - HTML код
   * @param {Object} params.entry - запись элемента
   * @param {string} params.blockId - ID элемента
   * @param {string} params.text - новый текст
   */
  applySetText({ code, entry, blockId, text }) {
    return applyHtmlOp({
      html: code,
      op: {
        type: 'setText',
        selector: entry?.selector || null,
        id: blockId || null,
        text: String(text ?? '')
      }
    });
  }

  /**
   * HTML не использует импорты стилей, возвращаем пустой объект
   */
  parseStyleImports(code) {
    return {};
  }

  /**
   * Удаляет служебные атрибуты из HTML
   */
  stripInstrumentationIds(code) {
    return String(code ?? '')
      .replace(/\sdata-no-code-ui-id\s*=\s*"[^"]*"/g, '')
      .replace(/\sdata-no-code-ui-id\s*=\s*'[^']*'/g, '')
      .replace(/\sdata-mrpak-id\s*=\s*"[^"]*"/g, '')
      .replace(/\sdata-mrpak-id\s*=\s*'[^']*'/g, '');
  }

  /**
   * Получает blockMap для исходного и обработанного кода
   */
  getBlockMaps(instrumentedCode, originalCode, filePath) {
    const instOriginal = this.instrument(originalCode, filePath);
    const instProcessed = this.instrument(instrumentedCode, filePath);
    
    return {
      blockMapForFile: instOriginal.map,
      blockMapForEditor: instProcessed.map
    };
  }

  /**
   * Находит элемент по ID в HTML коде
   */
  findElementById(code, id) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(code, 'text/html');
    const element = doc.querySelector(`[data-no-code-ui-id="${id}"]`) || 
                   doc.querySelector(`[data-mrpak-id="${id}"]`);
    
    if (!element) return null;
    
    // Возвращаем информацию о селекторе (HTML использует селекторы, а не позиции)
    return {
      selector: this._makeSelectorForElement(element),
      tagName: element.tagName ? element.tagName.toLowerCase() : 'el',
      id
    };
  }

  /**
   * Коммитит накопленные патчи и операции в HTML файл
   */
  async commitPatches({ originalCode, stagedPatches, stagedOps, blockMapForFile, externalStylesMap, filePath, resolvePath, readFile, writeFile }) {
    const entries = Object.entries(stagedPatches || {}).filter(
      ([id, p]) => id && p && Object.keys(p).length > 0
    );
    const ops = Array.isArray(stagedOps) ? stagedOps : [];
    
    let newContent = String(originalCode ?? '');
    
    // HTML: применяем операции последовательно, переинструментируя после каждой
    const htmlOps = ops.filter(
      (o) => o && (o.type === 'delete' || o.type === 'insert' || o.type === 'reparent' || o.type === 'setText')
    );
    
    // Переинструментируем исходный HTML перед первой операцией
    let currentHtml = newContent;
    let currentInst = this.instrument(currentHtml, filePath || 'temp');
    currentHtml = currentInst.html;
    let currentMap = currentInst.map || {};
    
    for (const op of htmlOps) {
      // Используем только blockId/targetId/sourceId/targetParentId для поиска
      const res = applyHtmlOp({
        html: currentHtml,
        op:
          op.type === 'delete'
            ? { type: 'delete', selector: null, id: op.blockId }
            : op.type === 'insert'
            ? { type: 'insert', targetSelector: null, targetId: op.targetId, mode: op.mode, html: op.snippet }
            : op.type === 'reparent'
            ? { type: 'reparent', sourceSelector: null, sourceId: op.sourceId, targetSelector: null, targetId: op.targetParentId }
            : op.type === 'setText'
            ? { type: 'setText', selector: null, id: op.blockId, text: op.text }
            : null,
      });
      if (!res || !res.ok) {
        throw new Error(res?.error || 'Не удалось применить HTML op');
      }
      
      // Переинструментируем после каждой операции
      currentHtml = res.html || currentHtml;
      currentInst = this.instrument(currentHtml, filePath || 'temp');
      currentHtml = currentInst.html;
      currentMap = currentInst.map || {};
    }
    
    // Финальный HTML уже переинструментирован
    newContent = currentHtml;
    const finalMap = currentMap;
    
    // Применяем стили
    for (const [id, patch] of entries) {
      const entry = finalMap[id] || blockMapForFile?.[id] || null;
      if (!entry) {
        console.warn(`HtmlFramework.commitPatches: entry not found for block ${id}`);
        continue;
      }
      
      const res = this.applyStylePatch({
        code: newContent,
        mapEntry: entry,
        patch,
        externalStylesMap
      });
      if (!res.ok) {
        throw new Error(res.error || `Не удалось применить изменения для блока ${id}`);
      }
      newContent = res.code || res.html || newContent;
    }
    
    // Убираем служебные атрибуты перед записью
    newContent = this.stripInstrumentationIds(newContent);
    
    return { ok: true, code: newContent };
  }

  /**
   * Вспомогательный метод для создания селектора элемента
   */
  _makeSelectorForElement(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const tag = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (!parent) {
        parts.push(tag);
        break;
      }
      const children = Array.from(parent.children);
      const idx = children.indexOf(cur);
      const nth = idx >= 0 ? idx + 1 : 1;
      parts.push(`${tag}:nth-child(${nth})`);
      cur = parent;
    }
    return parts.reverse().join(' > ');
  }

  /**
   * Добавляет data-no-code-ui-id в HTML сниппет, если атрибут ещё не задан
   */
  ensureSnippetHasMrpakId(snippet, mrpakId) {
    const s = String(snippet || '').trim();
    if (!s) return s;
    if (/\bdata-no-code-ui-id\s*=/.test(s) || /\bdata-mrpak-id\s*=/.test(s)) return s;
    // Вставляем сразу после имени тега: <Tag ...> / <div ...>
    return s.replace(
      /^<\s*([A-Za-z_$][A-Za-z0-9_$.-]*)\b/,
      `<$1 data-no-code-ui-id="${String(mrpakId)}"`
    );
  }

  /**
   * Строит HTML сниппет для вставки нового блока
   */
  buildInsertSnippet({ tag, text, stylePatch }) {
    const styleAttr = stylePatch ? toHtmlStyleAttr(stylePatch) : '';
    const attrs = styleAttr ? ` style="${styleAttr}"` : '';
    const tagName = tag || 'div';
    const body = text || '';
    
    // Для plain HTML используем inline onclick, чтобы не требовать внешних функций
    const isButton = tagName.toLowerCase() === 'button';
    const onClickAttr = isButton
      ? ` onclick="(function(ev){try{ev&&ev.preventDefault&&ev.preventDefault();console.log('Button clicked');}catch(e){}})(event)"`
      : '';
    
    return `<${tagName}${attrs}${onClickAttr}>${body}</${tagName}>`;
  }
}

