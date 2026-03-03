import { detectComponents } from '../../features/file-renderer/lib/react-processor';
import { injectBlockEditorScript } from '../../features/file-renderer/lib/block-editor-script';

/**
 * Генерирует HTML для превью/редактора React-файлов.
 * Вынесено из ReactFramework.generateHTML.
 */
export async function generateReactHTML({ framework, code, filePath, options = {} }) {
  const viewMode = options.viewMode || 'preview';
  const projectRoot = options.projectRoot || null;
  
  // ВАЖНО: сначала инструментируем ИСХОДНЫЙ код, чтобы data-no-code-ui-id были стабильны
  const instOriginal = framework.instrument(code, filePath, { projectRoot });
  
  // Обрабатываем код (загружаем зависимости, заменяем импорты)
  const processed = await framework.processReactCode(instOriginal.code, filePath);
  const processedCodeBeforeInst = processed.processedCode;
  const modulesCode = processed.modulesCode || '';
  const dependencyPaths = processed.dependencyPaths || [];
  const defaultExportInfo = processed.defaultExportInfo || null;
  
  // Собираем карту для превью/редактора на обработанном коде
  const instProcessed = framework.instrument(processedCodeBeforeInst, filePath, { projectRoot });
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

