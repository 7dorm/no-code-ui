import { Framework } from './Framework';
import { instrumentJsx } from '../blockEditor/JsxInstrumenter';
import { instrumentJsxWithAst } from '../blockEditor/AstJsxInstrumenter';
import { isJavaScriptFile } from '../blockEditor/AstUtils';
import { applyStylePatchWithAst } from '../blockEditor/PatchEngine/applyAstStylePatch';
import { applyDeleteWithAst, applyInsertWithAst } from '../blockEditor/PatchEngine/applyAstInsertDelete';
import {
  applyStylePatch,
  applyJsxDelete,
  applyJsxInsert,
  applyJsxReparent,
  applyJsxSetText,
  parseStyleImports,
  applyExternalStylePatch,
  replaceStyleReferenceInJsx,
} from '../blockEditor/PatchEngine';
import { extractImports } from '../features/file-renderer/lib/react-processor';
import { readFile, writeFile } from '../shared/api/electron-api';
import { resolvePath, resolvePathSync } from '../features/file-renderer/lib/path-resolver';
import { toReactStyleObjectText } from '../blockEditor/styleUtils';
import { generateReactHTML } from './react/generateHTML';
import { processReactCodeImpl } from './react/processReactCode';

/**
 * Реализация Framework для React файлов
 *
 * ВАЖНО: Этот класс использует сложную логику обработки зависимостей из RenderFile.jsx
 * В будущем эту логику можно вынести в отдельные модули для лучшей организации
 */
export class ReactFramework extends Framework {
  constructor(filePath, projectRoot = null) {
    super(filePath);
    this.filePath = filePath;
    this.projectRoot = projectRoot;
    // Кэш для загруженных зависимостей
    this._dependencyCache = new Map();
    // Мемоизированные функции для разрешения путей
    this.resolvePathMemo = (base, rel) => resolvePath(base, rel);
    this.resolvePathSyncMemo = (base, rel) => resolvePathSync(base, rel);
  }

  /**
   * Инструментирует JSX код, добавляя data-no-code-ui-id атрибуты
   * Использует AST парсинг для .js, .jsx, .ts, .tsx файлов с fallback на ручной парсинг
   * @param {string} code - код для инструментации
   * @param {string} filePath - путь к файлу
   * @param {Object} opts - опции (projectRoot?: string)
   */
  instrument(code, filePath, opts = {}) {
    // Используем AST парсинг для JavaScript/TypeScript файлов
    if (isJavaScriptFile(filePath)) {
      try {
        return instrumentJsxWithAst(code, filePath, { projectRoot: opts.projectRoot });
      } catch (error) {
        // Fallback на ручной парсинг при ошибках AST
        console.warn('[ReactFramework] AST instrumentation failed, falling back to manual parser:', error.message);
        return instrumentJsx(code, filePath);
      }
    }
    // Для других типов файлов используем ручной парсинг
    return instrumentJsx(code, filePath);
  }

  /**
   * Находит элемент по ID в JSX коде
   */
  findElementById(code, id) {
    const needleNew1 = `data-no-code-ui-id="${String(id)}"`;
    const needleNew2 = `data-no-code-ui-id='${String(id)}'`;
    const needleOld1 = `data-mrpak-id="${String(id)}"`;
    const needleOld2 = `data-mrpak-id='${String(id)}'`;
    let idx = code.indexOf(needleNew1);
    if (idx < 0) idx = code.indexOf(needleNew2);
    if (idx < 0) idx = code.indexOf(needleOld1);
    if (idx < 0) idx = code.indexOf(needleOld2);
    if (idx < 0) return null;

    const lt = code.lastIndexOf('<', idx);
    if (lt < 0) return null;

    const gt = code.indexOf('>', idx);
    if (gt < 0) return null;

    const openTag = code.slice(lt, gt + 1);
    const m = openTag.match(/^<\s*([A-Za-z_$][A-Za-z0-9_$.-]*)/);
    if (!m) return null;
    const tagName = m[1];

    return { start: lt, end: gt + 1, tagName };
  }

