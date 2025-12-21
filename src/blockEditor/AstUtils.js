// Утилиты для работы с AST (адаптировано из backend/src/engine/parsers/utils.ts)

let counter = 0;

/**
 * Генерирует уникальный ID для блока
 * @param {string} filePath - путь к файлу
 * @param {string} type - тип блока (element, component, etc.)
 * @param {string} name - имя блока
 * @returns {string} уникальный ID
 */
export function generateId(filePath, type, name = '') {
  const cleanPath = String(filePath || '').replace(/[\/\\.]/g, '_');
  const cleanName = String(name || '').replace(/[^a-zA-Z0-9]/g, '_') || 'anon';
  return `${cleanPath}__${type}__${cleanName}_${counter++}`;
}

/**
 * Сбрасывает счетчик (для тестирования)
 */
export function resetCounter() {
  counter = 0;
}

/**
 * Определяет расширение файла
 * @param {string} filePath - путь к файлу
 * @returns {string} расширение файла (с точкой)
 */
export function getFileExtension(filePath) {
  const match = String(filePath || '').match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Проверяет, является ли файл TypeScript файлом
 * @param {string} filePath - путь к файлу
 * @returns {boolean}
 */
export function isTypeScriptFile(filePath) {
  const ext = getFileExtension(filePath);
  return ext === 'ts' || ext === 'tsx';
}

/**
 * Проверяет, является ли файл JavaScript/JSX файлом
 * @param {string} filePath - путь к файлу
 * @returns {boolean}
 */
export function isJavaScriptFile(filePath) {
  const ext = getFileExtension(filePath);
  return ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx';
}

