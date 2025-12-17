import { readDirectory, rename, deleteFile, deleteDirectory, writeFile } from '../../../shared/api/electron-api';

/**
 * Загрузка содержимого директории
 * @param {string} dirPath - путь к директории
 * @returns {Promise<{success: boolean, items?: Array, error?: string}>}
 */
export async function loadDirectory(dirPath) {
  try {
    const result = await readDirectory(dirPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Переименование файла или директории
 * @param {string} oldPath - старый путь
 * @param {string} newPath - новый путь
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function renameItem(oldPath, newPath) {
  try {
    const result = await rename(oldPath, newPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Удаление файла
 * @param {string} filePath - путь к файлу
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteItem(filePath) {
  try {
    const result = await deleteFile(filePath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Удаление директории
 * @param {string} dirPath - путь к директории
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteDir(dirPath) {
  try {
    const result = await deleteDirectory(dirPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Создание нового файла
 * @param {string} filePath - путь к файлу
 * @param {string} content - содержимое файла
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createFile(filePath, content) {
  try {
    const result = await writeFile(filePath, content, { backup: false });
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

