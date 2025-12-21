/**
 * Реализация Framework для React Native файлов
 * Наследуется от ReactFramework, но добавляет поддержку React Native Web
 */
import { ReactFramework } from './ReactFramework';
import { instrumentJsx } from '../blockEditor/JsxInstrumenter';
import { instrumentJsxWithAst } from '../blockEditor/AstJsxInstrumenter';
import { isJavaScriptFile } from '../blockEditor/AstUtils';
import { detectComponents } from '../features/file-renderer/lib/react-processor';
import { generateBlockEditorScript } from '../features/file-renderer/lib/block-editor-script';
import { toReactStyleObjectText } from '../blockEditor/styleUtils';

/**
 * Реализация Framework для React Native файлов
 * Использует React Native Web для рендеринга в браузере
 */
export class ReactNativeFramework extends ReactFramework {
  /**
   * Генерирует HTML для превью/редактора с поддержкой React Native Web
   * Перенесено из RenderFile.jsx: createReactNativeHTML
   */
  async generateHTML(code, filePath, options = {}) {
    const viewMode = options.viewMode || 'preview';
    
    // ВАЖНО: сначала инструментируем ИСХОДНЫЙ код, чтобы data-no-code-ui-id были стабильны
    // Используем AST парсинг для JS/TS файлов с fallback
    const projectRoot = options.projectRoot || null;
    let instOriginal;
    if (isJavaScriptFile(filePath)) {
      try {
        instOriginal = instrumentJsxWithAst(code, filePath, { projectRoot });
      } catch (error) {
        console.warn('[ReactNativeFramework] AST instrumentation failed, falling back:', error.message);
        instOriginal = instrumentJsx(code, filePath);
      }
    } else {
      instOriginal = instrumentJsx(code, filePath);
    }
    
    // Обрабатываем код (загружаем зависимости, заменяем импорты)
    const processed = await this.processReactCode(instOriginal.code, filePath);
    const processedCodeBeforeInst = processed.processedCode;
    const modulesCode = processed.modulesCode || '';
    const dependencyPaths = processed.dependencyPaths || [];
    const defaultExportInfo = processed.defaultExportInfo || null;
    
    console.log('[ReactNativeFramework] After processReactCode:');
    console.log('[ReactNativeFramework] processedCode length:', processedCodeBeforeInst?.length || 0);
    console.log('[ReactNativeFramework] processedCode first 500 chars:', processedCodeBeforeInst?.substring(0, 500) || 'EMPTY');
    console.log('[ReactNativeFramework] modulesCode length:', modulesCode?.length || 0);
    console.log('[ReactNativeFramework] defaultExportInfo:', defaultExportInfo);
    
    // Собираем карту для превью/редактора на обработанном коде
    let instProcessed;
    if (isJavaScriptFile(filePath)) {
      try {
        instProcessed = instrumentJsxWithAst(processedCodeBeforeInst, filePath, { projectRoot });
      } catch (error) {
        console.warn('[ReactNativeFramework] AST instrumentation failed for processed code, falling back:', error.message);
        instProcessed = instrumentJsx(processedCodeBeforeInst, filePath);
      }
    } else {
      instProcessed = instrumentJsx(processedCodeBeforeInst, filePath);
    }
    const processedCode = instProcessed.code;
    
    // Детектируем компоненты в обработанном коде
    const detectedComponents = detectComponents(processedCode);
    console.log('ReactNativeFramework: Detected components:', detectedComponents);
    
    // Если есть информация о default export, добавляем её с наивысшим приоритетом
    if (defaultExportInfo && !detectedComponents.find(c => c.name === defaultExportInfo.name && c.type === 'default-export')) {
      detectedComponents.unshift({
        name: defaultExportInfo.name,
        type: 'default-export',
        priority: 0
      });
      console.log('ReactNativeFramework: Added defaultExportInfo:', defaultExportInfo);
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
        console.log(`ReactNativeFramework: Skipping JS keyword: ${name}`);
        continue;
      }
      
      // Проверяем, что компонент действительно существует в коде
      // Улучшенная проверка для поддержки export default function ComponentName
      const componentExists = 
        new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode) ||
        new RegExp(`\\b${name}\\s*=`).test(processedCode) ||
        new RegExp(`export\\s+default\\s+function\\s+${name}`).test(processedCode) ||
        new RegExp(`export\\s+default\\s+${name}`).test(processedCode);
      
