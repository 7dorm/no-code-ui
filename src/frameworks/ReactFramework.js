import { Framework } from './Framework';
import { instrumentJsx } from '../blockEditor/JsxInstrumenter';
import { 
  applyStylePatch, 
  applyJsxDelete, 
  applyJsxInsert, 
  applyJsxReparent, 
  applyJsxSetText, 
  parseStyleImports, 
  applyExternalStylePatch, 
  replaceStyleReferenceInJsx 
} from '../blockEditor/PatchEngine';
import { extractImports, detectComponents } from '../features/file-renderer/lib/react-processor';
import { readFile, writeFile } from '../shared/api/electron-api';
import { resolvePath, resolvePathSync } from '../features/file-renderer/lib/path-resolver';
import { injectBlockEditorScript } from '../features/file-renderer/lib/block-editor-script';
import { toReactStyleObjectText } from '../blockEditor/styleUtils';

/**
 * Реализация Framework для React файлов
 * 
 * ВАЖНО: Этот класс использует сложную логику обработки зависимостей из RenderFile.jsx
 * В будущем эту логику можно вынести в отдельные модули для лучшей организации
 */
export class ReactFramework extends Framework {
  constructor(filePath) {
    super(filePath);
    this.filePath = filePath;
    // Кэш для загруженных зависимостей
    this._dependencyCache = new Map();
    // Мемоизированные функции для разрешения путей
    this.resolvePathMemo = (base, rel) => resolvePath(base, rel);
    this.resolvePathSyncMemo = (base, rel) => resolvePathSync(base, rel);
  }

  /**
   * Инструментирует JSX код, добавляя data-no-code-ui-id атрибуты
   */
  instrument(code, filePath) {
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
        if (normalizedKey.endsWith('/' + normalizedResolved) || 
            normalizedResolved.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedLastPart) ||
            normalizedLastPart.endsWith('/' + normalizedKey)) {
          return value;
        }
        
