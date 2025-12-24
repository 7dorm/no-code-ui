/**
 * API для взаимодействия с File System API браузера
 * Централизованный слой для всех операций с файловой системой
 */

// Хранилище для FileSystemDirectoryHandle корневой папки проекта
let rootDirectoryHandle = null;

// Map для кэширования handles файлов и папок по путям
const handlesCache = new Map();

/**
 * Устанавливает корневую директорию проекта
 * @param {FileSystemDirectoryHandle} handle - handle корневой директории
 */
export function setRootDirectory(handle) {
  rootDirectoryHandle = handle;
  handlesCache.clear();
  // Кэшируем корневой handle
  if (handle) {
    handlesCache.set('', handle);
  }
}

/**
 * Получает корневую директорию проекта
 * @returns {FileSystemDirectoryHandle|null}
 */
export function getRootDirectory() {
  return rootDirectoryHandle;
}

/**
 * Проверяет доступность File System API
 */
export function isFileSystemAPIAvailable() {
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Проверяем наличие методов API
  const hasDirectoryPicker = 'showDirectoryPicker' in window;
  const hasFilePicker = 'showOpenFilePicker' in window;
  
  if (!hasDirectoryPicker || !hasFilePicker) {
    console.warn('File System API не поддерживается в этом браузере', {
      hasDirectoryPicker,
      hasFilePicker,
      userAgent: navigator.userAgent
    });
    return false;
  }
  
  // Проверяем secure context (но для localhost это должно быть true даже на http)
  const isSecure = window.isSecureContext;
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '[::1]';
  
  if (!isSecure && !isLocalhost) {
    console.warn('File System API требует secure context (HTTPS или localhost)', {
      isSecure,
      isLocalhost,
      hostname: window.location.hostname,
      protocol: window.location.protocol
    });
    return false;
  }
  
  return true;
}

/**
 * Разрешает путь к handle относительно корневой директории
 * @param {string} filePath - относительный путь к файлу/папке
 * @returns {Promise<{handle: FileSystemHandle, isFile: boolean, error?: string}>}
 */
async function resolvePath(filePath) {
  if (!rootDirectoryHandle) {
    return { error: 'Корневая директория не установлена' };
  }

  // Кэшированный handle
  if (handlesCache.has(filePath)) {
    const handle = handlesCache.get(filePath);
    return { 
      handle, 
      isFile: handle.kind === 'file' 
    };
  }

  try {
    // Нормализуем путь (убираем ведущий /)
    const normalizedPath = filePath.replace(/^\/+/, '');
    
    if (!normalizedPath) {
      return { handle: rootDirectoryHandle, isFile: false };
    }

    // Разбиваем путь на части
    const parts = normalizedPath.split(/[/\\]/).filter(p => p);
    
    let currentHandle = rootDirectoryHandle;
    
    // Проходим по всем частям пути, кроме последней
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      currentHandle = await currentHandle.getDirectoryHandle(part);
      // Кэшируем промежуточные директории
      const intermediatePath = parts.slice(0, i + 1).join('/');
      handlesCache.set(intermediatePath, currentHandle);
    }
    
    const lastPart = parts[parts.length - 1];
    
    // Пытаемся получить как директорию
    try {
      const dirHandle = await currentHandle.getDirectoryHandle(lastPart);
      handlesCache.set(normalizedPath, dirHandle);
      return { handle: dirHandle, isFile: false };
    } catch (e) {
      // Если не директория, пытаемся получить как файл
      try {
        const fileHandle = await currentHandle.getFileHandle(lastPart);
        handlesCache.set(normalizedPath, fileHandle);
        return { handle: fileHandle, isFile: true };
      } catch (fileError) {
        return { error: `Путь не найден: ${filePath}` };
      }
    }
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Получает родительский handle и имя файла/папки
 * @param {string} filePath - относительный путь
 * @returns {Promise<{parentHandle: FileSystemDirectoryHandle, name: string, error?: string}>}
 */
async function getParentHandle(filePath) {
  if (!rootDirectoryHandle) {
    return { error: 'Корневая директория не установлена' };
  }

  const normalizedPath = filePath.replace(/^\/+/, '');
  const parts = normalizedPath.split(/[/\\]/).filter(p => p);
  
  if (parts.length === 0) {
    return { error: 'Невозможно определить родительскую директорию для корня' };
  }

  const name = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1).join('/');

  const parentResult = await resolvePath(parentPath);
  if (parentResult.error || parentResult.isFile) {
    return { error: parentResult.error || 'Родительский путь не является директорией' };
  }

  return { parentHandle: parentResult.handle, name };
}

