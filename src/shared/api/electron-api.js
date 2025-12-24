/**
 * API для взаимодействия с Electron бэкендом
 * Централизованный слой для всех операций с файловой системой
 * 
 * @deprecated Этот файл устарел. Используйте filesystem-api.js вместо этого.
 * Этот файл теперь просто реэкспортирует функции из filesystem-api.js для обратной совместимости.
 */

// Реэкспортируем все функции из filesystem-api.js
export * from './filesystem-api';

/**
 * @deprecated Используйте isFileSystemAPIAvailable из filesystem-api.js
 */
export function isElectronAPIAvailable() {
  return typeof window !== 'undefined' && 
         'showDirectoryPicker' in window &&
         'showOpenFilePicker' in window;
}
