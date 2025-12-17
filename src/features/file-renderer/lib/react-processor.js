import { instrumentJsx } from '../../../blockEditor/JsxInstrumenter';
import { MRPAK_MSG } from '../../../blockEditor/EditorProtocol';
import { readFile } from '../../../shared/api/electron-api';

/**
 * Извлекает импорты из кода
 */
export function extractImports(code, sourceFile = 'unknown') {
  const imports = [];
  const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"];?/g;
  let match;
  
  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    const fullImport = match[0];
    const lineNumber = code.substring(0, match.index).split('\n').length;
    
    // Пропускаем только внешние библиотеки (npm пакеты)
    // Теперь обрабатываем локальные импорты, включая относительные и @ пути
    if (!importPath.startsWith('react') && 
        !importPath.startsWith('react-dom') &&
        !importPath.startsWith('react-native') &&
        !importPath.startsWith('node_modules') &&
        !importPath.startsWith('http://') &&
        !importPath.startsWith('https://')) {
      imports.push({
        path: importPath,
        fullStatement: fullImport,
        line: lineNumber
      });
      
      console.log(`[Import Extraction] Found import in ${sourceFile}:`, {
        file: sourceFile,
        importPath,
        line: lineNumber,
        fullStatement: fullImport.trim()
      });
    }
  }
  
  if (imports.length > 0) {
    console.log(`[Import Extraction] Total imports found in ${sourceFile}:`, imports.length, imports.map(i => `${i.path} (line ${i.line})`));
  }
  
  return imports;
}

/**
 * Детектирует React компоненты в коде
 */