        // Проверяем значение (абсолютный путь)
        if (normalizedValue.endsWith('/' + normalizedResolved) || 
            normalizedResolved.endsWith('/' + normalizedValue) ||
            normalizedValue.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedValue) ||
            normalizedValue.includes('/' + fileName + '.') ||
            normalizedValue.endsWith('/' + normalizedLastPart) ||
            normalizedLastPart.endsWith('/' + normalizedValue)) {
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
        if (normalizedKey === resolvedPath.replace(/^\/+|\/+$/g, '') || 
            normalizedKey === pathWithoutExt.replace(/^\/+|\/+$/g, '') ||
            normalizedKey.endsWith('/' + resolvedPath.replace(/^\/+|\/+$/g, '')) ||
            resolvedPath.replace(/^\/+|\/+$/g, '').endsWith('/' + normalizedKey) ||
            normalizedKey.includes('/' + fileName)) {
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
      resolvedPath: !importPath.startsWith('@/') && !importPath.startsWith('http') ? this.resolvePathSyncMemo(basePath, importPath) : 'N/A'
    });
    
    // Возвращаем оригинальный путь как fallback
    return importPath;
  }

  /**
   * Рекурсивная функция для загрузки всех зависимостей
   */
  async loadAllDependencies(importPath, basePath, loadedDeps = new Set(), dependencyMap = {}, dependencyPaths = [], pathMap = {}, actualPathMap = {}) {
    const baseFileName = basePath.split('/').pop() || basePath.split('\\').pop() || 'unknown';
    
    console.log(`[LoadAllDependencies] Starting to load dependency:`, {
      importPath,
      fromFile: baseFileName,
      basePath,
      alreadyLoaded: loadedDeps.has(importPath)
    });
    
    // Разрешаем путь (асинхронно для поддержки @ путей)
    const resolvedPath = await this.resolvePathMemo(basePath, importPath);
    
    console.log(`[LoadAllDependencies] Resolved path:`, {
      importPath,
      fromFile: baseFileName,
      resolvedPath
    });
    
    // Используем абсолютный путь как ключ для предотвращения дублирования
    if (loadedDeps.has(resolvedPath)) {
      // Если файл уже загружен, добавляем только маппинг относительного пути
      console.log(`[LoadAllDependencies] Dependency already loaded: ${importPath} (resolved: ${resolvedPath}) from ${baseFileName}`);
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
        fromFile: baseFileName
      });
      return { pathMap, actualPathMap };
    }
    
    console.log(`[LoadAllDependencies] Successfully loaded file:`, {
      importPath,
      resolvedPath,
      actualPath: depResult.path,
      fromFile: baseFileName,
      contentLength: depResult.content?.length || 0
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
    const depFileName = depResult.path.split('/').pop() || depResult.path.split('\\').pop() || 'unknown';
    const depImports = extractImports(depResult.content, depFileName);
    
    console.log(`[LoadAllDependencies] Found ${depImports.length} imports in ${depFileName}:`, {
      file: depResult.path,
      fileName: depFileName,
      imports: depImports.map(i => ({ path: i.path, line: i.line }))
    });
    
    // Рекурсивно загружаем зависимости зависимостей
    const depBasePath = depResult.path; // Используем фактический путь файла как базовый
    for (const depImp of depImports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      if ((depImp.path.startsWith('react') && !depImp.path.startsWith('react/') && !depImp.path.startsWith('@')) || 
          depImp.path.startsWith('react-native') || 
          depImp.path.startsWith('http')) {
        console.log(`[LoadAllDependencies] Skipping external library in ${depFileName}: ${depImp.path}`);
        continue;
      }
      
      console.log(`[LoadAllDependencies] Recursively loading dependency from ${depFileName}:`, {
        importPath: depImp.path,
        fromFile: depFileName,
        importLine: depImp.line,
        basePath: depBasePath
      });
      
      // Рекурсивно загружаем с правильным базовым путем (фактический путь файла)
      const result = await this.loadAllDependencies(depImp.path, depBasePath, loadedDeps, dependencyMap, dependencyPaths, pathMap, actualPathMap);
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
   */
  async processReactCode(code, basePath) {
    // Извлекаем импорты
    const fileName = basePath.split('/').pop() || basePath.split('\\').pop() || 'unknown';
    const imports = extractImports(code, fileName);
    console.log(`[ProcessReactCode] Processing file: ${fileName}`, {
      file: basePath,
      fileName,
      importsCount: imports.length,
      imports: imports.map(i => ({ path: i.path, line: i.line }))
    });
    
    const dependencies = {};
    const dependencyModules = {};
    const dependencyPaths = [];
    const loadedDeps = new Set();
    const pathMap = {};
    const actualPathMap = {};
    
    // Загружаем все зависимости рекурсивно
    for (const imp of imports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      if (imp.path.startsWith('react') && !imp.path.startsWith('react/') && 
          !imp.path.startsWith('react-dom') && 
          !imp.path.startsWith('react-native') && 
          !imp.path.startsWith('http')) {
        console.log(`[ProcessReactCode] Skipping external library: ${imp.path} from ${fileName}`);
        continue;
      }
      
      console.log(`[ProcessReactCode] Loading dependency from ${fileName}:`, {
        sourceFile: fileName,
        importPath: imp.path,
        importLine: imp.line,
        basePath
      });
      
      const result = await this.loadAllDependencies(imp.path, basePath, loadedDeps, dependencies, dependencyPaths, pathMap, actualPathMap);
      // Объединяем результаты
      if (result) {
        Object.assign(pathMap, result.pathMap);
        Object.assign(actualPathMap, result.actualPathMap);
        console.log(`[ProcessReactCode] Successfully loaded dependency: ${imp.path} from ${fileName}`);
      } else {
        console.warn(`[ProcessReactCode] Failed to load dependency: ${imp.path} from ${fileName}`);
      }
    }
    
    // Используем pathMap для заполнения dependencyModules
    for (const [relativePath, absolutePath] of Object.entries(pathMap)) {
      dependencyModules[relativePath] = absolutePath;
      if (!dependencyModules[absolutePath]) {
        dependencyModules[absolutePath] = absolutePath;
      }
    }
    
    // Обрабатываем код - удаляем импорты React, но сохраняем локальные
    let defaultExportInfo = null;
    const defaultExportMatch = code.match(/export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (defaultExportMatch) {
      defaultExportInfo = {
        name: defaultExportMatch[1],
        type: 'default-export'
      };
    }
    
    let processedCode = code
      // Удаляем все варианты импортов React (включая смешанные)
      .replace(/import\s+React\s*,\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '') // import React, { useState } from 'react'
      .replace(/import\s+\{[^}]*\}\s*,\s*React\s*from\s+['"]react['"];?\s*/gi, '') // import { useState }, React from 'react'
      .replace(/import\s+React\s+from\s+['"]react['"];?\s*/gi, '')                // import React from 'react'
      .replace(/import\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '')           // import { useState } from 'react'
      // Удаляем импорты react-native (они будут доступны глобально)
      .replace(/import\s*\{[^}]*\}\s*from\s+['"]react-native['"];?\s*/gi, '')
      .replace(/export\s+default\s+/g, '')
      .trim();
    
    console.log('[ProcessReactCode] Initial processedCode length:', processedCode.length);
    console.log('[ProcessReactCode] Initial processedCode first 500 chars:', processedCode.substring(0, 500));
    
    // Создаем код для модулей зависимостей
    let modulesCode = '';
    let importReplacements = {};
    
    // Собираем уникальные абсолютные пути из pathMap
    const uniqueAbsolutePaths = new Set(Object.values(pathMap));
    const processedDeps = new Set();
    
    // Собираем информацию о зависимостях каждого модуля для сортировки
    const moduleDependencies = new Map();
    
    // Сначала собираем зависимости для каждого модуля
    for (const absolutePath of uniqueAbsolutePaths) {
      if (processedDeps.has(absolutePath)) {
        continue;
      }
      
      const content = dependencies[absolutePath] || (() => {
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === absolutePath) {
            return dependencies[relPath];
          }
        }
        return null;
      })();
      
      if (!content) continue;
      
      // Извлекаем импорты из модуля
      const depImports = extractImports(content, absolutePath);
      const depSet = new Set();
      
      for (const imp of depImports) {
        // Пропускаем внешние библиотеки
        if (!imp.path.startsWith('.') && !imp.path.startsWith('/') && !imp.path.startsWith('@')) {
          continue;
        }
        
        // Находим абсолютный путь зависимости
        const depResolvedPath = pathMap[imp.path] || dependencyModules[imp.path];
        if (depResolvedPath && uniqueAbsolutePaths.has(depResolvedPath)) {
          depSet.add(depResolvedPath);
        }
      }
      
      moduleDependencies.set(absolutePath, depSet);
    }
    
    // Топологическая сортировка модулей по зависимостям
    const sortedModules = [];
    const visited = new Set();
    const visiting = new Set();
    
    const visit = (modulePath) => {
      if (visiting.has(modulePath)) {
        return; // Циклическая зависимость - пропускаем
      }
      if (visited.has(modulePath)) {
        return;
      }
      
      visiting.add(modulePath);
      const deps = moduleDependencies.get(modulePath) || new Set();
      for (const dep of deps) {
        if (uniqueAbsolutePaths.has(dep)) {
          visit(dep);
        }
      }
      visiting.delete(modulePath);
      visited.add(modulePath);
      sortedModules.push(modulePath);
    };
    
    // Запускаем топологическую сортировку
    for (const absolutePath of uniqueAbsolutePaths) {
      if (!visited.has(absolutePath)) {
        visit(absolutePath);
      }
    }
    
    console.log('ReactFramework: Sorted modules by dependencies:', sortedModules.map(p => p.split('/').pop()));
    
    // Обрабатываем каждую зависимость в отсортированном порядке
    processedDeps.clear();
    for (const absolutePath of sortedModules) {
      if (processedDeps.has(absolutePath)) {
        continue;
      }
      processedDeps.add(absolutePath);
      
      // Получаем контент по абсолютному пути
      let content = dependencies[absolutePath];
      // Если не найдено по абсолютному пути, ищем по относительному из pathMap
      if (!content) {
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === absolutePath) {
            content = dependencies[relPath];
            if (content) break;
          }
        }
      }
      
      if (!content) {
        continue;
      }
      
      // Используем абсолютный путь как основной ключ для обработки
      const importPath = absolutePath;
      // Обрабатываем зависимость
      // Сначала извлекаем все экспорты
      let moduleExports = {};
      let hasDefaultExport = false;
      let defaultExportName = null;
      const namedExports = [];
      
      // Получаем фактический путь файла для текущей зависимости (для разрешения относительных путей)
      // Используем actualPathMap для получения фактического пути файла
      const currentDepResolvedPath = dependencyModules[importPath] || importPath;
      const currentDepActualPath = actualPathMap[currentDepResolvedPath] || currentDepResolvedPath;
      const currentDepBasePath = currentDepActualPath.substring(0, currentDepActualPath.lastIndexOf('/'));
      
      // Отладочная информация
      console.log('ReactFramework: Processing dependency:', {
        importPath,
        currentDepResolvedPath,
        currentDepActualPath,
        currentDepBasePath,
        pathMapKeys: Object.keys(pathMap).slice(0, 10)
      });
      
      // Обрабатываем экспорты
      let processedDep = content;
      
      // СНАЧАЛА обрабатываем экспорты, ПОТОМ удаляем импорты
      // Named exports: export const/let/var (обрабатываем ДО удаления импортов)
      const namedConstExports = [];
      processedDep = processedDep.replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, (match, keyword, name) => {
        namedConstExports.push(name);
        if (!namedExports.includes(name)) {
          namedExports.push(name);
        }
        return `${keyword} ${name} =`;
      });
      
      // Named exports: export function (обрабатываем ДО удаления импортов)
      const namedFunctionExports = [];
      processedDep = processedDep.replace(/export\s+function\s+(\w+)/g, (match, name) => {
        namedFunctionExports.push(name);
        if (!namedExports.includes(name)) {
          namedExports.push(name);
        }
        return `function ${name}`;
      });
      
      // Обрабатываем импорты из зависимого файла перед встраиванием
      // Импорты React и React Native будут доступны глобально
      // Для локальных импортов заменяем их на код доступа к модулям
      
      // Собираем все импорты из react-native для замены
      const rnImports = [];
      processedDep = processedDep.replace(/import\s*\{([^}]*)\}\s*from\s+['"]react-native['"];?\s*/gi, (match, imports) => {
        const names = imports.split(',').map(n => n.trim()).filter(n => n);
        names.forEach(name => {
          const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
          const orig = parts[0].trim();
          const alias = parts[1].trim();
          if (!rnImports.some(i => i.alias === alias)) {
            rnImports.push({ orig, alias });
          }
        });
        return ''; // Удаляем импорт
      });
      
      // Добавляем объявления для react-native компонентов в начало
      if (rnImports.length > 0) {
        const rnDeclarations = rnImports.map(({ orig, alias }) => 
          `const ${alias} = window.${orig} || window.ReactNativeWeb?.${orig};`
        ).join('\n');
        processedDep = rnDeclarations + '\n' + processedDep;
      }
      
      processedDep = processedDep
        // Удаляем import React from 'react'
        .replace(/import\s+React\s+from\s+['"]react['"];?\s*/gi, '')
        // Удаляем import { ... } from 'react'
        .replace(/import\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '')
        // Удаляем CSS импорты (они будут обработаны отдельно или уже встроены)
        .replace(/import\s+['"][^'"]*\.css['"];?\s*/gi, '')
        .replace(/import\s+['"][^'"]*\.scss['"];?\s*/gi, '')
        .replace(/import\s+['"][^'"]*\.less['"];?\s*/gi, '')
        // Заменяем все остальные импорты на код доступа к модулям
        .replace(/import\s+(.*?)\s+from\s+['"](.*?)['"];?\s*/g, (match, importSpec, depImportPath) => {
          const currentDepFileName = currentDepActualPath.split('/').pop() || currentDepActualPath.split('\\').pop() || 'unknown';
          
          // Пропускаем только внешние библиотеки (npm пакеты)
          // Теперь обрабатываем локальные импорты, включая @ пути
          if ((depImportPath.startsWith('react') && !depImportPath.startsWith('react/') && !depImportPath.startsWith('@')) || 
              depImportPath.startsWith('react-native') || 
              depImportPath.startsWith('http')) {
            console.log(`[ProcessDependency] Skipping external import in ${currentDepFileName}: ${depImportPath}`);
            return ''; // Удаляем импорт
          }
          
          // Для локальных импортов заменяем на код доступа к модулям
          // Используем фактический путь файла зависимости для разрешения относительных путей
          const finalDepPath = this.findModulePath(depImportPath, currentDepActualPath, pathMap, dependencyModules);
          
          // Разрешаем путь синхронно для генерации всех возможных вариантов ключей
          const resolvedPathSync = this.resolvePathSyncMemo(currentDepActualPath, depImportPath);
          const resolvedPathNoExt = resolvedPathSync.replace(/\.(js|jsx|ts|tsx)$/, '');
          const resolvedParts = resolvedPathSync.split('/');
          const resolvedLast2 = resolvedParts.length >= 2 ? resolvedParts.slice(-2).join('/') : '';
          const resolvedLast2NoExt = resolvedLast2.replace(/\.(js|jsx|ts|tsx)$/, '');
          const resolvedFileName = resolvedParts[resolvedParts.length - 1] || '';
          const resolvedFileNameNoExt = resolvedFileName.replace(/\.(js|jsx|ts|tsx)$/, '');
          
          // Создаем список всех возможных ключей для поиска модуля
          const possibleKeys = [
            finalDepPath,
            depImportPath,
            resolvedPathSync,
            resolvedPathNoExt,
            resolvedLast2,
            resolvedLast2NoExt,
            resolvedFileName,
            resolvedFileNameNoExt
          ].filter(Boolean);
          
          // Сериализуем для использования в шаблонной строке
          const possibleKeysJson = JSON.stringify(possibleKeys);
          
          console.log(`[ProcessDependency] Processing import in ${currentDepFileName}:`, {
            file: currentDepFileName,
            filePath: currentDepActualPath,
            importPath: depImportPath,
            importSpec,
            resolvedPath: finalDepPath,
            resolvedPathSync,
            possibleKeys,
            foundInPathMap: !!pathMap[depImportPath] || !!pathMap[finalDepPath]
          });
          
          if (importSpec.startsWith('{')) {
            // Named imports: import { a, b as c } from ...
            const names = importSpec.replace(/[{}]/g, '').split(',').map(n => n.trim()).filter(n => n);
            return names.map(name => {
              const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
              let orig = parts[0].trim();
              let alias = parts[1].trim();
              // Валидация имени переменной: убираем недопустимые символы
              alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
                // Если имя невалидно, используем безопасное имя
                alias = 'imported_' + Math.random().toString(36).substr(2, 9);
              }
              // Также валидируем orig, так как он используется в module.${orig}
              orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!orig) {
                orig = 'default';
              }
              return `const ${alias} = (() => {
                // Ждем, пока модули загрузятся (на случай, если модуль еще загружается)
                const waitForModule = (maxAttempts = 50) => {
                  const possibleKeys = ${possibleKeysJson};
                  let module = null;
                  
                  for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    // Пробуем найти модуль по всем возможным ключам
                    // Игнорируем null значения (предварительно зарегистрированные слоты)
                    for (const key of possibleKeys) {
                      if (window.__modules__ && window.__modules__[key] !== null && window.__modules__[key] !== undefined) {
                        module = window.__modules__[key];
                        break;
                      }
                    }
                    
                    // Если не нашли по точным ключам, ищем по частичному совпадению
                    if (!module && window.__modules__) {
                      const fileName = '${resolvedFileNameNoExt}';
                      const last2Parts = '${resolvedLast2NoExt}';
                      const importPathClean = '${depImportPath.replace(/\.\.?\//g, '')}';
                      for (const key of Object.keys(window.__modules__)) {
                        const value = window.__modules__[key];
                        // Игнорируем null значения
                        if (value !== null && value !== undefined && 
                            (key.includes(fileName) || key.includes(last2Parts) || 
                            key.endsWith('${depImportPath}') || key.includes(importPathClean))) {
                          module = value;
                          break;
                        }
                      }
                    }
                    
                    if (module) break;
                    
                    // Если модуль не найден, ждем немного и пробуем снова
                    if (attempt < maxAttempts - 1) {
                      // Синхронное ожидание (не идеально, но работает)
                      const start = Date.now();
                      while (Date.now() - start < 10) {
                        // Ждем 10ms
                      }
                    }
                  }
                  
                  return module;
                };
                
                const module = waitForModule();
                
                if (!module || module === null) {
                  console.error('Module not found for ${depImportPath}. Tried keys:', ${possibleKeysJson});
                  console.error('Available modules:', Object.keys(window.__modules__ || {}));
                  throw new Error('Failed to import ${orig} from ${depImportPath}. Module not found.');
                }
                
                const value = module?.${orig} || module?.default?.${orig};
                if (value === undefined) {
                  console.error('Export ${orig} not found in module. Module keys:', Object.keys(module || {}));
                  throw new Error('Failed to import ${orig} from ${depImportPath}. Export not found.');
                }
                return value;
              })();`;
            }).join('\n');
          } else {
            // Default import: import name from ...
            return `const ${importSpec.trim()} = (() => {
              // Ждем, пока модули загрузятся (на случай, если модуль еще загружается)
              const waitForModule = (maxAttempts = 50) => {
                const possibleKeys = ${possibleKeysJson};
                let module = null;
                
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                  // Пробуем найти модуль по всем возможным ключам
                  // Игнорируем null значения (предварительно зарегистрированные слоты)
                  for (const key of possibleKeys) {
                    if (window.__modules__ && window.__modules__[key] !== null && window.__modules__[key] !== undefined) {
                      module = window.__modules__[key];
                      break;
                    }
                  }
                  
                  // Если не нашли по точным ключам, ищем по частичному совпадению
                  if (!module && window.__modules__) {
                    const fileName = '${resolvedFileNameNoExt}';
                    const last2Parts = '${resolvedLast2NoExt}';
                    const importPathClean = '${depImportPath.replace(/\.\.?\//g, '')}';
                    for (const key of Object.keys(window.__modules__)) {
                      const value = window.__modules__[key];
                      // Игнорируем null значения
                      if (value !== null && value !== undefined && 
                          (key.includes(fileName) || key.includes(last2Parts) || 
                          key.endsWith('${depImportPath}') || key.includes(importPathClean))) {
                        module = value;
                        break;
                      }
                    }
                  }
                  
                  if (module) break;
                  
                  // Если модуль не найден, ждем немного и пробуем снова
                  if (attempt < maxAttempts - 1) {
                    // Синхронное ожидание (не идеально, но работает)
                    const start = Date.now();
                    while (Date.now() - start < 10) {
                      // Ждем 10ms
                    }
                  }
                }
                
                return module;
              };
              
              const module = waitForModule();
              
              if (!module || module === null) {
                console.error('Module not found for ${depImportPath}. Tried keys:', ${possibleKeysJson});
                console.error('Available modules:', Object.keys(window.__modules__ || {}));
                throw new Error('Failed to import default from ${depImportPath}. Module not found.');
              }
              
              const value = module?.default || module?.styles || module;
              if (value === undefined) {
                console.error('Default export not found in module. Module keys:', Object.keys(module || {}));
                throw new Error('Failed to import default from ${depImportPath}. Default export not found.');
              }
              return value;
            })();`;
          }
        })
        .trim();
      
      // Default export: export default ...
      const defaultExportMatch = processedDep.match(/export\s+default\s+(.+?)(;|$)/s);
      if (defaultExportMatch) {
        hasDefaultExport = true;
        const exportValue = defaultExportMatch[1].trim();
        // Если это переменная или выражение
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportValue)) {
          defaultExportName = exportValue;
          // Удаляем строку export default полностью
          processedDep = processedDep.replace(/export\s+default\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*;?\s*/g, '');
        } else {
          defaultExportName = '__defaultExport';
          processedDep = processedDep.replace(/export\s+default\s+/g, 'const __defaultExport = ');
        }
      }
      
      // Named exports: export { ... }
      const namedExportsMatch = processedDep.match(/export\s+\{([^}]+)\}/);
      if (namedExportsMatch) {
        const exports = namedExportsMatch[1].split(',').map(e => e.trim()).filter(e => e);
        exports.forEach(exp => {
          const parts = exp.includes(' as ') ? exp.split(' as ') : [exp, exp];
          const orig = parts[0].trim();
          const alias = parts[1].trim();
          moduleExports[alias] = orig;
          if (!namedExports.includes(orig)) {
            namedExports.push(orig);
          }
        });
        processedDep = processedDep.replace(/export\s+\{([^}]+)\}/g, '');
      }
      
      // Если нет default export, но есть named export 'styles', используем его как default
      if (!hasDefaultExport && namedExports.includes('styles')) {
        defaultExportName = 'styles';
        hasDefaultExport = true;
      }
      
      // Удаляем все оставшиеся экспорты (на случай, если что-то пропустили)
      processedDep = processedDep.replace(/export\s+default\s+.*?;?\s*/g, '');
      processedDep = processedDep.replace(/export\s+\{[^}]+\}\s*;?\s*/g, '');
      
      // Получаем абсолютный путь для этого модуля (importPath уже равен absolutePath из цикла)
      const moduleAbsolutePath = dependencyModules[importPath] || importPath;
      
      // Находим все относительные пути, которые указывают на этот абсолютный путь
      const allRelativePaths = Object.entries(pathMap)
        .filter(([relPath, absPath]) => absPath === moduleAbsolutePath)
        .map(([relPath]) => relPath);
      
      // Также находим все возможные варианты путей, которые могут быть использованы из разных контекстов
      // Это включает пути, которые могут быть разрешены относительно разных базовых путей
      const allPossiblePaths = new Set(allRelativePaths);
      
      // Добавляем абсолютный путь
      allPossiblePaths.add(moduleAbsolutePath);
      
      // Добавляем путь без расширения
      const pathWithoutExt = moduleAbsolutePath.replace(/\.(js|jsx|ts|tsx)$/, '');
      allPossiblePaths.add(pathWithoutExt);
      
      // Добавляем последние 2 части пути (например, styles/commonStyles)
      const pathParts = moduleAbsolutePath.split('/');
      if (pathParts.length >= 2) {
        const last2Parts = pathParts.slice(-2).join('/');
        allPossiblePaths.add(last2Parts);
        const last2PartsNoExt = last2Parts.replace(/\.(js|jsx|ts|tsx)$/, '');
        allPossiblePaths.add(last2PartsNoExt);
      }
      
      // Добавляем имя файла
      const fileName = pathParts[pathParts.length - 1];
      if (fileName) {
        allPossiblePaths.add(fileName);
        const fileNameNoExt = fileName.replace(/\.(js|jsx|ts|tsx)$/, '');
        allPossiblePaths.add(fileNameNoExt);
      }
      
      // Для каждого относительного пути из pathMap, который указывает на этот модуль,
      // генерируем возможные варианты, которые могут быть использованы из других контекстов
      for (const relPath of allRelativePaths) {
        // Добавляем сам относительный путь
        allPossiblePaths.add(relPath);
        
        // Добавляем путь без расширения
        const relPathNoExt = relPath.replace(/\.(js|jsx|ts|tsx)$/, '');
        allPossiblePaths.add(relPathNoExt);
        
        // Если путь начинается с ./, добавляем вариант без ./
        if (relPath.startsWith('./')) {
          allPossiblePaths.add(relPath.substring(2));
        }
        
        // Если путь начинается с ../, добавляем последние части
        if (relPath.startsWith('../')) {
          const relParts = relPath.split('/');
          if (relParts.length >= 2) {
            const relLast2 = relParts.slice(-2).join('/');
            allPossiblePaths.add(relLast2);
            const relLast2NoExt = relLast2.replace(/\.(js|jsx|ts|tsx)$/, '');
            allPossiblePaths.add(relLast2NoExt);
          }
        }
      }
      
      console.log(`[ProcessDependency] All possible paths for module ${moduleAbsolutePath}:`, Array.from(allPossiblePaths));
      
      // Создаем модуль
      modulesCode += `
        // Модуль: ${importPath} (absolute: ${moduleAbsolutePath})
        (function() {
          // Убеждаемся, что window.__modules__ инициализирован
          window.__modules__ = window.__modules__ || {};
          
          // ВАЖНО: Выполняем код модуля ПОСЛЕ того, как все модули предварительно зарегистрированы
          // Это гарантирует, что когда код модуля обращается к другим модулям через window.__modules__,
          // эти модули уже существуют (даже если они еще не выполнились)
          // Примечание: Код модуля уже содержит все необходимые импорты (включая StyleSheet и др.)
          // как const объявления в начале, поэтому не нужно их деструктурировать здесь
          ${processedDep}
          
          // Теперь все переменные должны быть доступны в этой области видимости
          const moduleExports = {};
          
          // Добавляем named exports - используем прямую проверку в текущей области видимости
          ${namedExports.length > 0 ? namedExports.map(name => 
            `if (typeof ${name} !== "undefined") { 
              moduleExports.${name} = ${name}; 
              console.log('Added named export ${name} to module ${importPath}:', ${name});
            } else { 
              console.error('Named export ${name} is undefined in module ${importPath}!');
              try {
                if (typeof window !== 'undefined' && typeof window.${name} !== 'undefined') {
                  moduleExports.${name} = window.${name};
                  console.log('Found ${name} on window object');
                }
              } catch(e) {
                console.error('Error while trying to find ${name}:', e);
              }
            }`
          ).join('\n          ') : '// No named exports'}
          
          // Добавляем default export
          ${hasDefaultExport && defaultExportName ? 
            `moduleExports.default = typeof ${defaultExportName} !== "undefined" ? ${defaultExportName} : (moduleExports.styles || moduleExports);` : 
            'moduleExports.default = moduleExports.styles || moduleExports;'
          }
          
          console.log('Module loaded:', '${importPath}', 'absolute:', '${moduleAbsolutePath}', moduleExports);
          console.log('Module named exports list:', ${JSON.stringify(namedExports)});
          console.log('Module exports keys:', Object.keys(moduleExports));
          
          // Регистрируем модуль по абсолютному пути (нормализованному)
          window.__modules__['${moduleAbsolutePath}'] = moduleExports;
          // Также регистрируем по всем относительным путям из pathMap для обратной совместимости
          window.__modules__['${importPath}'] = moduleExports;
          
          // Регистрируем по всем путям, которые указывают на этот абсолютный путь
          const allPaths = ${JSON.stringify(allRelativePaths)};
          allPaths.forEach(path => {
            window.__modules__[path] = moduleExports;
          });
          
          // Регистрируем по всем возможным вариантам путей для поддержки импортов из разных контекстов
          const allPossiblePaths = ${JSON.stringify(Array.from(allPossiblePaths))};
          allPossiblePaths.forEach(path => {
            if (path && path.trim()) {
              window.__modules__[path] = moduleExports;
            }
          });
          
          // Дополнительно регистрируем по имени файла без расширения для лучшей совместимости
          const fileName = '${moduleAbsolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
          if (fileName) {
            window.__modules__[fileName] = moduleExports;
          }
          
          // Также регистрируем по всем вариантам путей, которые могут быть использованы из разных контекстов
          const resolvedVariants = [
            '${moduleAbsolutePath}',
            '${moduleAbsolutePath.replace(/\.(js|jsx|ts|tsx)$/, '')}',
            '${moduleAbsolutePath.split('/').slice(-2).join('/')}',
            '${moduleAbsolutePath.split('/').slice(-2).join('/').replace(/\.(js|jsx|ts|tsx)$/, '')}',
            '${moduleAbsolutePath.split('/').pop()}',
            '${moduleAbsolutePath.split('/').pop().replace(/\.(js|jsx|ts|tsx)$/, '')}'
          ];
          resolvedVariants.forEach(variant => {
            if (variant && variant.trim()) {
              window.__modules__[variant] = moduleExports;
            }
          });
          
          console.log('Registered module under keys:', allPossiblePaths);
        })();
      `;
      
      // Заменяем импорт на доступ к модулю
      // Ищем импорт по всем возможным путям (относительному и абсолютному)
      let importStatement = imports.find(imp => imp.path === importPath);
      if (!importStatement) {
        // Если не найдено по абсолютному пути, ищем по относительным путям из pathMap
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === importPath) {
            importStatement = imports.find(imp => imp.path === relPath);
            if (importStatement) break;
          }
        }
      }
      if (importStatement) {
        // Парсим, что именно импортируется
        const match = importStatement.fullStatement.match(/import\s+(.*?)\s+from/);
        if (match) {
          const importSpec = match[1].trim();
          // Проверяем import * as name from ...
          const starAsMatch = importStatement.fullStatement.match(/import\s+\*\s+as\s+(\w+)/);
          if (starAsMatch) {
            const alias = starAsMatch[1];
            importReplacements[importStatement.fullStatement] = `const ${alias} = window.__modules__['${importPath}'];`;
          } else if (importSpec.startsWith('{')) {
            // Named imports: import { a, b as c } from ...
            const names = importSpec.replace(/[{}]/g, '').split(',').map(n => n.trim()).filter(n => n);
            // Получаем абсолютный путь для этого модуля
            const absolutePath = dependencyModules[importPath] || importPath;
            const replacements = names.map(name => {
              const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
              let orig = parts[0].trim();
              let alias = parts[1].trim();
              // Валидация имени переменной: убираем недопустимые символы
              alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
                // Если имя невалидно, используем безопасное имя
                alias = 'imported_' + Math.random().toString(36).substr(2, 9);
              }
              // Также валидируем orig, так как он используется в module.${orig}
              orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!orig) {
                orig = 'default';
              }
              // Пробуем сначала абсолютный путь, потом относительный
              return `const ${alias} = (() => {
                // Ищем модуль по всем возможным путям
                const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
                const module2 = window.__modules__ && window.__modules__['${importPath}'];
                // Также пробуем найти модуль по любому пути, который содержит имя файла
                let module3 = null;
                const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
                if (window.__modules__) {
                  for (const key of Object.keys(window.__modules__)) {
                    if (key.includes(fileName) || key.endsWith('${importPath}') || key === fileName) {
                      module3 = window.__modules__[key];
                      break;
                    }
                  }
                }
                const module = module1 || module2 || module3;
                if (!module) {
                  console.error('Module not found for ${importPath}. Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Tried paths: ${absolutePath}, ${importPath}');
                  throw new Error('Module not found: ${importPath}');
                }
                const value = module.${orig} || module.default?.${orig};
                if (value === undefined) {
                  console.error('Failed to import ${orig} from ${importPath}.');
                  console.error('Module found:', module);
                  console.error('Module keys:', Object.keys(module || {}));
                  console.error('Available modules:', Object.keys(window.__modules__ || {}));
                  throw new Error('Failed to import ${orig} from ${importPath}. Export "${orig}" not found in module. Available exports: ' + Object.keys(module || {}).join(', '));
                }
                return value;
              })();`;
            });
            importReplacements[importStatement.fullStatement] = replacements.join('\n');
          } else {
            // Default import: import name from ...
            // Получаем абсолютный путь для этого модуля (используем ту же логику, что и для named imports)
            const absolutePath = dependencyModules[importPath] || importPath;
            
            // Создаем код для импорта default значения
            importReplacements[importStatement.fullStatement] = `const ${importSpec} = (() => {
              const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
              const module2 = window.__modules__ && window.__modules__['${importPath}'];
              // Также пробуем найти модуль по любому пути, который содержит имя файла
              let module3 = null;
              const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
              if (window.__modules__) {
                for (const key of Object.keys(window.__modules__)) {
                  if (key.includes(fileName) || key.endsWith('${importPath}')) {
                    module3 = window.__modules__[key];
                    break;
                  }
                }
              }
              const module = module1 || module2 || module3;
              const value = module?.default || module?.styles || module;
              if (value === undefined) {
                console.error('Failed to import default from ${importPath}. Available modules:', Object.keys(window.__modules__ || {}));
                throw new Error('Failed to import default from ${importPath}. Module not found or default export not available.');
              }
              return value;
            })();`;
          }
        }
      }
    }
    
    // Обрабатываем импорты в основном файле
    for (const imp of imports) {
      // Специальная обработка для react-native импортов
      if (imp.path === 'react-native') {
        const match = imp.fullStatement.match(/import\s+(.*?)\s+from/);
        if (!match) continue;
        
        const importSpec = match[1].trim();
        
        // Named imports: import { View, Text, StyleSheet } from 'react-native'
        if (importSpec.startsWith('{')) {
          const names = importSpec.replace(/[{}]/g, '').split(',').map(n => n.trim()).filter(n => n);
          const replacements = names.map(name => {
            const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
            const orig = parts[0].trim();
            const alias = parts[1].trim();
            return `const ${alias} = window.${orig} || window.ReactNativeWeb?.${orig};`;
          });
          importReplacements[imp.fullStatement] = replacements.join('\n');
        } else {
          // Default import: import RN from 'react-native'
          importReplacements[imp.fullStatement] = `const ${importSpec} = window.ReactNativeWeb;`;
        }
        continue;
      }
      
      // Пропускаем другие внешние библиотеки
      if (imp.path.startsWith('react') || imp.path.startsWith('@') || imp.path.startsWith('http')) {
        continue;
      }
      
      // Получаем абсолютный путь для этого импорта
      const absolutePath = dependencyModules[imp.path] || pathMap[imp.path] || imp.path;
      
      // Парсим, что именно импортируется
      const match = imp.fullStatement.match(/import\s+(.*?)\s+from/);
      if (!match) continue;
      
      const importSpec = match[1].trim();
      
      // Проверяем import * as name from ...
      const starAsMatch = imp.fullStatement.match(/import\s+\*\s+as\s+(\w+)/);
      if (starAsMatch) {
        const alias = starAsMatch[1];
        importReplacements[imp.fullStatement] = `const ${alias} = window.__modules__ && window.__modules__['${absolutePath}'] || window.__modules__ && window.__modules__['${imp.path}'] || {};`;
      } else if (importSpec.startsWith('{')) {
        // Named imports: import { a, b as c } from ...
        const names = importSpec.replace(/[{}]/g, '').split(',').map(n => n.trim()).filter(n => n);
        const replacements = names.map(name => {
          const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
          let orig = parts[0].trim();
          let alias = parts[1].trim();
          // Валидация имени переменной: убираем недопустимые символы
          alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
          if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
            // Если имя невалидно, используем безопасное имя
            alias = 'imported_' + Math.random().toString(36).substr(2, 9);
          }
          // Также валидируем orig, так как он используется в module.${orig}
          orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
          if (!orig) {
            orig = 'default';
          }
          return `const ${alias} = (() => {
            const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
            const module2 = window.__modules__ && window.__modules__['${imp.path}'];
            let module3 = null;
            const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
            if (window.__modules__) {
              for (const key of Object.keys(window.__modules__)) {
                if (key.includes(fileName) || key.endsWith('${imp.path}') || key === fileName) {
                  module3 = window.__modules__[key];
                  break;
                }
              }
            }
            const module = module1 || module2 || module3;
            if (!module) {
              console.error('Module not found for ${imp.path}. Available modules:', Object.keys(window.__modules__ || {}));
              throw new Error('Module not found: ${imp.path}');
            }
            const value = module.${orig} || module.default?.${orig};
            if (value === undefined) {
              console.error('Failed to import ${orig} from ${imp.path}.');
              console.error('Module found:', module);
              console.error('Module keys:', Object.keys(module || {}));
              console.error('Available modules:', Object.keys(window.__modules__ || {}));
              throw new Error('Failed to import ${orig} from ${imp.path}. Export "${orig}" not found in module. Available exports: ' + Object.keys(module || {}).join(', '));
            }
            return value;
          })();`;
        });
        importReplacements[imp.fullStatement] = replacements.join('\n');
      } else {
        // Default import: import name from ...
        importReplacements[imp.fullStatement] = `const ${importSpec} = (() => {
          const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
          const module2 = window.__modules__ && window.__modules__['${imp.path}'];
          let module3 = null;
          const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
          if (window.__modules__) {
            for (const key of Object.keys(window.__modules__)) {
              if (key.includes(fileName) || key.endsWith('${imp.path}')) {
                module3 = window.__modules__[key];
                break;
              }
            }
          }
          const module = module1 || module2 || module3;
          const value = module?.default || module?.styles || module;
          if (value === undefined) {
            console.error('Failed to import default from ${imp.path}. Available modules:', Object.keys(window.__modules__ || {}));
            throw new Error('Failed to import default from ${imp.path}. Module not found or default export not available.');
          }
          return value;
        })();`;
      }
    }
    
    // Заменяем импорты в коде
    console.log('ReactFramework: Import replacements:', importReplacements);
    console.log('[ProcessReactCode] Before import replacements - processedCode length:', processedCode.length);
    console.log('[ProcessReactCode] Before import replacements - first 500 chars:', processedCode.substring(0, 500));
    console.log('[ProcessReactCode] Number of replacements:', Object.keys(importReplacements).length);
    
    let replacementCount = 0;
    for (const [original, replacement] of Object.entries(importReplacements)) {
      if (processedCode.includes(original)) {
        const lengthBefore = processedCode.length;
        processedCode = processedCode.replace(original, replacement);
        const lengthAfter = processedCode.length;
        replacementCount++;
        console.log(`[ProcessReactCode] Replacement ${replacementCount}:`, {
          original: original.substring(0, 60),
          lengthBefore,
          lengthAfter,
          delta: lengthAfter - lengthBefore,
          codeAfterFirst200: processedCode.substring(0, 200)
        });
      } else {
        console.warn('ReactFramework: Import not found in code:', original.substring(0, 100));
      }
    }
    
    console.log('[ProcessReactCode] After import replacements - processedCode length:', processedCode.length);
    console.log('[ProcessReactCode] After import replacements - first 500 chars:', processedCode.substring(0, 500));
    
    console.log('[ProcessReactCode] Before CSS removal - processedCode length:', processedCode.length);
    
    // Удаляем CSS/SCSS/LESS импорты (они обрабатываются отдельно через style tags)
    processedCode = processedCode
      .replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '')
      .replace(/import\s+['"][^'"]*\.scss['"];?\s*/g, '')
      .replace(/import\s+['"][^'"]*\.less['"];?\s*/g, '');
    
    console.log('[ProcessReactCode] After CSS removal - processedCode length:', processedCode.length);
    console.log('[ProcessReactCode] Before removing remaining imports - processedCode length:', processedCode.length);
    
    // Удаляем оставшиеся локальные импорты (которые не были заменены)
    processedCode = processedCode.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
    
    console.log('[ProcessReactCode] After removing remaining imports - processedCode length:', processedCode.length);
    console.log('[ProcessReactCode] Final processedCode first 500 chars:', processedCode.substring(0, 500));
    console.log('ReactFramework: Processed code length:', processedCode.length);
    console.log('ReactFramework: Modules code length:', modulesCode.length);
    console.log('ReactFramework: Dependency paths:', dependencyPaths);
    
    // Создаем код для предварительной регистрации всех модулей
    // Это гарантирует, что модули будут доступны, даже если они еще не выполнились
    const allModulePaths = new Set();
    // Собираем все возможные пути для каждого модуля
    for (const [relPath, absPath] of Object.entries(pathMap)) {
      allModulePaths.add(relPath);
      allModulePaths.add(absPath);
      // Также добавляем варианты без расширения и последние части пути
      const absPathNoExt = absPath.replace(/\.(js|jsx|ts|tsx)$/, '');
      allModulePaths.add(absPathNoExt);
      const parts = absPath.split('/');
      if (parts.length >= 2) {
        allModulePaths.add(parts.slice(-2).join('/'));
        allModulePaths.add(parts.slice(-2).join('/').replace(/\.(js|jsx|ts|tsx)$/, ''));
      }
      if (parts.length > 0) {
        allModulePaths.add(parts[parts.length - 1]);
        allModulePaths.add(parts[parts.length - 1].replace(/\.(js|jsx|ts|tsx)$/, ''));
      }
    }
    
    // Также добавляем все пути из allPossiblePaths для каждого модуля
    for (const absolutePath of uniqueAbsolutePaths) {
      const moduleAbsolutePath = dependencyModules[absolutePath] || absolutePath;
      const pathParts = moduleAbsolutePath.split('/');
      if (pathParts.length >= 2) {
        allModulePaths.add(pathParts.slice(-2).join('/'));
        allModulePaths.add(pathParts.slice(-2).join('/').replace(/\.(js|jsx|ts|tsx)$/, ''));
      }
      if (pathParts.length > 0) {
        allModulePaths.add(pathParts[pathParts.length - 1]);
        allModulePaths.add(pathParts[pathParts.length - 1].replace(/\.(js|jsx|ts|tsx)$/, ''));
      }
    }
    
    const preRegisterCode = Array.from(allModulePaths).filter(Boolean).map(path => {
      // Экранируем кавычки в пути
      const escapedPath = path.replace(/'/g, "\\'");
      return `window.__modules__['${escapedPath}'] = window.__modules__['${escapedPath}'] || null;`;
    }).join('\n        ');
    
    // Обертываем modulesCode, чтобы сначала предварительно зарегистрировать модули
    const wrappedModulesCode = `
        // Предварительная регистрация всех модулей (создаем пустые слоты)
        ${preRegisterCode}
        
        console.log('Pre-registered ${allModulePaths.size} module paths:', ${JSON.stringify(Array.from(allModulePaths).slice(0, 20))});
        
        // Теперь загружаем модули (они заполнят предварительно зарегистрированные слоты)
        ${modulesCode}
        
        console.log('All modules loaded. Total modules:', Object.keys(window.__modules__ || {}).length);
        console.log('Registered module keys:', Object.keys(window.__modules__ || {}));
    `;
    
    return {
      processedCode: processedCode,
      dependencyPaths: dependencyPaths,
      modulesCode: wrappedModulesCode,
      defaultExportInfo: defaultExportInfo
    };
  }

  /**
   * Генерирует HTML для превью/редактора
   * Перенесено из RenderFile.jsx: createReactHTML
   */
  async generateHTML(code, filePath, options = {}) {
    const viewMode = options.viewMode || 'preview';
    
    // ВАЖНО: сначала инструментируем ИСХОДНЫЙ код, чтобы data-no-code-ui-id были стабильны
    const instOriginal = instrumentJsx(code, filePath);
    
    // Обрабатываем код (загружаем зависимости, заменяем импорты)
    const processed = await this.processReactCode(instOriginal.code, filePath);
    const processedCodeBeforeInst = processed.processedCode;
    const modulesCode = processed.modulesCode || '';
    const dependencyPaths = processed.dependencyPaths || [];
    const defaultExportInfo = processed.defaultExportInfo || null;
    
    // Собираем карту для превью/редактора на обработанном коде
    const instProcessed = instrumentJsx(processedCodeBeforeInst, filePath);
    const processedCode = instProcessed.code;
    
    // Детектируем компоненты в обработанном коде
    const detectedComponents = detectComponents(processedCode);
    console.log('ReactFramework: Detected components:', detectedComponents);
    
    // Если есть информация о default export, добавляем её с наивысшим приоритетом
    if (defaultExportInfo && !detectedComponents.find(c => c.name === defaultExportInfo.name && c.type === 'default-export')) {
      detectedComponents.unshift({
        name: defaultExportInfo.name,
        type: 'default-export',
        priority: 0
      });
      console.log('ReactFramework: Added defaultExportInfo:', defaultExportInfo);
    }
    
    // Находим компонент для рендеринга по приоритету
    let componentToRender = null;
    let componentName = null;
    
    // Приоритет: default export > named exports > остальные компоненты
    for (const comp of detectedComponents) {
      const name = comp.name;
      
      // Проверяем, что это не ключевое слово JavaScript
      const jsKeywords = ['function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return'];
      if (jsKeywords.includes(name)) {
        console.log(`ReactFramework: Skipping JS keyword: ${name}`);
        continue;
      }
      
      // Проверяем, что компонент действительно существует в коде
      const componentExists = 
        new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode) ||
        new RegExp(`\\b${name}\\s*=`).test(processedCode) ||
        new RegExp(`export\\s+default\\s+function\\s+${name}`).test(processedCode) ||
        new RegExp(`export\\s+default\\s+${name}`).test(processedCode);
      
      console.log(`ReactFramework: Checking component ${name}:`, {
        type: comp.type,
        exists: componentExists,
        priority: comp.priority,
        isAnonymous: comp.isAnonymous,
        isInferred: comp.isInferred
      });
      
      if (componentExists) {
        componentToRender = comp.name;
        componentName = comp.name;
        console.log('ReactFramework: Selected component:', name);
        break;
      }
    }
    
    // Если не нашли компонент, пробуем найти по имени из defaultExportInfo
    if (!componentToRender && defaultExportInfo) {
      const name = defaultExportInfo.name;
      const jsKeywords = ['function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return'];
      if (!jsKeywords.includes(name) && new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode)) {
        componentToRender = name;
        componentName = name;
        console.log('ReactFramework: Selected component from defaultExportInfo:', name);
      }
    }
    
    // FALLBACK: Если все еще не нашли компонент, ищем любую функцию с заглавной буквы
    // которая возвращает JSX (содержит return <...)
    if (!componentToRender) {
      console.log('ReactFramework: No component found, searching for any renderable function...');
      
      // Ищем все функции с заглавной буквы
      const functionMatches = processedCode.matchAll(/(?:function|const|let|var)\s+([A-Z][a-zA-Z0-9_$]*)\s*[=(]/g);
      const potentialComponents = [];
      
      for (const match of functionMatches) {
        const funcName = match[1];
        // Находим тело функции (примерно 500 символов после объявления)
        const funcIndex = match.index;
        const funcBody = processedCode.substring(funcIndex, funcIndex + 500);
        
        // Проверяем, возвращает ли функция JSX
        const returnsJSX = /return\s*\(?\s*</.test(funcBody) || /return\s+</.test(funcBody);
        
        if (returnsJSX) {
          potentialComponents.push(funcName);
          console.log('ReactFramework: Found potential component:', funcName);
        }
      }
      
      if (potentialComponents.length > 0) {
        componentToRender = potentialComponents[0];
        componentName = potentialComponents[0];
        console.log('ReactFramework: Auto-selected renderable component:', componentToRender);
      } else {
        // Последний fallback: стандартные имена
        const standardNames = ['App', 'MyComponent', 'Component'];
        for (const name of standardNames) {
          if (new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode)) {
            componentToRender = name;
            componentName = name;
            console.log('ReactFramework: Fallback to standard name:', name);
            break;
          }
        }
      }
    }
    
    // Создаем HTML обертку для React
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Component Preview</title>
    <script>
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(filePath)};
    </script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    
    <!-- Ждем полной загрузки React перед инициализацией -->
    <script>
      // Функция для безопасной инициализации после загрузки React
      function initializeReactGlobals() {
        if (typeof React === 'undefined' || !React) {
          console.warn('[Init] React not loaded yet, retrying...');
          setTimeout(initializeReactGlobals, 50);
          return;
        }
        
        console.log('[Init] React loaded, initializing globals...');
        console.log('[React Hooks] Making all React hooks and APIs globally available...');
        
        // ========================================
        // БАЗОВЫЕ ХУКИ (React 16.8+)
        // ========================================
        if (React.useState) window.useState = React.useState;
          if (React.useEffect) window.useEffect = React.useEffect;
          if (React.useContext) window.useContext = React.useContext;
          
          // ========================================
          // ДОПОЛНИТЕЛЬНЫЕ ХУКИ
          // ========================================
          if (React.useReducer) window.useReducer = React.useReducer;
          if (React.useCallback) window.useCallback = React.useCallback;
          if (React.useMemo) window.useMemo = React.useMemo;
          if (React.useRef) window.useRef = React.useRef;
          if (React.useImperativeHandle) window.useImperativeHandle = React.useImperativeHandle;
          if (React.useLayoutEffect) window.useLayoutEffect = React.useLayoutEffect;
          if (React.useDebugValue) window.useDebugValue = React.useDebugValue;
          
          // ========================================
          // REACT 18+ ХУКИ
          // ========================================
          if (React.useId) window.useId = React.useId;
          if (React.useTransition) window.useTransition = React.useTransition;
          if (React.useDeferredValue) window.useDeferredValue = React.useDeferredValue;
          if (React.useSyncExternalStore) window.useSyncExternalStore = React.useSyncExternalStore;
          if (React.useInsertionEffect) window.useInsertionEffect = React.useInsertionEffect;
          
          // ========================================
          // ЭКСПЕРИМЕНТАЛЬНЫЕ ХУКИ (React 19+, если доступны)
          // ========================================
          if (React.use) window.use = React.use;
          if (React.useOptimistic) window.useOptimistic = React.useOptimistic;
          if (React.useFormStatus) window.useFormStatus = React.useFormStatus;
          if (React.useFormState) window.useFormState = React.useFormState;
          if (React.useActionState) window.useActionState = React.useActionState;
          
          // ========================================
          // REACT API - КОМПОНЕНТЫ И УТИЛИТЫ
          // ========================================
          if (React.createContext) window.createContext = React.createContext;
          if (React.forwardRef) window.forwardRef = React.forwardRef;
          if (React.memo) window.memo = React.memo;
          if (React.lazy) window.lazy = React.lazy;
          if (React.Suspense) window.Suspense = React.Suspense;
          if (React.Fragment) window.Fragment = React.Fragment;
          if (React.StrictMode) window.StrictMode = React.StrictMode;
          if (React.Profiler) window.Profiler = React.Profiler;
          
          // ========================================
          // КЛАССОВЫЕ КОМПОНЕНТЫ
          // ========================================
          if (React.Component) window.Component = React.Component;
          if (React.PureComponent) window.PureComponent = React.PureComponent;
          
          // ========================================
          // СОЗДАНИЕ ЭЛЕМЕНТОВ
          // ========================================
          if (React.createElement) window.createElement = React.createElement;
          if (React.cloneElement) window.cloneElement = React.cloneElement;
          if (React.createFactory) window.createFactory = React.createFactory;
          if (React.isValidElement) window.isValidElement = React.isValidElement;
          
          // ========================================
          // CHILDREN УТИЛИТЫ
          // ========================================
          if (React.Children) {
            window.Children = React.Children;
          }
          
          // ========================================
          // REACT 18+ CONCURRENT FEATURES
          // ========================================
          if (React.startTransition) window.startTransition = React.startTransition;
          
          // Подсчет доступных хуков
          const hooks = [
            'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback',
            'useMemo', 'useRef', 'useImperativeHandle', 'useLayoutEffect', 'useDebugValue',
            'useId', 'useTransition', 'useDeferredValue', 'useSyncExternalStore', 'useInsertionEffect',
            'use', 'useOptimistic', 'useFormStatus', 'useFormState', 'useActionState'
          ].filter(hook => React[hook]);
        
        console.log('[React Hooks] Total hooks available:', hooks.length);
        console.log('[React Hooks] Available hooks:', hooks.join(', '));
        console.log('[Init] React globals initialized successfully');
      }
      
      // Запускаем инициализацию
      initializeReactGlobals();
    </script>
    
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f5f5f5;
        }
        #root {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px 0;
        }
        .info {
            color: #666;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>React Component Preview</strong><br>
        Компонент загружается из выбранного файла...
    </div>
    <div id="root"></div>
    <script type="text/babel" data-type="module">
        // Делаем все React хуки доступными в Babel скрипте
        const React = window.React;
        
        // Базовые хуки (React 16.8+)
        const { 
          useState, useEffect, useContext, useReducer, useCallback, useMemo, useRef,
          useImperativeHandle, useLayoutEffect, useDebugValue
        } = React;
        
        // React 18+ хуки (безопасная деструктуризация)
        const useId = React.useId || (() => Math.random().toString(36));
        const useTransition = React.useTransition || (() => [false, (fn) => fn()]);
        const useDeferredValue = React.useDeferredValue || ((value) => value);
        const useSyncExternalStore = React.useSyncExternalStore;
        const useInsertionEffect = React.useInsertionEffect || useLayoutEffect;
        
        // React 19+ экспериментальные хуки (если доступны)
        const use = React.use;
        const useOptimistic = React.useOptimistic;
        const useFormStatus = React.useFormStatus;
        const useFormState = React.useFormState;
        const useActionState = React.useActionState;
        
        // React API
        const { 
          createContext, forwardRef, memo, lazy, Suspense, Fragment,
          Component, PureComponent, createElement, cloneElement, isValidElement,
          Children, StrictMode, Profiler, startTransition
        } = React;
        
        window.__modules__ = window.__modules__ || {};
        console.log('Before loading modules, window.__modules__ initialized');
        
        ${modulesCode}
        
        console.log('Available modules:', Object.keys(window.__modules__ || {}));
        
        try {
            ${processedCode}
            
            let Component = null;
            ${componentToRender ? 
              `if (typeof ${componentName} !== 'undefined') {
                Component = ${componentName};
              }` : 
              `if (typeof App !== 'undefined') {
                Component = App;
              } else if (typeof MyComponent !== 'undefined') {
                Component = MyComponent;
              } else if (typeof Component !== 'undefined') {
                Component = Component;
              }`
            }
            
            if (Component) {
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                
                setTimeout(() => {
                  const rootElement = document.getElementById('root');
                  const filePath = window.__MRPAK_FILE_PATH__ || '';
                  
                  if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                    window.__MRPAK_BUILD_TREE__();
                  }
                  
                  const observer = new MutationObserver((mutations) => {
                    const rootElement = document.getElementById('root');
                    if (rootElement) {
                      if (typeof buildTree === 'function') {
                        buildTree();
                      }
                    }
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                }, 100);
            } else {
                const foundComponents = ${JSON.stringify(detectedComponents.map(c => c.name))};
                const errorMsg = foundComponents.length > 0 
                  ? 'Найдены компоненты: ' + foundComponents.join(', ') + '. Но не удалось их использовать для рендеринга.'
                  : 'Не найден компонент для рендеринга.';
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error"><strong>Ошибка выполнения:</strong><br>' + error.message + '</div>';
            console.error('React execution error:', error);
        }
    </script>
</body>
</html>
    `;
    
    // Инжектируем скрипт блочного редактора
    const htmlWithEditor = injectBlockEditorScript(html, 'react', viewMode === 'edit' ? 'edit' : 'preview');
    
    return {
      html: htmlWithEditor,
      dependencyPaths,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
    };
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
      externalStylesMap
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
      snippet
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
      blockMapForEditor: instProcessed.map
    };
  }

  /**
   * Коммитит накопленные патчи и операции в React файл
   * Перенесено из RenderFile.jsx: commitStagedPatches для React/React Native
   */
  async commitPatches({ originalCode, stagedPatches, stagedOps, blockMapForFile, externalStylesMap, filePath, resolvePath, readFile, writeFile }) {
    const entries = Object.entries(stagedPatches || {}).filter(
      ([id, p]) => id && p && Object.keys(p).length > 0
    );
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
    const instMap = instResult.map;

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

    for (const { id, patch, entry } of sortedEntries) {
      const res = this.applyStylePatch({
        code: newContent,
        mapEntry: entry,
        patch,
        externalStylesMap
      });
      if (!res?.ok) {
        throw new Error(res?.error || `Не удалось применить изменения для блока ${id}`);
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
    const instMapAfterStyles = instResultAfterStyles.map;

    // 3) Применяем ops (insert/delete/reparent/setText) по очереди
    const jsxOps = ops.filter(
      (o) => o && (o.type === 'delete' || o.type === 'insert' || o.type === 'reparent' || o.type === 'setText')
    );

    for (const op of jsxOps) {
      if (op.type === 'delete') {
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