/**
 * Открытие диалога выбора директории
 * @returns {Promise<{canceled: boolean, directoryHandle?: FileSystemDirectoryHandle, error?: string}>}
 */
export async function openDirectoryDialog() {
  if (!isFileSystemAPIAvailable()) {
    return { canceled: true, error: 'File System API не доступен' };
  }

  try {
    const handle = await window.showDirectoryPicker();
    return { 
      canceled: false, 
      directoryHandle: handle,
      directoryPath: handle.name // Для обратной совместимости
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { canceled: true };
    }
    return { canceled: true, error: error.message };
  }
}

/**
 * Открытие диалога выбора файла
 * @param {Array} filters - фильтры файлов (для обратной совместимости, в File System API не используются)
 * @returns {Promise<{canceled: boolean, fileHandle?: FileSystemFileHandle, error?: string}>}
 */
export async function openFileDialog(filters) {
  if (!isFileSystemAPIAvailable()) {
    return { canceled: true, error: 'File System API не доступен' };
  }

  try {
    const handles = await window.showOpenFilePicker({
      multiple: false
    });
    
    if (handles.length > 0) {
      return { 
        canceled: false, 
        fileHandle: handles[0],
        filePath: handles[0].name // Для обратной совместимости
      };
    }
    
    return { canceled: true };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { canceled: true };
    }
    return { canceled: true, error: error.message };
  }
}

/**
 * Чтение файла
 * @param {string} filePath - относительный путь к файлу
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
export async function readFile(filePath) {
  if (!rootDirectoryHandle) {
    return { success: false, error: 'Корневая директория не установлена' };
  }

  try {
    const result = await resolvePath(filePath);
    if (result.error) {
      return { success: false, error: result.error };
    }

    if (!result.isFile) {
      return { success: false, error: 'Путь не является файлом' };
    }

    const file = await result.handle.getFile();
    const content = await file.text();
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Запись файла
 * @param {string} filePath - относительный путь к файлу
 * @param {string} content - содержимое файла
 * @param {Object} options - опции (backup?: boolean, игнорируется в веб-версии)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function writeFile(filePath, content, options = {}) {
  if (!rootDirectoryHandle) {
    return { success: false, error: 'Корневая директория не установлена' };
  }

  try {
    const parentResult = await getParentHandle(filePath);
    if (parentResult.error) {
      return { success: false, error: parentResult.error };
    }

    const { parentHandle, name } = parentResult;

    // Создаем или получаем файл
    let fileHandle;
    try {
      fileHandle = await parentHandle.getFileHandle(name, { create: true });
    } catch (error) {
      return { success: false, error: `Ошибка создания файла: ${error.message}` };
    }

    // Записываем содержимое
    const writable = await fileHandle.createWritable();
    await writable.write(content || '');
    await writable.close();

    // Обновляем кэш
    handlesCache.set(filePath.replace(/^\/+/, ''), fileHandle);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Чтение директории
 * @param {string} dirPath - относительный путь к директории
 * @returns {Promise<{success: boolean, items?: Array, error?: string}>}
 */
