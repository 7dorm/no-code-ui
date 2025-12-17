const { contextBridge, ipcRenderer } = require('electron');

// Предоставляем безопасный API для рендер-процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // Пример API функции
  getVersion: () => process.versions.electron,
  getNodeVersion: () => process.versions.node,
  getChromeVersion: () => process.versions.chrome,
  
  // Функция для выбора файла
  openFileDialog: (filters) => {
    return ipcRenderer.invoke('dialog:openFile', filters);
  },
  
  // Функция для выбора папки
  openDirectoryDialog: () => {
    return ipcRenderer.invoke('dialog:openDirectory');
  },
  
  // Функция для чтения содержимого директории
  readDirectory: (dirPath) => {
    return ipcRenderer.invoke('fs:readDirectory', dirPath);
  },
  
  // Функция для чтения содержимого файла
  readFile: (filePath) => {
    return ipcRenderer.invoke('fs:readFile', filePath);
  },

  // Функция для записи содержимого файла
  // options: { backup?: boolean }
  writeFile: (filePath, content, options) => {
    return ipcRenderer.invoke('fs:writeFile', filePath, content, options);
  },

  // Создание директории (recursive)
  ensureDir: (dirPath) => {
    return ipcRenderer.invoke('fs:ensureDir', dirPath);
  },
  
  // Функция для чтения файла в base64 (для изображений и бинарных файлов)
  readFileBase64: (filePath) => {
    return ipcRenderer.invoke('fs:readFileBase64', filePath);
  },
  
  // Функция для начала отслеживания изменений файла
  watchFile: (filePath) => {
    return ipcRenderer.invoke('fs:watchFile', filePath);
  },
  
  // Функция для остановки отслеживания файла
  unwatchFile: (filePath) => {
    return ipcRenderer.invoke('fs:unwatchFile', filePath);
  },
  
  // Подписка на события изменения файла (возвращает функцию для отписки)
  onFileChanged: (callback) => {
    const handler = (event, filePath) => {
      callback(filePath);
    };
    ipcRenderer.on('file:changed', handler);
    // Возвращаем функцию для удаления этого конкретного обработчика
    return () => {
      ipcRenderer.removeListener('file:changed', handler);
    };
  },
  
  // Отписка от событий изменения файла (удаляет все обработчики)
  removeFileChangedListener: () => {
    ipcRenderer.removeAllListeners('file:changed');
  },
  
  // Функция для удаления файла
  deleteFile: (filePath) => {
    return ipcRenderer.invoke('fs:deleteFile', filePath);
  },
  
  // Функция для удаления директории (рекурсивно)
  deleteDirectory: (dirPath) => {
    return ipcRenderer.invoke('fs:deleteDirectory', dirPath);
  },
  
  // Функция для переименования файла или директории
  rename: (oldPath, newPath) => {
    return ipcRenderer.invoke('fs:rename', oldPath, newPath);
  }
});