  /**
   * Загружает зависимый файл относительно основного файла
   */
  async loadDependency(basePath, importPath) {
    try {
      // Разрешаем путь к зависимому файлу (асинхронно для поддержки @ путей)
      let resolvedPath = await this.resolvePathMemo(basePath, importPath);

      // Если файл без расширения, пробуем добавить .js, .jsx, .css и т.д.
      const extMatch = resolvedPath.match(/\.([^.]+)$/);
      if (!extMatch) {
        const tryPaths = [
          resolvedPath + '.js',
          resolvedPath + '.jsx',
          resolvedPath + '.css',
          resolvedPath + '/index.js',
          resolvedPath + '/index.jsx',
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
        // Прямой путь с расширением
        const result = await readFile(resolvedPath);
        if (result.success) {
          return { success: true, content: result.content, path: resolvedPath };
        }
      }

      return { success: false, error: `Файл не найден: ${importPath}` };
    } catch (error) {
      console.error('ReactFramework: Error loading dependency:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Вспомогательная функция для поиска модуля по различным путям
   * Синхронная версия, использует уже разрешенные пути из pathMap
   */
  findModulePath(importPath, basePath, pathMap, dependencyModules) {
    // Пробуем найти по оригинальному пути (включая @ пути, которые уже разрешены)
    if (pathMap[importPath]) {
      return pathMap[importPath];
    }

    // Ищем в dependencyModules
    if (dependencyModules[importPath]) {
      return dependencyModules[importPath];
    }

    // Разрешаем относительный путь синхронно (для путей без @)
    if (!importPath.startsWith('@/') && !importPath.startsWith('http')) {
      const resolvedPath = this.resolvePathSyncMemo(basePath, importPath);

      // Пробуем найти по разрешенному пути
      if (pathMap[resolvedPath]) {
        return pathMap[resolvedPath];
      }

      if (dependencyModules[resolvedPath]) {
        return dependencyModules[resolvedPath];
      }

      // Извлекаем имя файла из разрешенного пути для более гибкого поиска
      const fileName = resolvedPath.split('/').pop().replace(/\.(js|jsx|ts|tsx)$/, '');
      const pathWithoutExt = resolvedPath.replace(/\.(js|jsx|ts|tsx)$/, '');
      const lastPart = resolvedPath.split('/').slice(-2).join('/'); // Последние 2 части пути

      // Ищем по всем значениям в pathMap (абсолютным путям)
      for (const [key, value] of Object.entries(pathMap)) {
        const normalizedKey = key.replace(/^\/+|\/+$/g, '');
        const normalizedValue = String(value).replace(/^\/+|\/+$/g, '');
        const normalizedResolved = resolvedPath.replace(/^\/+|\/+$/g, '');
        const normalizedPathWithoutExt = pathWithoutExt.replace(/^\/+|\/+$/g, '');
        const normalizedLastPart = lastPart.replace(/^\/+|\/+$/g, '');

        // Точное совпадение
        if (normalizedKey === normalizedResolved || normalizedKey === normalizedPathWithoutExt) {
          return value;
        }

        // Проверяем, заканчивается ли ключ или значение на разрешенный путь
        if (
          normalizedKey.endsWith('/' + normalizedResolved) ||
          normalizedResolved.endsWith('/' + normalizedKey) ||
          normalizedKey.endsWith('/' + normalizedPathWithoutExt) ||
          normalizedPathWithoutExt.endsWith('/' + normalizedKey) ||
          normalizedKey.endsWith('/' + normalizedLastPart) ||
          normalizedLastPart.endsWith('/' + normalizedKey)
        ) {
          return value;
        }

        // Проверяем значение (абсолютный путь)
        if (
          normalizedValue.endsWith('/' + normalizedResolved) ||
          normalizedResolved.endsWith('/' + normalizedValue) ||
          normalizedValue.endsWith('/' + normalizedPathWithoutExt) ||
          normalizedPathWithoutExt.endsWith('/' + normalizedValue) ||
          normalizedValue.includes('/' + fileName + '.') ||
          normalizedValue.endsWith('/' + normalizedLastPart) ||
          normalizedLastPart.endsWith('/' + normalizedValue)
        ) {
          return value;
        }

        // Проверяем по имени файла
        if (normalizedKey.includes('/' + fileName) || normalizedValue.includes('/' + fileName + '.')) {
          return value;
        }
      }

      // Пробуем найти в dependencyModules по разрешенному пути
      for (const [key, value] of Object.entries(dependencyModules)) {
        const normalizedKey = String(key).replace(/^\/+|\/+$/g, '');
        if (
          normalizedKey === resolvedPath.replace(/^\/+|\/+$/g, '') ||
          normalizedKey === pathWithoutExt.replace(/^\/+|\/+$/g, '') ||
          normalizedKey.endsWith('/' + resolvedPath.replace(/^\/+|\/+$/g, '')) ||
          resolvedPath.replace(/^\/+|\/+$/g, '').endsWith('/' + normalizedKey) ||
          normalizedKey.includes('/' + fileName)
        ) {
          return value;
        }
      }
    }

    // Если путь с @, пробуем найти его разрешенную версию
    if (importPath.startsWith('@/')) {
      // Ищем все ключи, которые могут соответствовать этому @ пути
      for (const [key, value] of Object.entries(pathMap)) {
        if (key.includes(importPath.substring(2)) || value.includes(importPath.substring(2))) {
          return value;
        }
      }
      // Также ищем в dependencyModules
      for (const [key, value] of Object.entries(dependencyModules)) {
        if (key.includes(importPath.substring(2)) || value.includes(importPath.substring(2))) {
          return value;
        }
      }
    }

    console.warn('ReactFramework: findModulePath failed to find:', {
      importPath,
      basePath,
      resolvedPath:
        !importPath.startsWith('@/') && !importPath.startsWith('http')
          ? this.resolvePathSyncMemo(basePath, importPath)
          : 'N/A',
    });

    // Возвращаем оригинальный путь как fallback
    return importPath;
  }

  /**
   * Рекурсивная функция для загрузки всех зависимостей
   */
  async loadAllDependencies(
    importPath,
    basePath,
    loadedDeps = new Set(),
    dependencyMap = {},
    dependencyPaths = [],
    pathMap = {},
    actualPathMap = {}
  ) {
    const baseFileName = basePath.split('/').pop() || basePath.split('\\\\').pop() || 'unknown';

    console.log(`[LoadAllDependencies] Starting to load dependency:`, {
      importPath,
      fromFile: baseFileName,
      basePath,
      alreadyLoaded: loadedDeps.has(importPath),
    });

    // Разрешаем путь (асинхронно для поддержки @ путей)
    const resolvedPath = await this.resolvePathMemo(basePath, importPath);

    console.log(`[LoadAllDependencies] Resolved path:`, {
      importPath,
      fromFile: baseFileName,
      resolvedPath,
    });

    // Используем абсолютный путь как ключ для предотвращения дублирования
    if (loadedDeps.has(resolvedPath)) {
      // Если файл уже загружен, добавляем только маппинг относительного пути
      console.log(
        `[LoadAllDependencies] Dependency already loaded: ${importPath} (resolved: ${resolvedPath}) from ${baseFileName}`
      );
      pathMap[importPath] = resolvedPath;
      return { pathMap, actualPathMap };
    }
    loadedDeps.add(resolvedPath);

    // Загружаем зависимость по разрешенному пути
    const depResult = await this.loadDependency(basePath, importPath);
    if (!depResult.success) {
      console.warn(`[LoadAllDependencies] Failed to load dependency from ${baseFileName}:`, {
        importPath,
        resolvedPath,
        error: depResult.error,
        fromFile: baseFileName,
      });
      return { pathMap, actualPathMap };
    }

    console.log(`[LoadAllDependencies] Successfully loaded file:`, {
      importPath,
      resolvedPath,
      actualPath: depResult.path,
      fromFile: baseFileName,
      contentLength: depResult.content?.length || 0,
    });

    // Сохраняем фактический путь файла для разрешенного пути
    actualPathMap[resolvedPath] = depResult.path;
    actualPathMap[depResult.path] = depResult.path;

    // Сохраняем по абсолютному пути как основному ключу
    dependencyMap[resolvedPath] = depResult.content;
    dependencyPaths.push(depResult.path);

    // Сохраняем маппинг: относительный путь -> абсолютный путь
    pathMap[importPath] = resolvedPath;
    // Также сохраняем маппинг разрешенного пути (если он отличается от фактического пути файла)
    if (resolvedPath !== depResult.path) {
      pathMap[resolvedPath] = depResult.path;
    }
    // Сохраняем маппинг фактического пути файла к самому себе
    pathMap[depResult.path] = depResult.path;

    // Для относительных путей также сохраняем разрешенный путь как ключ
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Разрешаем путь синхронно для сохранения маппинга
      const syncResolved = this.resolvePathSyncMemo(basePath, importPath);
      if (syncResolved !== resolvedPath && syncResolved !== depResult.path && !pathMap[syncResolved]) {
        pathMap[syncResolved] = depResult.path;
      }
      // Также сохраняем путь без расширения
      const syncResolvedNoExt = syncResolved.replace(/\.(js|jsx|ts|tsx)$/, '');
      if (syncResolvedNoExt !== syncResolved && syncResolvedNoExt !== depResult.path && !pathMap[syncResolvedNoExt]) {
        pathMap[syncResolvedNoExt] = depResult.path;
      }
      // Сохраняем последние 2 части пути (например, styles/commonStyles)
      const pathParts = syncResolved.split('/');
      if (pathParts.length >= 2) {
        const last2Parts = pathParts.slice(-2).join('/');
        if (last2Parts !== syncResolved && last2Parts !== depResult.path && !pathMap[last2Parts]) {
          pathMap[last2Parts] = depResult.path;
        }
        const last2PartsNoExt = last2Parts.replace(/\.(js|jsx|ts|tsx)$/, '');
        if (last2PartsNoExt !== last2Parts && last2PartsNoExt !== depResult.path && !pathMap[last2PartsNoExt]) {
          pathMap[last2PartsNoExt] = depResult.path;
        }
      }
    }

    // Также сохраняем путь без расширения для фактического пути файла
    const depPathNoExt = depResult.path.replace(/\.(js|jsx|ts|tsx)$/, '');
    if (depPathNoExt !== depResult.path && !pathMap[depPathNoExt]) {
      pathMap[depPathNoExt] = depResult.path;
    }

    // Сохраняем последние 2 части фактического пути файла
    const depPathParts = depResult.path.split('/');
    if (depPathParts.length >= 2) {
      const depLast2Parts = depPathParts.slice(-2).join('/');
      if (depLast2Parts !== depResult.path && !pathMap[depLast2Parts]) {
        pathMap[depLast2Parts] = depResult.path;
      }
      const depLast2PartsNoExt = depLast2Parts.replace(/\.(js|jsx|ts|tsx)$/, '');
      if (depLast2PartsNoExt !== depLast2Parts && depLast2PartsNoExt !== depResult.path && !pathMap[depLast2PartsNoExt]) {
        pathMap[depLast2PartsNoExt] = depResult.path;
      }
    }

    // Извлекаем импорты из загруженной зависимости
    const depFileName = depResult.path.split('/').pop() || depResult.path.split('\\\\').pop() || 'unknown';
    const depImports = extractImports(depResult.content, depFileName);

    console.log(`[LoadAllDependencies] Found ${depImports.length} imports in ${depFileName}:`, {
      file: depResult.path,
      fileName: depFileName,
      imports: depImports.map(i => ({ path: i.path, line: i.line })),
    });

    // Рекурсивно загружаем зависимости зависимостей
    const depBasePath = depResult.path; // Используем фактический путь файла как базовый
    for (const depImp of depImports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      if (
        (depImp.path.startsWith('react') && !depImp.path.startsWith('react/') && !depImp.path.startsWith('@')) ||
        depImp.path.startsWith('react-native') ||
        depImp.path.startsWith('http')
      ) {
        console.log(`[LoadAllDependencies] Skipping external library in ${depFileName}: ${depImp.path}`);
        continue;
      }

      console.log(`[LoadAllDependencies] Recursively loading dependency from ${depFileName}:`, {
        importPath: depImp.path,
        fromFile: depFileName,
        importLine: depImp.line,
        basePath: depBasePath,
      });

      // Рекурсивно загружаем с правильным базовым путем (фактический путь файла)
      const result = await this.loadAllDependencies(
        depImp.path,
        depBasePath,
        loadedDeps,
        dependencyMap,
        dependencyPaths,
        pathMap,
        actualPathMap
      );
      if (result) {
        Object.assign(pathMap, result.pathMap);
        Object.assign(actualPathMap, result.actualPathMap);
        console.log(`[LoadAllDependencies] Successfully loaded recursive dependency: ${depImp.path} from ${depFileName}`);
      } else {
        console.warn(`[LoadAllDependencies] Failed to load recursive dependency: ${depImp.path} from ${depFileName}`);
      }
    }

    return { pathMap, actualPathMap };
  }

  /**
   * Обрабатывает зависимости React файла
   * Перенесено из RenderFile.jsx: processReactCode
   */
  async processDependencies(code, filePath) {
    // Вызываем processReactCode для обработки зависимостей
    return await this.processReactCode(code, filePath);
  }

  /**
   * Обрабатывает код React файла с поддержкой зависимостей
   * Перенесено из RenderFile.jsx: processReactCode
   * Вынесено в `src/frameworks/react/processReactCode.js`
   */
  async processReactCode(code, basePath) {
    return processReactCodeImpl.call(this, code, basePath, this.projectRoot);
  }

  /**
   * Генерирует HTML для превью/редактора
   * Перенесено из RenderFile.jsx: createReactHTML
   * Вынесено в отдельный модуль generateReactHTML
   */
  async generateHTML(code, filePath, options = {}) {
    return generateReactHTML({
      framework: this,
      code,
      filePath,
      options,
    });
  }

  /**
   * Применяет патч стилей к JSX элементу
   */
  applyStylePatch({ code, mapEntry, patch, externalStylesMap }) {
    return applyStylePatch({
      fileType: 'react',
      fileContent: code,
      mapEntry,
      patch,
      externalStylesMap,
    });
  }

  /**
   * Вставляет новый элемент в JSX
   */
  applyInsert({ code, targetEntry, targetId, mode, snippet }) {
    return applyJsxInsert({
      code,
      entry: targetEntry,
      mode: mode === 'sibling' ? 'sibling' : 'child',
      snippet,
    });
  }

  /**
   * Удаляет элемент из JSX
   */
  applyDelete({ code, entry, blockId }) {
    return applyJsxDelete({ code, entry });
  }

  /**
   * Переносит элемент в другого родителя
   */
  applyReparent({ code, sourceEntry, sourceId, targetEntry, targetId }) {
    return applyJsxReparent({ code, sourceEntry, targetEntry });
  }

  /**
   * Изменяет текст элемента
   */
  applySetText({ code, entry, blockId, text }) {
    return applyJsxSetText({ code, entry, text: String(text ?? '') });
  }

  /**
   * Парсит импорты стилей из кода
   */
  parseStyleImports(code) {
    return parseStyleImports(code);
  }

  /**
   * Удаляет служебные атрибуты из JSX
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
      blockMapForEditor: instProcessed.map,
    };
  }

  /**
   * Коммитит накопленные патчи и операции в React файл
   * Перенесено из RenderFile.jsx: commitStagedPatches для React/React Native
   */
  async commitPatches({ originalCode, stagedPatches, stagedOps, blockMapForFile, externalStylesMap, filePath, resolvePath, readFile, writeFile }) {
    const entries = Object.entries(stagedPatches || {}).filter(([id, p]) => id && p && Object.keys(p).length > 0);
    const ops = Array.isArray(stagedOps) ? stagedOps : [];

    if (entries.length === 0 && ops.length === 0) {
      return { ok: true, code: originalCode };
    }

    let newContent = String(originalCode ?? '');

    // Вспомогательные функции
    const stripMrpakIds = (src) => {
      return String(src ?? '')
        .replace(/\sdata-no-code-ui-id\s*=\s*"[^"]*"/g, '')
        .replace(/\sdata-no-code-ui-id\s*=\s*'[^']*'/g, '')
        .replace(/\sdata-mrpak-id\s*=\s*"[^"]*"/g, '')
        .replace(/\sdata-mrpak-id\s*=\s*'[^']*'/g, '');
    };

    const findOpeningTagEntryById = (src, id) => {
      const code = String(src ?? '');
      const needleNew1 = `data-no-code-ui-id="${String(id)}"`;
      const needleNew2 = `data-no-code-ui-id='${String(id)}'`;
      const needleOld1 = `data-mrpak-id="${String(id)}"`;
      const needleOld2 = `data-mrpak-id='${String(id)}'`;
      let idx = code.indexOf(needleNew1);
      if (idx < 0) idx = code.indexOf(needleNew2);
      if (idx < 0) idx = code.indexOf(needleOld1);
      if (idx < 0) idx = code.indexOf(needleOld2);
      if (idx < 0) return null;

      const lt = code.lastIndexOf('<', idx);
      if (lt < 0) return null;

      const gt = code.indexOf('>', idx);
      if (gt < 0) return null;

      const openTag = code.slice(lt, gt + 1);
      const m = openTag.match(/^<\s*([A-Za-z_$][A-Za-z0-9_$.-]*)/);
      if (!m) return null;
      const tagName = m[1];

      return { start: lt, end: gt + 1, tagName };
    };

    // 1) Временно инструментируем код для поиска элементов по id
    const instResult = this.instrument(newContent, filePath);
    let workCode = instResult.code;

    // 2) Применяем style patches ПЕРЕД операциями insert/delete
    const externalPatches = [];
    const sortedEntries = entries
      .map(([id, patch]) => {
        let entry = null;
        if (blockMapForFile && blockMapForFile[id]) {
          const fileEntry = blockMapForFile[id];
          if (typeof fileEntry.start === 'number' && typeof fileEntry.end === 'number') {
            const openTag = newContent.slice(fileEntry.start, fileEntry.end);
            if (openTag.startsWith('<')) {
              entry = { start: fileEntry.start, end: fileEntry.end, tagName: fileEntry.tagName };
            }
          }
        }
        if (!entry) {
          entry = findOpeningTagEntryById(workCode, id);
        }
        if (!entry) {
          console.warn('ReactFramework.commitPatches: style target not found by id', { id });
          return null;
        }
        return { id, patch, entry };
      })
      .filter(x => x !== null)
      .sort((a, b) => (b.entry.start || 0) - (a.entry.start || 0)); // с конца к началу

    // Пробуем использовать AST-based патчи для более точного применения
    const useAstPatches = isJavaScriptFile(filePath);

    for (const { id, patch, entry } of sortedEntries) {
      let res = null;

      // Пробуем AST-based патч для JS/TS файлов
      if (useAstPatches) {
        try {
          res = applyStylePatchWithAst({
            code: newContent,
            target: { id },
            patch,
            filePath,
          });

          // Если AST патч успешен, используем его
          if (res?.ok && res.code) {
            newContent = res.code;
            continue;
          }
        } catch (error) {
          console.warn('[ReactFramework] AST style patch failed, falling back to manual:', error);
        }
      }

      // Fallback на ручной патч
      if (!res || !res.ok) {
        res = this.applyStylePatch({
          code: newContent,
          mapEntry: entry,
          patch,
          externalStylesMap
        });

        if (!res?.ok) {
          throw new Error(res?.error || `Не удалось применить изменения для блока ${id}`);
        }
      }

      if (res.needsExternalPatch && res.externalStylePath && res.styleKey && res.styleReference) {
        externalPatches.push({
          stylePath: res.externalStylePath,
          styleKey: res.styleKey,
          patch: res.patch,
          styleReference: res.styleReference,
          blockId: id,
        });
      } else {
        const updatedCode = res.code || res.html;
        if (updatedCode && updatedCode !== newContent) {
          newContent = updatedCode;
        }
      }
    }

    // Обновляем workCode после применения всех стилей
    const instResultAfterStyles = this.instrument(newContent, filePath);
    workCode = instResultAfterStyles.code;

    // 3) Применяем ops (insert/delete/reparent/setText) по очереди
    const jsxOps = ops.filter(
      (o) => o && (o.type === 'delete' || o.type === 'insert' || o.type === 'reparent' || o.type === 'setText')
    );

    for (const op of jsxOps) {
      if (op.type === 'delete') {
        // Пробуем AST-based удаление для JS/TS файлов
        let deleteRes = null;
        if (useAstPatches) {
          try {
            deleteRes = applyDeleteWithAst({
              code: workCode,
              id: op.blockId,
              filePath,
            });

            if (deleteRes?.ok && deleteRes.code) {
              workCode = deleteRes.code;
              // Переинструментируем после удаления
              const instAfterDel = this.instrument(workCode, filePath);
              workCode = instAfterDel.code;
              continue;
            }
          } catch (error) {
            console.warn('[ReactFramework] AST delete failed, falling back to manual:', error);
          }
        }

        // Fallback на ручное удаление
        let entry = findOpeningTagEntryById(workCode, op.blockId);
        if (!entry && op.mapEntry && typeof op.mapEntry.start === 'number' && typeof op.mapEntry.end === 'number') {
          const openTag = workCode.slice(op.mapEntry.start, op.mapEntry.end);
          if (openTag.startsWith('<')) {
            entry = { start: op.mapEntry.start, end: op.mapEntry.end, tagName: op.mapEntry.tagName };
          }
        }
        if (!entry && blockMapForFile && blockMapForFile[op.blockId]) {
          const fileEntry = blockMapForFile[op.blockId];
          if (typeof fileEntry.start === 'number' && typeof fileEntry.end === 'number') {
            const openTag = workCode.slice(fileEntry.start, fileEntry.end);
            if (openTag.startsWith('<')) {
              entry = { start: fileEntry.start, end: fileEntry.end, tagName: fileEntry.tagName };
            }
          }
        }
        if (!entry) {
          console.warn('ReactFramework.commitPatches: delete target not found by id', { id: op.blockId });
          continue;
        }
        const res = this.applyDelete({ code: workCode, entry, blockId: op.blockId });
        if (!res?.ok) {
          throw new Error(res?.error || `Не удалось удалить блок ${op.blockId}`);
        }
        workCode = res.code || workCode;
      } else if (op.type === 'insert') {
        let targetEntry = findOpeningTagEntryById(workCode, op.targetId);
        if (!targetEntry && op.mapEntry && typeof op.mapEntry.start === 'number' && typeof op.mapEntry.end === 'number') {
          const openTag = workCode.slice(op.mapEntry.start, op.mapEntry.end);
          if (openTag.startsWith('<')) {
            targetEntry = { start: op.mapEntry.start, end: op.mapEntry.end, tagName: op.mapEntry.tagName };
          }
        }
        if (!targetEntry && blockMapForFile && blockMapForFile[op.targetId]) {
          const fileEntry = blockMapForFile[op.targetId];
          if (typeof fileEntry.start === 'number' && typeof fileEntry.end === 'number') {
            const openTag = workCode.slice(fileEntry.start, fileEntry.end);
            if (openTag.startsWith('<')) {
              targetEntry = { start: fileEntry.start, end: fileEntry.end, tagName: fileEntry.tagName };
            }
          }
        }
        if (!targetEntry) {
          console.warn('ReactFramework.commitPatches: insert target not found by id', { targetId: op.targetId });
          continue;
        }
        const res = this.applyInsert({
          code: workCode,
          targetEntry,
          targetId: op.targetId,
          mode: op.mode,
          snippet: op.snippet
        });
        if (!res?.ok) {
          throw new Error(res?.error || `Не удалось вставить блок в ${op.targetId}`);
        }
        workCode = res.code || workCode;
      } else if (op.type === 'reparent') {
        let sourceEntry = findOpeningTagEntryById(workCode, op.sourceId);
        let targetEntry = findOpeningTagEntryById(workCode, op.targetParentId);

        if (!sourceEntry && op.mapEntrySource && typeof op.mapEntrySource.start === 'number' && typeof op.mapEntrySource.end === 'number') {
          const openTag = workCode.slice(op.mapEntrySource.start, op.mapEntrySource.end);
          if (openTag.startsWith('<')) {
            sourceEntry = { start: op.mapEntrySource.start, end: op.mapEntrySource.end, tagName: op.mapEntrySource.tagName };
          }
        }
        if (!sourceEntry && blockMapForFile && blockMapForFile[op.sourceId]) {
          const fileEntry = blockMapForFile[op.sourceId];
          if (typeof fileEntry.start === 'number' && typeof fileEntry.end === 'number') {
            const openTag = workCode.slice(fileEntry.start, fileEntry.end);
            if (openTag.startsWith('<')) {
              sourceEntry = { start: fileEntry.start, end: fileEntry.end, tagName: fileEntry.tagName };
            }
          }
        }

        if (!targetEntry && op.mapEntryTarget && typeof op.mapEntryTarget.start === 'number' && typeof op.mapEntryTarget.end === 'number') {
          const openTag = workCode.slice(op.mapEntryTarget.start, op.mapEntryTarget.end);
          if (openTag.startsWith('<')) {
            targetEntry = { start: op.mapEntryTarget.start, end: op.mapEntryTarget.end, tagName: op.mapEntryTarget.tagName };
          }
        }
        if (!targetEntry && blockMapForFile && blockMapForFile[op.targetParentId]) {
          const fileEntry = blockMapForFile[op.targetParentId];
          if (typeof fileEntry.start === 'number' && typeof fileEntry.end === 'number') {
            const openTag = workCode.slice(fileEntry.start, fileEntry.end);
            if (openTag.startsWith('<')) {
              targetEntry = { start: fileEntry.start, end: fileEntry.end, tagName: fileEntry.tagName };
            }
          }
        }

        if (!sourceEntry || !targetEntry) {
          console.warn('ReactFramework.commitPatches: reparent target/source not found by id', {
            sourceId: op.sourceId,
            targetParentId: op.targetParentId
          });
          continue;
        }
        const res = this.applyReparent({
          code: workCode,
          sourceEntry,
          sourceId: op.sourceId,
          targetEntry,
          targetId: op.targetParentId
        });
        if (!res?.ok) {
          throw new Error(res?.error || 'Не удалось перенести блок');
        }
        workCode = res.code || workCode;
      } else if (op.type === 'setText') {
        let entry = findOpeningTagEntryById(workCode, op.blockId);
        if (!entry && op.mapEntry && typeof op.mapEntry.start === 'number' && typeof op.mapEntry.end === 'number') {
          const openTag = workCode.slice(op.mapEntry.start, op.mapEntry.end);
          if (openTag.startsWith('<')) {
            entry = { start: op.mapEntry.start, end: op.mapEntry.end, tagName: op.mapEntry.tagName };
          }
        }
        if (!entry && blockMapForFile && blockMapForFile[op.blockId]) {
          const fileEntry = blockMapForFile[op.blockId];
          if (typeof fileEntry.start === 'number' && typeof fileEntry.end === 'number') {
            const openTag = workCode.slice(fileEntry.start, fileEntry.end);
            if (openTag.startsWith('<')) {
              entry = { start: fileEntry.start, end: fileEntry.end, tagName: fileEntry.tagName };
            }
          }
        }
        if (!entry) {
          console.warn('ReactFramework.commitPatches: setText target not found by id', { id: op.blockId });
          continue;
        }
        const res = this.applySetText({
          code: workCode,
          entry,
          blockId: op.blockId,
          text: op.text
        });
        if (!res?.ok) {
          throw new Error(res?.error || `Не удалось изменить текст блока ${op.blockId}`);
        }
        workCode = res.code || workCode;
      }

      // Переинструментируем после каждой операции
      workCode = this.instrument(workCode, filePath).code;

      if (!workCode || workCode.length === 0) {
        throw new Error(`Операция ${op.type} привела к пустому коду`);
      }
    }

    // 4) Обрабатываем external styles
    for (const extPatch of externalPatches) {
      let resolvedPath = await resolvePath(filePath, extPatch.stylePath);
      let styleFileResult = await readFile(resolvedPath);
      if (!styleFileResult.success) {
        const extensions = ['.js', '.jsx', '.ts', '.tsx'];
        let found = false;
        for (const ext of extensions) {
          const pathWithExt = resolvedPath + ext;
          const result = await readFile(pathWithExt);
          if (result.success) {
            resolvedPath = pathWithExt;
            styleFileResult = result;
            found = true;
            break;
          }
        }
        if (!found) {
          throw new Error(
            `Не удалось загрузить файл стилей: ${resolvedPath} (пробовали с расширениями: ${extensions.join(', ')})`
          );
        }
      }

      const externalPatchResult = applyExternalStylePatch({
        code: styleFileResult.content,
        styleKey: extPatch.styleKey,
        patch: extPatch.patch,
      });
      if (!externalPatchResult.ok) {
        throw new Error(externalPatchResult.error || `Не удалось применить патч к файлу стилей: ${resolvedPath}`);
      }

      const writeResult = await writeFile(resolvedPath, externalPatchResult.code);
      if (!writeResult.success) {
        throw new Error(writeResult.error || `Не удалось записать файл стилей: ${resolvedPath}`);
      }

      const entry = findOpeningTagEntryById(workCode, extPatch.blockId);
      if (!entry) {
        console.warn('ReactFramework.commitPatches: cannot replace style reference, block not found', { id: extPatch.blockId });
        continue;
      }

      const oldStyleRef = `${extPatch.styleReference.stylesVar}.${extPatch.styleKey}`;
      const newStyleRef = `${extPatch.styleReference.stylesVar}.${externalPatchResult.newStyleName}`;
      const replaceResult = replaceStyleReferenceInJsx({
        code: workCode,
        target: { start: entry.start, end: entry.end },
        oldStyleRef,
        newStyleRef,
        isArray: extPatch.styleReference.isArray,
      });
      if (!replaceResult.ok) {
        throw new Error(replaceResult.error || `Не удалось заменить ссылку на стиль для блока ${extPatch.blockId}`);
      }
      workCode = replaceResult.code || workCode;
    }

    // 5) Убираем служебные id перед записью в файл
    newContent = stripMrpakIds(workCode);

    return { ok: true, code: newContent, externalPatches };
  }

  /**
   * Добавляет data-no-code-ui-id в JSX сниппет, если атрибут ещё не задан
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
   * Строит JSX сниппет для вставки нового блока (React Web)
   */
  buildInsertSnippet({ tag, text, stylePatch }) {
    const styleObj = stylePatch ? toReactStyleObjectText(stylePatch) : '';
    const styleAttr = styleObj ? ` style={{${styleObj}}}` : '';
    const tagName = tag || 'div';
    const body = text || 'Новый блок';

    const isButton = tagName === 'button';
    const onClickAttr = isButton
      ? ` onClick={(e) => { try { e?.preventDefault?.(); console.log('Button clicked'); } catch(_) {} }}`
      : '';

    return `<${tagName}${styleAttr}${onClickAttr}>${body}</${tagName}>`;
  }
}