export async function readDirectory(dirPath) {
  if (!rootDirectoryHandle) {
    return { success: false, error: 'Корневая директория не установлена' };
  }

  try {
    const result = await resolvePath(dirPath || '');
    if (result.error) {
      return { success: false, error: result.error };
    }

    if (result.isFile) {
      return { success: false, error: 'Путь не является директорией' };
    }

    const items = [];
    const normalizedPath = (dirPath || '').replace(/^\/+/, '');
    
    for await (const [name, handle] of result.handle.entries()) {
      const isDirectory = handle.kind === 'file' ? false : true;
      const isFile = handle.kind === 'file';
      
      // Формируем полный путь
      const fullPath = normalizedPath ? `${normalizedPath}/${name}` : name;
      
      // Получаем метаданные файла, если это файл
      let size = 0;
      let modified = Date.now();
      
      if (isFile) {
        try {
          const file = await handle.getFile();
          size = file.size;
          modified = file.lastModified;
        } catch (e) {
          // Игнорируем ошибки получения метаданных
        }
      }

      items.push({
        name,
        path: fullPath,
        isDirectory,
        isFile,
        size,
        modified
      });

      // Кэшируем handle
      handlesCache.set(fullPath, handle);
    }

    // Сортируем: сначала директории, потом файлы, по алфавиту
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Чтение файла в base64
 * @param {string} filePath - относительный путь к файлу
 * @returns {Promise<{success: boolean, data?: string, base64?: string, mimeType?: string, error?: string}>}
 */
export async function readFileBase64(filePath) {
  if (!rootDirectoryHandle) {
    return { success: false, error: 'Корневая директория не установлена' };
  }

  try {
    const result = await resolvePath(filePath);
    if (result.error) {
      return { success: false, error: result.error };
    }

    if (!result.isFile) {
      return { success: false, error: 'Путь не является файлом' };
    }

    const file = await result.handle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    // Определяем MIME тип по расширению
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp',
      'ico': 'image/x-icon',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json'
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    return { success: true, base64, data: base64, mimeType };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Создание директории (recursive)
 * @param {string} dirPath - относительный путь к директории
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function ensureDir(dirPath) {
  if (!rootDirectoryHandle) {
    return { success: false, error: 'Корневая директория не установлена' };
  }

  try {
    const normalizedPath = dirPath.replace(/^\/+/, '');
    const parts = normalizedPath.split(/[/\\]/).filter(p => p);
    
    let currentHandle = rootDirectoryHandle;
    
    for (const part of parts) {
      try {
        currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
        // Кэшируем промежуточные директории
        const currentPath = parts.slice(0, parts.indexOf(part) + 1).join('/');
        handlesCache.set(currentPath, currentHandle);
      } catch (error) {
        return { success: false, error: `Ошибка создания директории ${part}: ${error.message}` };
      }
    }

    // Кэшируем финальную директорию
    handlesCache.set(normalizedPath, currentHandle);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Переименование файла/директории
 * @param {string} oldPath - старый относительный путь
 * @param {string} newPath - новый относительный путь
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function rename(oldPath, newPath) {
  if (!rootDirectoryHandle) {
    return { success: false, error: 'Корневая директория не установлена' };
  }

  try {
    // Получаем handle исходного файла/папки
    const oldResult = await resolvePath(oldPath);
    if (oldResult.error) {
      return { success: false, error: oldResult.error };
    }

    // Получаем родительскую директорию для нового пути
    const newParentResult = await getParentHandle(newPath);
    if (newParentResult.error) {
      return { success: false, error: newParentResult.error };
    }

    const { parentHandle: newParentHandle, name: newName } = newParentResult;

    // Проверяем, не существует ли уже файл/папка с новым именем
    try {
      await newParentHandle.getFileHandle(newName);
      return { success: false, error: 'Файл с таким именем уже существует' };
    } catch (e) {
      // Это нормально - файл не существует
    }

    try {
      await newParentHandle.getDirectoryHandle(newName);
      return { success: false, error: 'Папка с таким именем уже существует' };
    } catch (e) {
      // Это нормально - папка не существует
    }

    // Читаем содержимое старого файла/папки
    if (oldResult.isFile) {
      // Для файла: читаем, создаем новый, удаляем старый
      const file = await oldResult.handle.getFile();
      const content = await file.text();

      const newFileHandle = await newParentHandle.getFileHandle(newName, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      // Удаляем старый файл
      const oldParentResult = await getParentHandle(oldPath);
      if (!oldParentResult.error) {
        await oldParentResult.parentHandle.removeEntry(oldParentResult.name);
      }
    } else {
      // Для директории: рекурсивно копируем содержимое и удаляем старую
      // Это сложная операция, упростим: создаем новую директорию
      const newDirHandle = await newParentHandle.getDirectoryHandle(newName, { create: true });
      
      // Копируем содержимое рекурсивно (упрощенная версия)
      async function copyDirectory(sourceHandle, targetHandle) {
        for await (const [name, handle] of sourceHandle.entries()) {
          if (handle.kind === 'file') {
            const file = await handle.getFile();
            const content = await file.text();
            const newFileHandle = await targetHandle.getFileHandle(name, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(content);
            await writable.close();
          } else {
            const newSubDirHandle = await targetHandle.getDirectoryHandle(name, { create: true });
            await copyDirectory(handle, newSubDirHandle);
          }
        }
      }

      await copyDirectory(oldResult.handle, newDirHandle);

      // Удаляем старую директорию
      const oldParentResult = await getParentHandle(oldPath);
      if (!oldParentResult.error) {
        await oldParentResult.parentHandle.removeEntry(oldParentResult.name, { recursive: true });
      }
    }

    // Очищаем кэш
    handlesCache.delete(oldPath.replace(/^\/+/, ''));
    handlesCache.set(newPath.replace(/^\/+/, ''), oldResult.handle);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Удаление файла
 * @param {string} filePath - относительный путь к файлу
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteFile(filePath) {
  if (!rootDirectoryHandle) {
    return { success: false, error: 'Корневая директория не установлена' };
  }

  try {
    const parentResult = await getParentHandle(filePath);
    if (parentResult.error) {
      return { success: false, error: parentResult.error };
    }

    await parentResult.parentHandle.removeEntry(parentResult.name);
    
    // Очищаем кэш
    handlesCache.delete(filePath.replace(/^\/+/, ''));

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Удаление директории
 * @param {string} dirPath - относительный путь к директории
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteDirectory(dirPath) {
  if (!rootDirectoryHandle) {
    return { success: false, error: 'Корневая директория не установлена' };
  }

  try {
    const parentResult = await getParentHandle(dirPath);
    if (parentResult.error) {
      return { success: false, error: parentResult.error };
    }

    await parentResult.parentHandle.removeEntry(parentResult.name, { recursive: true });
    
    // Очищаем кэш для всех путей, начинающихся с этой директории
    const normalizedPath = dirPath.replace(/^\/+/, '');
    for (const cachedPath of handlesCache.keys()) {
      if (cachedPath === normalizedPath || cachedPath.startsWith(normalizedPath + '/')) {
        handlesCache.delete(cachedPath);
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Начало отслеживания изменений файла
 * @param {string} filePath - относительный путь к файлу
 * @returns {Promise<{success: boolean, error?: string}>}
 * 
 * Примечание: File System API не поддерживает отслеживание изменений файлов напрямую.
 * Возвращает успех, но фактическое отслеживание не реализовано.
 */
export async function watchFile(filePath) {
  // File System API не поддерживает watch, поэтому просто возвращаем успех
  return { success: true };
}

/**
 * Остановка отслеживания файла
 * @param {string} filePath - относительный путь к файлу
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function unwatchFile(filePath) {
  // File System API не поддерживает watch
  return { success: true };
}

/**
 * Подписка на события изменения файла
 * @param {Function} callback - функция обратного вызова
 * @returns {Function} функция для отписки
 * 
 * Примечание: File System API не поддерживает события изменения файлов.
 * Возвращает пустую функцию отписки.
 */
export function onFileChanged(callback) {
  // File System API не поддерживает события изменения файлов
  return () => {};
}

/**
 * Получение версии (для обратной совместимости)
 * @returns {string|null}
 */
export function getElectronVersion() {
  return null;
}

/**
 * Получение версии Node.js (для обратной совместимости)
 * @returns {string|null}
 */
export function getNodeVersion() {
  return null;
}

/**
 * Получение версии Chrome (для обратной совместимости)
 * @returns {string|null}
 */
export function getChromeVersion() {
  return typeof navigator !== 'undefined' && navigator.userAgentData?.brands 
    ? navigator.userAgentData.brands.find(b => b.brand.includes('Chrom'))?.version || null
    : null;
}

