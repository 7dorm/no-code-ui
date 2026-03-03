import { extractImports } from '../../features/file-renderer/lib/react-processor';

/**
 * Обрабатывает код React файла с поддержкой зависимостей.
 * Вынесено из ReactFramework.processReactCode, вызывается через .call(this, ...).
 */
export async function processReactCodeImpl(code, basePath) {
  // ВАЖНО: внутри этой функции используется this (экземпляр ReactFramework)
  // Код перенесен 1:1 из метода ReactFramework.processReactCode.

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
    processedDep = processedDep.replace(/import\s*\{([^}]*)\}\s*from\s+['"]react-native['"];?\s*/gi, (match, importsList) => {
      const names = importsList.split(',').map(n => n.trim()).filter(n => n);
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
    const defaultExportMatchDep = processedDep.match(/export\s+default\s+(.+?)(;|$)/s);
    if (defaultExportMatchDep) {
      hasDefaultExport = true;
      const exportValue = defaultExportMatchDep[1].trim();
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
      const exportsList = namedExportsMatch[1].split(',').map(e => e.trim()).filter(e => e);
      exportsList.forEach(exp => {
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
    const fileNameDep = pathParts[pathParts.length - 1];
    if (fileNameDep) {
      allPossiblePaths.add(fileNameDep);
      const fileNameNoExt = fileNameDep.replace(/\.(js|jsx|ts|tsx)$/, '');
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
          const absolutePathDep = dependencyModules[importPath] || importPath;
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
                const module1 = window.__modules__ && window.__modules__['${absolutePathDep}'];
                const module2 = window.__modules__ && window.__modules__['${importPath}'];
                // Также пробуем найти модуль по любому пути, который содержит имя файла
                let module3 = null;
                const fileName = '${absolutePathDep}'.split('/').pop().replace(/\.(js|jsx)$/, '');
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
                  console.error('Tried paths: ${absolutePathDep}, ${importPath}');
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
          const absolutePathDep = dependencyModules[importPath] || importPath;
          
          // Создаем код для импорта default значения
          importReplacements[importStatement.fullStatement] = `const ${importSpec} = (() => {
              const module1 = window.__modules__ && window.__modules__['${absolutePathDep}'];
              const module2 = window.__modules__ && window.__modules__['${importPath}'];
              // Также пробуем найти модуль по любому пути, который содержит имя файла
              let module3 = null;
              const fileName = '${absolutePathDep}'.split('/').pop().replace(/\.(js|jsx)$/, '');
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
      
      // Обрабатываем named импорты: import { View, Text } from 'react-native'
      if (importSpec.startsWith('{')) {
        const names = importSpec.replace(/[{}]/g, '').split(',').map(n => n.trim()).filter(n => n);
        const rnReplacements = names.map(name => {
          const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
          const orig = parts[0].trim();
          const alias = parts[1].trim();
          const safeAlias = alias.replace(/[^a-zA-Z0-9_$]/g, '') || orig.replace(/[^a-zA-Z0-9_$]/g, '') || 'RnImport';
          return `const ${safeAlias} = window.ReactNativeWeb?.${orig} || window.${orig};`;
        });
        importReplacements[imp.fullStatement] = rnReplacements.join('\n');
      } else {
        // Обрабатываем default import: import ReactNative from 'react-native'
        const alias = importSpec.replace(/[^a-zA-Z0-9_$]/g, '') || 'ReactNative';
        importReplacements[imp.fullStatement] = `const ${alias} = window.ReactNativeWeb || window.ReactNative;`;
      }
    }
  }
  
  // Применяем замены импортов
  for (const [importStmt, replacement] of Object.entries(importReplacements)) {
    processedCode = processedCode.replace(importStmt, replacement);
  }
  
  // Создаем pre-registration код для всех модулей
  const allModulePaths = new Set();
  for (const [relativePath, absolutePath] of Object.entries(pathMap)) {
    allModulePaths.add(relativePath);
    allModulePaths.add(absolutePath);
  }
  for (const depPath of Object.values(dependencyModules)) {
    allModulePaths.add(depPath);
  }
  
  // Генерируем код предварительной регистрации модулей
  const preRegisterCode = Array.from(allModulePaths)
    .filter(p => typeof p === 'string' && p.trim().length > 0)
    .map(p => `window.__modules__['${p}'] = window.__modules__['${p}'] || null;`)
    .join('\n        ');
  
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
    processedCode,
    dependencyPaths,
    modulesCode: wrappedModulesCode,
    defaultExportInfo: defaultExportInfo
  };
}

