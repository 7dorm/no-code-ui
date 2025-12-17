/**
 * API для взаимодействия с Electron бэкендом
 * Централизованный слой для всех операций с файловой системой
 */

/**
 * Проверяет доступность Electron API
 */
export function isElectronAPIAvailable() {
  return typeof window !== 'undefined' && window.electronAPI;
}

/**
 * Чтение файла
 * @param {string} filePath - путь к файлу
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
export async function readFile(filePath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.readFile) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.readFile(filePath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Запись файла
 * @param {string} filePath - путь к файлу
 * @param {string} content - содержимое файла
 * @param {Object} options - опции (backup?: boolean)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function writeFile(filePath, content, options = {}) {
  if (!isElectronAPIAvailable() || !window.electronAPI.writeFile) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.writeFile(filePath, content, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Чтение директории
 * @param {string} dirPath - путь к директории
 * @returns {Promise<{success: boolean, items?: Array, error?: string}>}
 */
export async function readDirectory(dirPath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.readDirectory) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.readDirectory(dirPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Чтение файла в base64
 * @param {string} filePath - путь к файлу
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function readFileBase64(filePath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.readFileBase64) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.readFileBase64(filePath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Создание директории (recursive)
 * @param {string} dirPath - путь к директории
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function ensureDir(dirPath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.ensureDir) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.ensureDir(dirPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Переименование файла/директории
 * @param {string} oldPath - старый путь
 * @param {string} newPath - новый путь
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function rename(oldPath, newPath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.rename) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.rename(oldPath, newPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Удаление файла
 * @param {string} filePath - путь к файлу
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteFile(filePath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.deleteFile) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.deleteFile(filePath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Удаление директории
 * @param {string} dirPath - путь к директории
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteDirectory(dirPath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.deleteDirectory) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.deleteDirectory(dirPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Открытие диалога выбора файла
 * @param {Array} filters - фильтры файлов
 * @returns {Promise<{canceled: boolean, filePath?: string}>}
 */
export async function openFileDialog(filters) {
  if (!isElectronAPIAvailable() || !window.electronAPI.openFileDialog) {
    return { canceled: true, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.openFileDialog(filters);
  } catch (error) {
    return { canceled: true, error: error.message };
  }
}

/**
 * Открытие диалога выбора директории
 * @returns {Promise<{canceled: boolean, directoryPath?: string}>}
 */
export async function openDirectoryDialog() {
  if (!isElectronAPIAvailable() || !window.electronAPI.openDirectoryDialog) {
    return { canceled: true, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.openDirectoryDialog();
  } catch (error) {
    return { canceled: true, error: error.message };
  }
}

/**
 * Начало отслеживания изменений файла
 * @param {string} filePath - путь к файлу
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function watchFile(filePath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.watchFile) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.watchFile(filePath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Остановка отслеживания файла
 * @param {string} filePath - путь к файлу
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function unwatchFile(filePath) {
  if (!isElectronAPIAvailable() || !window.electronAPI.unwatchFile) {
    return { success: false, error: 'Electron API не доступен' };
  }
  try {
    return await window.electronAPI.unwatchFile(filePath);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Подписка на события изменения файла
 * @param {Function} callback - функция обратного вызова
 * @returns {Function} функция для отписки
 */
export function onFileChanged(callback) {
  if (!isElectronAPIAvailable() || !window.electronAPI.onFileChanged) {
    return () => {};
  }
  try {
    return window.electronAPI.onFileChanged(callback);
  } catch (error) {
    console.error('Error subscribing to file changes:', error);
    return () => {};
  }
}

/**
 * Получение версии Electron
 * @returns {string|null}
 */
export function getElectronVersion() {
  if (!isElectronAPIAvailable() || !window.electronAPI.getVersion) {
    return null;
  }
  return window.electronAPI.getVersion();
}

/**
 * Получение версии Node.js
 * @returns {string|null}
 */
export function getNodeVersion() {
  if (!isElectronAPIAvailable() || !window.electronAPI.getNodeVersion) {
    return null;
  }
  return window.electronAPI.getNodeVersion();
}

/**
 * Получение версии Chrome
 * @returns {string|null}
 */
export function getChromeVersion() {
  if (!isElectronAPIAvailable() || !window.electronAPI.getChromeVersion) {
    return null;
  }
  return window.electronAPI.getChromeVersion();
}