export function detectComponents(code) {
  const components = [];
  
  // 1. Поиск default export (высший приоритет)
  
  // Паттерн 1: export default function ComponentName() { ... }
  // ВАЖНО: Имя должно быть ПОСЛЕ function и ПЕРЕД (
  const defaultFunctionMatch = code.match(/export\s+default\s+function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (defaultFunctionMatch) {
    const componentName = defaultFunctionMatch[1];
    // Проверяем, что это не ключевое слово JavaScript
    const jsKeywords = ['function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return'];
    if (!jsKeywords.includes(componentName)) {
      components.push({
        name: componentName,
        type: 'default-export-function',
        priority: 0 // Наивысший приоритет
      });
    }
  }
  
  // Паттерн 2: export default function() { ... } (анонимная функция)
  const defaultAnonymousFunctionMatch = code.match(/export\s+default\s+function\s*\(/);
  if (defaultAnonymousFunctionMatch && components.length === 0) {
    // Ищем любую функцию или const с заглавной буквы в файле
    const allFunctionsMatch = code.match(/(?:function|const|let|var)\s+([A-Z][a-zA-Z0-9_$]*)\s*[=(]/g);
    if (allFunctionsMatch) {
      // Берем первую найденную функцию с заглавной буквы
      const firstMatch = allFunctionsMatch[0].match(/([A-Z][a-zA-Z0-9_$]*)/);
      if (firstMatch) {
        components.push({
          name: firstMatch[1],
          type: 'default-export-anonymous',
          priority: 0.1,
          isAnonymous: true
        });
      }
    }
  }
  
  // Паттерн 3: export default ComponentName
  const defaultExportMatch = code.match(/export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  if (defaultExportMatch) {
    const componentName = defaultExportMatch[1];
    const jsKeywords = ['function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return'];
    if (!jsKeywords.includes(componentName) && !components.find(c => c.name === componentName)) {
    components.push({
        name: componentName,
      type: 'default-export',
      priority: 1
    });
    }
  }
  
  // Паттерн 4: export default () => { ... } (стрелочная функция)
  // В этом случае попробуем найти ближайшую функцию с заглавной буквы
  const defaultArrowMatch = code.match(/export\s+default\s+\(/);
  if (defaultArrowMatch && components.length === 0) {
    // Ищем функцию или const перед export default
    const beforeExport = code.substring(0, defaultArrowMatch.index);
    const nearestFunctionMatch = beforeExport.match(/(?:const|let|var|function)\s+([A-Z][a-zA-Z0-9_$]*)[^;]*$/);
    if (nearestFunctionMatch) {
      components.push({
        name: nearestFunctionMatch[1],
        type: 'default-export-arrow',
        priority: 0.5
      });
    } else {
      // Ищем любую функцию с заглавной буквы в файле
      const allFunctionsMatch = code.match(/(?:function|const|let|var)\s+([A-Z][a-zA-Z0-9_$]*)\s*[=(]/g);
      if (allFunctionsMatch) {
        const firstMatch = allFunctionsMatch[0].match(/([A-Z][a-zA-Z0-9_$]*)/);
        if (firstMatch) {
          components.push({
            name: firstMatch[1],
            type: 'default-export-arrow-inferred',
            priority: 0.6,
            isInferred: true
          });
        }
      }
    }
  }
  
  // 2. Поиск named exports
  const namedExportsMatch = code.match(/export\s+(?:const|let|var|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  if (namedExportsMatch) {
    namedExportsMatch.forEach((match, index) => {
      const nameMatch = match.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[;=]/);
      if (nameMatch) {
        const name = nameMatch[1];
        // Проверяем, что это не служебная функция
        if (!name.startsWith('use') && name[0] === name[0].toUpperCase()) {
          components.push({
            name: name,
            type: 'named-export',
            priority: 2 + index
          });
        }
      }
    });
  }
  
  // 3. Поиск компонентов по паттернам (функции с заглавной буквы)
  // function ComponentName() { ... }
  const functionComponentRegex = /function\s+([A-Z][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = functionComponentRegex.exec(code)) !== null) {
    const name = match[1];
    // Проверяем, что функция возвращает JSX или React элемент
    const functionBody = code.substring(match.index);
    const returnMatch = functionBody.match(/\{[\s\S]{0,500}return\s+(?:<|React\.createElement|jsx|JSX)/i);
    if (returnMatch && !components.find(c => c.name === name)) {
      components.push({
        name: name,
        type: 'function-component',
        priority: 100 + components.length
      });
    }
  }
  
  // const ComponentName = () => { ... } или const ComponentName = function() { ... }
  const constComponentRegex = /const\s+([A-Z][a-zA-Z0-9_$]*)\s*=\s*(?:\([^)]*\)\s*=>|function\s*\([^)]*\))\s*\{/g;
  while ((match = constComponentRegex.exec(code)) !== null) {
    const name = match[1];
    // Проверяем, что функция возвращает JSX или React элемент
    const functionBody = code.substring(match.index);
    const returnMatch = functionBody.match(/\{[\s\S]{0,500}return\s+(?:<|React\.createElement|jsx|JSX)/i);
    if (returnMatch && !components.find(c => c.name === name)) {
      components.push({
        name: name,
        type: 'arrow-component',
        priority: 200 + components.length
      });
    }
  }
  
  // 4. Поиск любых переменных/функций с заглавной буквы, которые могут быть компонентами
  // Это fallback для случаев, когда паттерн не совпадает точно
  const anyComponentRegex = /(?:const|let|var|function)\s+([A-Z][a-zA-Z0-9_$]*)/g;
  while ((match = anyComponentRegex.exec(code)) !== null) {
    const name = match[1];
    // Пропускаем стандартные имена и уже найденные
    if (['React', 'ReactDOM', 'Component', 'PureComponent', 'Fragment'].includes(name)) {
      continue;
    }
    if (!components.find(c => c.name === name)) {
      // Проверяем контекст - есть ли рядом JSX или React.createElement
      const context = code.substring(Math.max(0, match.index - 100), match.index + 200);
      if (context.match(/(?:return|=>)\s*(?:<|React\.createElement)/i)) {
        components.push({
          name: name,
          type: 'potential-component',
          priority: 300 + components.length
        });
      }
    }
  }
  
  // Сортируем по приоритету
  components.sort((a, b) => a.priority - b.priority);
  
  return components;
}

/**
 * Создает HTML обертку для React файлов
 * Эта функция должна быть вызвана с зависимостями из path-resolver и других модулей
 */
export function createReactHTMLTemplate({
  processedCode,
  modulesCode,
  componentToRender,
  componentName,
  detectedComponents,
  basePath
}) {
  const inst = instrumentJsx(processedCode, basePath);
  const instrumentedCode = inst.code;
  
  return {
    html: `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Component Preview</title>
    <script>
        // Передаем filePath в глобальную переменную для использования в скрипте
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(basePath)};
    </script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
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
        // React доступен глобально через CDN
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        
        // Инициализируем window.__modules__ ДО загрузки модулей
        window.__modules__ = window.__modules__ || {};
        console.log('Before loading modules, window.__modules__ initialized');
        
        // Загружаем модули зависимостей
        ${modulesCode}
        
        // Отладочная информация
        console.log('Available modules:', Object.keys(window.__modules__ || {}));
        Object.keys(window.__modules__ || {}).forEach(path => {
          console.log('Module:', path, window.__modules__[path]);
        });
        
        // Функция для инструментирования DOM элементов с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
        function instrumentReactDOM(rootElement, filePath) {
          if (!rootElement) return;
          
          const safeBasename = (path) => {
            try {
              const norm = String(path || '').replace(/\\\\/g, '/');
              return norm.split('/').pop() || 'unknown';
            } catch {
              return 'unknown';
            }
          };
          
          const makeSelectorForElement = (el) => {
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const tag = cur.tagName.toLowerCase();
              const parent = cur.parentElement;
              if (!parent || parent === rootElement || parent === document.body || parent === document.documentElement) {
                parts.push(tag);
                break;
              }
              const children = Array.from(parent.children);
              const idx = children.indexOf(cur);
              const nth = idx >= 0 ? idx + 1 : 1;
              parts.push(\`\${tag}:nth-child(\${nth})\`);
              cur = parent;
            }
            return parts.reverse().join(' > ');
          };
          
          const makeMrpakId = (filePath, selector, tagName) => {
            const base = safeBasename(filePath);
            return \`mrpak:\${base}:\${tagName || 'el'}:\${selector}\`;
          };
          
          const used = new Set();
          const all = rootElement.querySelectorAll ? Array.from(rootElement.querySelectorAll('*')) : [];
          
          all.forEach((el) => {
            // Пропускаем элементы, которые уже имеют id-атрибут
            const existing = (el.getAttribute && (el.getAttribute('data-no-code-ui-id') || el.getAttribute('data-mrpak-id'))) || null;
            if (existing) {
              used.add(existing);
              return;
            }
            
            // Пропускаем script, style и другие служебные элементы
            const tagName = (el.tagName || '').toLowerCase();
            if (['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
              return;
            }
            
            const selector = makeSelectorForElement(el);
            let id = makeMrpakId(filePath, selector, tagName);
            
            // Убеждаемся, что ID уникален
            if (used.has(id)) {
              let i = 2;
              while (used.has(\`\${id}:\${i}\`)) i += 1;
              id = \`\${id}:\${i}\`;
            }
            used.add(id);
            
            if (el.setAttribute) {
              el.setAttribute('data-no-code-ui-id', id);
            }
          });
        }
        
        try {
            ${instrumentedCode}
            
            // Автоматически находим компонент для рендеринга
            let Component = null;
            ${componentToRender ? 
              `// Используем автоматически найденный компонент: ${componentName}
              if (typeof ${componentName} !== 'undefined') {
                Component = ${componentName};
              }` : 
              `// Пробуем стандартные имена как fallback
              if (typeof App !== 'undefined') {
                Component = App;
              } else if (typeof MyComponent !== 'undefined') {
                Component = MyComponent;
              } else if (typeof Component !== 'undefined') {
                Component = Component;
              } else {
                // Пробуем найти любой компонент с заглавной буквы
                const allVars = Object.keys(typeof window !== 'undefined' ? window : {});
                for (const varName of allVars) {
                  if (varName[0] === varName[0].toUpperCase() && 
                      typeof window[varName] === 'function' &&
                      varName !== 'React' && varName !== 'ReactDOM') {
                    Component = window[varName];
                    break;
                  }
                }
              }`
            }
            
            if (Component) {
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                
                // После рендеринга React инструментируем DOM и блокируем интерактивные элементы
                setTimeout(() => {
                  const rootElement = document.getElementById('root');
                  const filePath = window.__MRPAK_FILE_PATH__ || '';
                  
                  // Инструментируем DOM элементы с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
                  instrumentReactDOM(rootElement, filePath);
                  
                  // Обновляем дерево слоев после инструментирования
                  if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                    window.__MRPAK_BUILD_TREE__();
                  }
                  
                  // Используем MutationObserver для отслеживания новых элементов
                  const observer = new MutationObserver((mutations) => {
                    // Инструментируем новые элементы
                    const rootElement = document.getElementById('root');
                    if (rootElement) {
                      instrumentReactDOM(rootElement, filePath);
                      // Обновляем дерево слоев после инструментирования
                      if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                        window.__MRPAK_BUILD_TREE__();
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
                  : 'Не найден компонент для рендеринга. Убедитесь, что файл содержит React компонент (функцию с заглавной буквы, возвращающую JSX).';
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error"><strong>Ошибка выполнения:</strong><br>' + error.message + '</div>';
            console.error('React execution error:', error);
        }
    </script>
</body>
</html>
    `,
    blockMap: inst.map
  };
}