      console.log(`ReactNativeFramework: Checking component ${name}:`, {
        type: comp.type,
        exists: componentExists,
        priority: comp.priority,
        isAnonymous: comp.isAnonymous,
        isInferred: comp.isInferred
      });
      
      if (componentExists) {
        componentToRender = comp.name;
        componentName = name;
        console.log('ReactNativeFramework: Selected component:', name);
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
        console.log('ReactNativeFramework: Selected component from defaultExportInfo:', name);
      }
    }
    
    // FALLBACK: Если все еще не нашли компонент, ищем любую функцию с заглавной буквы
    // которая возвращает JSX (содержит return <...)
    if (!componentToRender) {
      console.log('ReactNativeFramework: No component found, searching for any renderable function...');
      console.log('ReactNativeFramework: processedCode length:', processedCode.length);
      console.log('ReactNativeFramework: processedCode from 4000 to 4500:', processedCode.substring(4000, 4500));
      
      // Ищем все функции с заглавной буквы
      const functionMatches = [...processedCode.matchAll(/(?:function|const|let|var)\s+([A-Z][a-zA-Z0-9_$]*)\s*[=(]/g)];
      console.log('ReactNativeFramework: Found function matches:', functionMatches.length);
      
      const potentialComponents = [];
      
      for (const match of functionMatches) {
        const funcName = match[1];
        console.log('ReactNativeFramework: Checking function:', funcName, 'at index:', match.index);
        
        // Находим тело функции (примерно 500 символов после объявления)
        const funcIndex = match.index;
        const funcBody = processedCode.substring(funcIndex, funcIndex + 500);
        
        // Проверяем, возвращает ли функция JSX
        const returnsJSX = /return\s*\(?\s*</.test(funcBody) || /return\s+</.test(funcBody);
        
        console.log('ReactNativeFramework: Function', funcName, 'returns JSX:', returnsJSX);
        console.log('ReactNativeFramework: Function body preview:', funcBody.substring(0, 200));
        
        if (returnsJSX) {
          potentialComponents.push(funcName);
          console.log('ReactNativeFramework: Found potential component:', funcName);
        }
      }
      
      console.log('ReactNativeFramework: Total potential components:', potentialComponents.length);
      
      if (potentialComponents.length > 0) {
        componentToRender = potentialComponents[0];
        componentName = potentialComponents[0];
        console.log('ReactNativeFramework: Auto-selected renderable component:', componentToRender);
      }
    }
    
    if (!componentToRender) {
      console.error('ReactNativeFramework: No component found to render', {
        detectedComponents,
        defaultExportInfo,
        processedCodeLength: processedCode.length,
        processedCodePreview: processedCode.substring(0, 500)
      });
      return {
        html: `<html><body><div class="error">
          <h3>Не найден компонент для рендеринга</h3>
          <p>Обнаружено компонентов: ${detectedComponents.length}</p>
          <p>Компоненты: ${detectedComponents.map(c => `${c.name} (${c.type})`).join(', ')}</p>
          <details>
            <summary>Детали отладки</summary>
            <pre>${JSON.stringify({ detectedComponents, defaultExportInfo }, null, 2)}</pre>
          </details>
        </div></body></html>`,
        blockMapForEditor: instProcessed.map,
        blockMapForFile: instOriginal.map,
        dependencyPaths: []
      };
    }
    
    // Генерируем HTML с React Native Web
    console.log('ReactNativeFramework: Generating HTML for', filePath);
    console.log('ReactNativeFramework: Component to render:', componentToRender);
    console.log('ReactNativeFramework: processedCode first 1000 chars:', processedCode.substring(0, 1000));
    console.log('ReactNativeFramework: Looking for export default in code:', /export\s+default/.test(processedCode));
    console.log('ReactNativeFramework: Looking for function App in code:', /function\s+App/.test(processedCode));
    console.log('ReactNativeFramework: modulesCode first 500 chars:', modulesCode.substring(0, 500));
    
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Native Component Preview</title>
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
        
        // Полифилл для require()
        window.require = function(moduleName) {
        console.log('[Require Polyfill] Request for module:', moduleName);
        
        // Маппинг известных модулей на глобальные объекты
        const moduleMap = {
          'react': window.React,
          'react-dom': window.ReactDOM,
          'react-native': window.ReactNativeWeb,
          'react-native-web': window.ReactNativeWeb
        };
        
        if (moduleMap[moduleName]) {
          console.log('[Require Polyfill] Resolved:', moduleName);
          return moduleMap[moduleName];
        }
        
        // Попытка найти в window.__modules__
        if (window.__modules__ && window.__modules__[moduleName]) {
          console.log('[Require Polyfill] Resolved from __modules__:', moduleName);
          return window.__modules__[moduleName];
        }
        
        console.warn('[Require Polyfill] Module not found:', moduleName);
        return {};
      };
      
      // Также создаем exports и module для совместимости
      window.exports = window.exports || {};
      window.module = window.module || { exports: {} };
      
        console.log('[Polyfill] require(), exports, and module initialized');
        
        // ========================================
        // ДЕЛАЕМ REACT ХУКИ ГЛОБАЛЬНО ДОСТУПНЫМИ
        // ========================================
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
            if (React.Children.map) window.ChildrenMap = React.Children.map;
            if (React.Children.forEach) window.ChildrenForEach = React.Children.forEach;
            if (React.Children.count) window.ChildrenCount = React.Children.count;
            if (React.Children.only) window.ChildrenOnly = React.Children.only;
            if (React.Children.toArray) window.ChildrenToArray = React.Children.toArray;
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
        console.log('[React Hooks] All React APIs are now globally available');
        console.log('[Init] React globals initialized successfully');
      }
      
      // Запускаем инициализацию
      initializeReactGlobals();
    </script>
    
    <!-- Создаем простую обертку React Native используя только глобальный React -->
    <script>
      (function() {
        try {
          console.log('[RNW Shim] Creating React Native shim using global React...');
          
          const React = window.React;
          if (!React) {
            throw new Error('React not found');
          }
          
          // Преобразование React Native стилей в CSS
          const flattenStyle = (style) => {
            if (!style) return {};
            if (Array.isArray(style)) {
              return Object.assign({}, ...style.map(flattenStyle));
            }
            return style;
          };
          
          const transformRNStyleToCSS = (rnStyle) => {
            const cssStyle = {};
            for (const [key, value] of Object.entries(rnStyle)) {
              // Преобразуем camelCase в kebab-case для CSS
              const cssKey = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
              
              // Специальная обработка для некоторых свойств
              if (key === 'flex' && typeof value === 'number') {
                cssStyle.flex = value;
              } else if (key === 'flexDirection') {
                cssStyle.flexDirection = value;
              } else if (key === 'alignItems' || key === 'justifyContent' || key === 'alignSelf') {
                cssStyle[key] = value;
              } else if (key === 'fontWeight' && typeof value === 'string') {
                cssStyle.fontWeight = value;
              } else if (typeof value === 'number' && !key.match(/flex|opacity|fontWeight|lineHeight|zIndex/i)) {
                cssStyle[key] = value + 'px';
              } else {
                cssStyle[key] = value;
              }
            }
            return cssStyle;
          };
          
          // View компонент
          const View = React.forwardRef((props, ref) => {
            const { style, children, ...otherProps } = props;
            const flatStyle = flattenStyle(style);
            const cssStyle = transformRNStyleToCSS(flatStyle);
            
            return React.createElement('div', {
              ref,
              style: { display: 'flex', flexDirection: 'column', ...cssStyle },
              ...otherProps
            }, children);
          });
          
          // Text компонент
          const Text = React.forwardRef((props, ref) => {
            const { style, children, ...otherProps } = props;
            const flatStyle = flattenStyle(style);
            const cssStyle = transformRNStyleToCSS(flatStyle);
            
            return React.createElement('span', {
              ref,
              style: cssStyle,
              ...otherProps
            }, children);
          });
          
          // TouchableOpacity компонент
          const TouchableOpacity = React.forwardRef((props, ref) => {
            const { style, children, onPress, ...otherProps } = props;
            const flatStyle = flattenStyle(style);
            const cssStyle = transformRNStyleToCSS(flatStyle);
            
            return React.createElement('div', {
              ref,
              style: { cursor: 'pointer', userSelect: 'none', ...cssStyle },
              onClick: onPress,
              ...otherProps
            }, children);
          });
          
          // ScrollView компонент
          const ScrollView = React.forwardRef((props, ref) => {
            const { style, children, ...otherProps } = props;
            const flatStyle = flattenStyle(style);
            const cssStyle = transformRNStyleToCSS(flatStyle);
            
            return React.createElement('div', {
              ref,
              style: { overflow: 'auto', ...cssStyle },
              ...otherProps
            }, children);
          });
          
          // Image компонент
          const Image = React.forwardRef((props, ref) => {
            const { style, source, ...otherProps } = props;
            const flatStyle = flattenStyle(style);
            const cssStyle = transformRNStyleToCSS(flatStyle);
            const src = source?.uri || source;
            
            return React.createElement('img', {
              ref,
              src,
              style: cssStyle,
              ...otherProps
            });
          });
          
          // StyleSheet API
          const StyleSheet = {
            create: (styles) => styles,
            flatten: flattenStyle,
            absoluteFill: {
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0
            }
          };
          
          // Platform API
          const Platform = {
            OS: 'web',
            select: (obj) => obj.web || obj.default
          };
          
          // Собираем все в ReactNativeWeb объект
          window.ReactNativeWeb = {
            View,
            Text,
            TouchableOpacity,
            ScrollView,
            Image,
            StyleSheet,
            Platform,
            // Алиасы
            Button: TouchableOpacity,
            Pressable: TouchableOpacity,
            TextInput: (props) => React.createElement('input', props),
            SafeAreaView: View,
            FlatList: View
          };
          
          // Делаем компоненты доступными глобально
          window.View = View;
          window.Text = Text;
          window.StyleSheet = StyleSheet;
          window.TouchableOpacity = TouchableOpacity;
          window.ScrollView = ScrollView;
          window.Image = Image;
          window.Button = TouchableOpacity;
          window.TextInput = (props) => React.createElement('input', props);
          window.FlatList = View;
          window.Pressable = TouchableOpacity;
          window.SafeAreaView = View;
          window.Platform = Platform;
          
          console.log('[RNW Shim] React Native shim created successfully');
          console.log('[RNW Shim] Available components:', Object.keys(window.ReactNativeWeb));
          window.__RNW_READY__ = true;
        } catch (error) {
          console.error('[RNW Shim] Failed to create React Native shim:', error);
          window.__RNW_ERROR__ = error;
        }
      })();
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
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        // Ждем загрузки React Native Web
        (async () => {
          // Ждем пока RNW загрузится
          let attempts = 0;
          while (!window.__RNW_READY__ && !window.__RNW_ERROR__ && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
          }
          
          if (window.__RNW_ERROR__) {
            document.getElementById('root').innerHTML = '<div class="error">Failed to load React Native Web: ' + window.__RNW_ERROR__.message + '</div>';
            return;
          }
          
          if (!window.__RNW_READY__) {
            document.getElementById('root').innerHTML = '<div class="error">Timeout loading React Native Web</div>';
            return;
          }
          
          // React, ReactDOM и React Native доступны глобально
          const React = window.React;
          const ReactDOM = window.ReactDOM;
          const ReactNative = window.ReactNativeWeb;
          const { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } = ReactNative;
          
          try {
            // Инициализируем window.__modules__ ДО загрузки модулей
            window.__modules__ = window.__modules__ || {};
            
            console.log('[App] Initializing React Native app');
            console.log('[App] ReactNative available:', !!ReactNative);
            console.log('[App] StyleSheet available:', !!StyleSheet);
            console.log('[App] Component to render:', ${JSON.stringify(componentToRender)});
            console.log('[App] Processed code preview:', \`${processedCode.substring(0, 200).replace(/`/g, '\\`')}\`);
            
            // Загружаем модули зависимостей
            ${modulesCode}
        
            // Обработанный код компонента (оборачиваем в модуль)
            (function() {
              // Используем глобальные версии хуков (уже установлены в initializeReactGlobals)
              const React = window.React;
              
              // Базовые хуки - берем из window (уже установлены глобально)
              const useState = window.useState;
              const useEffect = window.useEffect;
              const useContext = window.useContext;
              const useReducer = window.useReducer;
              const useCallback = window.useCallback;
              const useMemo = window.useMemo;
              const useRef = window.useRef;
              const useImperativeHandle = window.useImperativeHandle;
              const useLayoutEffect = window.useLayoutEffect;
              const useDebugValue = window.useDebugValue;
              
              // React 18+ хуки - берем из window с fallback
              const useId = window.useId || (() => Math.random().toString(36));
              const useTransition = window.useTransition || (() => [false, (fn) => fn()]);
              const useDeferredValue = window.useDeferredValue || ((value) => value);
              const useSyncExternalStore = window.useSyncExternalStore;
              const useInsertionEffect = window.useInsertionEffect || useLayoutEffect;
              
              // React 19+ экспериментальные хуки - берем из window
              const use = window.use;
              const useOptimistic = window.useOptimistic;
              const useFormStatus = window.useFormStatus;
              const useFormState = window.useFormState;
              const useActionState = window.useActionState;
              
              // React API - берем из window
              const createContext = window.createContext;
              const forwardRef = window.forwardRef;
              const memo = window.memo;
              const lazy = window.lazy;
              const Suspense = window.Suspense;
              const Fragment = window.Fragment;
              const Component = window.Component;
              const PureComponent = window.PureComponent;
              const createElement = window.createElement;
              const cloneElement = window.cloneElement;
              const isValidElement = window.isValidElement;
              const Children = window.Children;
              const StrictMode = window.StrictMode;
              const Profiler = window.Profiler;
              const startTransition = window.startTransition;
              
              ${processedCode}
              
              // Регистрируем основной модуль
              const moduleExports = {
                default: typeof ${componentToRender} !== 'undefined' ? ${componentToRender} : null
              };
              
              console.log('Main module loaded:', ${JSON.stringify(filePath)});
              console.log('Component ${componentToRender}:', typeof ${componentToRender});
              console.log('Module exports:', moduleExports);
              
              window.__modules__[${JSON.stringify(filePath)}] = moduleExports;
            })();
            
            // Рендерим компонент
            const mainModule = window.__modules__[${JSON.stringify(filePath)}];
            console.log('Main module from window.__modules__:', mainModule);
            
            const Component = mainModule?.default || mainModule?.[${JSON.stringify(componentToRender)}];
            console.log('Component resolved:', Component);
            
            if (Component) {
                console.log('Rendering component...');
                // Используем createRoot (React 18 API) вместо устаревшего render
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                console.log('Component rendered successfully');
            } else {
                const errorMsg = 'Компонент не найден: ${componentToRender}. Available in module: ' + Object.keys(mainModule || {}).join(', ');
                console.error(errorMsg);
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
            
          } catch (error) {
            console.error('Fatal error in React Native Web initialization:', error);
            console.error('Stack:', error.stack);
            document.getElementById('root').innerHTML = '<div class="error">Критическая ошибка загрузки React Native Web: ' + error.message + '<br><pre>' + error.stack + '</pre></div>';
          }
        })(); // Закрываем async IIFE
    </script>
    
    ${viewMode === 'edit' ? generateBlockEditorScript('react-native', 'edit') : ''}
</body>
</html>`;
    
    return {
      html,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
      dependencyPaths
    };
  }

  /**
   * Строит JSX сниппет для вставки нового блока (React Native)
   * Переопределяет метод из ReactFramework для поддержки React Native компонентов
   */
  buildInsertSnippet({ tag, text, stylePatch }) {
    const styleObj = stylePatch ? toReactStyleObjectText(stylePatch) : '';
    const styleAttr = styleObj ? ` style={{${styleObj}}}` : '';
    const tagName = tag || 'View';
    const body = text || 'Новый блок';
    
    if (tagName === 'Text') {
      return `<Text${styleAttr}>${body || 'Новый текст'}</Text>`;
    }
    
    // TouchableOpacity: вшиваем inline onPress, чтобы не создавать лишних обработчиков в коде
    const isButton = tagName === 'TouchableOpacity';
    const onPressAttr = isButton
      ? ` onPress={() => { try { console.log('Button pressed'); } catch(e) {} }}`
      : '';
    
    // View/TouchableOpacity: вложим Text для читаемости
    return `<${tagName}${styleAttr}${onPressAttr}><Text>${body}</Text></${tagName}>`;
  }
}

