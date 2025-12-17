/**
 * Парсит импорты стилей из JSX/JS кода
 * Поддерживает:
 * - import { commonStyles } from '../styles/commonStyles';
 * - import commonStyles from '../styles/commonStyles';
 * - import * as styles from '../styles/commonStyles';
 * 
 * @param {string} code - исходный код файла
 * @returns {Object} маппинг переменных стилей на пути к файлам
 *   { commonStyles: { path: '../styles/commonStyles', type: 'named'|'default'|'namespace' } }
 */
export function parseStyleImports(code) {
  const source = String(code ?? '');
  const imports = {};
  
  // Регулярное выражение для поиска импортов
  // Поддерживает различные форматы:
  // import { a, b } from 'path'
  // import a from 'path'
  // import * as a from 'path'
  const importRegex = /import\s+(?:(?:\{([^}]+)\}|([A-Za-z_$][A-Za-z0-9_$]*)|(?:\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)))\s+from\s+)?['"]([^'"]+)['"];?/g;
  
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const namedImports = match[1]; // { a, b }
    const defaultImport = match[2]; // default import
    const namespaceImport = match[3]; // * as name
    const importPath = match[4]; // путь к файлу
    
    // Пропускаем внешние библиотеки (react, react-native и т.д.)
    if (importPath.startsWith('react') || 
        importPath.startsWith('react-native') ||
        importPath.startsWith('http://') ||
        importPath.startsWith('https://')) {
      continue;
    }
    
    // Проверяем, что это файл стилей (содержит 'style' в пути или расширение .js/.jsx)
    const isStyleFile = /style/i.test(importPath) || 
                       /\.(js|jsx|ts|tsx)$/.test(importPath);
    
    if (!isStyleFile) {
      // Пропускаем явно не стилевые файлы, но оставляем возможность для других
      // Можно добавить более строгую проверку, если нужно
      continue;
    }
    
    // Обрабатываем именованные импорты: import { commonStyles, colors } from '...'
    if (namedImports) {
      const names = namedImports
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 0);
      
      for (const name of names) {
        // Убираем 'as alias' если есть
        const actualName = name.split(/\s+as\s+/)[0].trim();
        imports[actualName] = {
          path: importPath,
          type: 'named',
        };
      }
    }
    
    // Обрабатываем default импорт: import commonStyles from '...'
    if (defaultImport) {
      imports[defaultImport] = {
        path: importPath,
        type: 'default',
      };
    }
    
    // Обрабатываем namespace импорт: import * as styles from '...'
    if (namespaceImport) {
      imports[namespaceImport] = {
        path: importPath,
        type: 'namespace',
      };
    }
  }
  
  return imports;
}

/**
 * Извлекает информацию о стиле из атрибута style в JSX
 * @param {string} openTagText - текст открывающего тега
 * @returns {Object|null} { stylesVar: 'commonStyles', styleKey: 'spacing' } или null
 */
export function extractStyleReference(openTagText) {
  // Ищем style={stylesVar.styleKey} или style={[stylesVar.styleKey, ...]}
  // Поддерживаем простые ссылки и массивы
  
  // Простая ссылка: style={commonStyles.spacing}
  const simpleRef = openTagText.match(/\bstyle\s*=\s*\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}/);
  if (simpleRef) {
    return {
      stylesVar: simpleRef[1],
      styleKey: simpleRef[2],
      isArray: false,
    };
  }
  
  // Массив: style={[commonStyles.spacing, ...]}
  // Находим начало массива
  const arrayMatch = openTagText.match(/\bstyle\s*=\s*\{\s*\[/);
  if (arrayMatch) {
    const arrayStart = arrayMatch.index + arrayMatch[0].length;
    // Ищем первую ссылку на стиль в массиве
    const arrayContent = openTagText.slice(arrayStart);
    const firstRef = arrayContent.match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (firstRef) {
      return {
        stylesVar: firstRef[1],
        styleKey: firstRef[2],
        isArray: true,
      };
    }
  }
  
  return null;
}

