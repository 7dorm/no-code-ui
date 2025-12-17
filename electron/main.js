const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { join } = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Флаг для отслеживания режима разработки
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

let mainWindow;
const fileWatchers = new Map(); // Хранилище для watchers файлов

function createWindow() {
  // Создание окна браузера
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    }
  });

  // Загрузка приложения
  if (isDev) {
    // В режиме разработки подключаемся к Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Открываем DevTools в режиме разработки
    mainWindow.webContents.openDevTools();
  } else {
    // В production режиме загружаем собранное приложение
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Обработчик для открытия диалога выбора файла
ipcMain.handle('dialog:openFile', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [] // Фильтры по умолчанию пустые, но можно передать
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return {
      canceled: false,
      filePath: result.filePaths[0],
      fileName: result.filePaths[0].split(/[/\\]/).pop()
    };
  }

  return { canceled: true };
});

// Обработчик для открытия диалога выбора папки
ipcMain.handle('dialog:openDirectory', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return {
      canceled: false,
      directoryPath: result.filePaths[0]
    };
  }

  return { canceled: true };
});

// Обработчик для чтения содержимого директории
ipcMain.handle('fs:readDirectory', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = [];
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const stats = await fs.stat(fullPath);
      
      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        size: stats.size,
        modified: stats.mtime.getTime()
      });
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
});

// Обработчик для чтения содержимого файла
ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Обработчик для записи содержимого файла (UTF-8)
// options: { backup?: boolean }
ipcMain.handle('fs:writeFile', async (event, filePath, content, options = {}) => {
  try {
    const backup = options && options.backup;
    const contentToWrite = String(content ?? '');

    // Убеждаемся, что директория существует
    const dirPath = require('path').dirname(filePath);
    if (!fsSync.existsSync(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true });
    }

    // Бэкап (если файл уже существует)
    if (backup && fsSync.existsSync(filePath)) {
      const backupPath = filePath + '.mrpak.bak';
      try {
        await fs.copyFile(filePath, backupPath);
      } catch (backupError) {
        console.warn('Failed to create backup:', backupError.message);
        // Продолжаем без бэкапа
      }
    }

    // Пробуем атомарную запись через временный файл
    let useAtomicWrite = true;
    const tmpPath = `${filePath}.mrpak.tmp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    console.log('fs:writeFile: Starting atomic write', {
      filePath,
      tmpPath,
      contentLength: contentToWrite.length,
      dirExists: fsSync.existsSync(dirPath)
    });
    
    try {
      // Проверяем, что директория существует и доступна для записи
      if (!fsSync.existsSync(dirPath)) {
        throw new Error(`Директория не существует: ${dirPath}`);
      }
      
      // Проверяем права на запись в директорию
      try {
        await fs.access(dirPath, fs.constants.W_OK);
      } catch (accessError) {
        throw new Error(`Нет прав на запись в директорию ${dirPath}: ${accessError.message}`);
      }
      
      // Записываем во временный файл (используем синхронную запись для надежности)
      console.log('fs:writeFile: Writing to temp file:', tmpPath);
      try {
        // Используем синхронную запись для временного файла, чтобы убедиться, что он создан
        fsSync.writeFileSync(tmpPath, contentToWrite, 'utf-8');
        console.log('fs:writeFile: Temp file written synchronously');
      } catch (writeError) {
        console.error('fs:writeFile: Error writing temp file:', writeError);
        console.error('fs:writeFile: Write error details:', {
          code: writeError.code,
          errno: writeError.errno,
          path: writeError.path,
          syscall: writeError.syscall
        });
        throw new Error(`Ошибка записи временного файла ${tmpPath}: ${writeError.message}`);
      }
      console.log('fs:writeFile: Temp file written, checking existence...');
      
      // Проверяем, что временный файл создан и имеет правильный размер
      if (!fsSync.existsSync(tmpPath)) {
        console.error('fs:writeFile: Temp file does not exist after write!', tmpPath);
        throw new Error(`Временный файл не был создан: ${tmpPath}`);
      }
      
      console.log('fs:writeFile: Temp file exists, checking size...');
      const tmpStats = await fs.stat(tmpPath);
      const expectedSize = Buffer.byteLength(contentToWrite, 'utf-8');
      console.log('fs:writeFile: Temp file stats', {
        size: tmpStats.size,
        expectedSize,
        match: tmpStats.size === expectedSize
      });
      
      if (tmpStats.size !== expectedSize) {
        throw new Error(`Размер временного файла не совпадает: ожидалось ${expectedSize}, получено ${tmpStats.size}`);
      }
      
      // Переименовываем временный файл в основной
      console.log('fs:writeFile: Renaming temp file to main file...');
      await fs.rename(tmpPath, filePath);
      console.log('fs:writeFile: Rename successful, checking main file...');
      
      // Проверяем, что основной файл создан
      if (!fsSync.existsSync(filePath)) {
        throw new Error(`Основной файл не был создан после переименования: ${filePath}`);
      }
      
      console.log('fs:writeFile: Atomic write completed successfully');
      // Успешно завершено атомарной записью
      return { success: true };
    } catch (atomicError) {
      console.error('fs:writeFile: Atomic write failed:', atomicError);
      console.error('fs:writeFile: Atomic write error details:', {
        message: atomicError.message,
        stack: atomicError.stack,
        tmpPath,
        tmpPathExists: fsSync.existsSync(tmpPath),
        filePath,
        filePathExists: fsSync.existsSync(filePath)
      });
      useAtomicWrite = false;
      
      // Очищаем временный файл, если он остался
      if (fsSync.existsSync(tmpPath)) {
        try {
          console.log('fs:writeFile: Cleaning up temp file:', tmpPath);
          await fs.unlink(tmpPath);
        } catch (unlinkError) {
          console.warn('fs:writeFile: Failed to remove temp file:', unlinkError.message);
        }
      }
    }

    // Fallback: прямая запись в файл (менее безопасно, но работает)
    if (!useAtomicWrite) {
      await fs.writeFile(filePath, contentToWrite, 'utf-8');
      
      // Проверяем, что файл создан
      if (!fsSync.existsSync(filePath)) {
        throw new Error(`Файл не был создан после прямой записи: ${filePath}`);
      }
      
      return { success: true };
    }

    return { success: true };
  } catch (error) {
    console.error('fs:writeFile error:', error);
    console.error('fs:writeFile error details:', {
      filePath,
      contentLength: String(content ?? '').length,
      options,
      errorStack: error.stack
    });
    return { success: false, error: error.message };
  }
});

// Обработчик для создания директории (recursive)
ipcMain.handle('fs:ensureDir', async (event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Обработчик для чтения файла в base64 (для изображений и бинарных файлов)
ipcMain.handle('fs:readFileBase64', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath);
    const base64 = content.toString('base64');
    
    // Определяем MIME тип по расширению
    const ext = filePath.split('.').pop().toLowerCase();
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
    
    return { success: true, base64, mimeType };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Обработчик для начала отслеживания изменений файла
ipcMain.handle('fs:watchFile', async (event, filePath) => {
  try {
    // Останавливаем предыдущий watcher для этого файла, если есть
    if (fileWatchers.has(filePath)) {
      const oldWatcher = fileWatchers.get(filePath);
      oldWatcher.close();
      fileWatchers.delete(filePath);
    }

    // Создаем новый watcher
    const watcher = fsSync.watch(filePath, { persistent: true }, (eventType, filename) => {
      if (eventType === 'change') {
        console.log(`File changed: ${filePath}`);
        // Отправляем уведомление в renderer process
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file:changed', filePath);
        }
      }
    });

    watcher.on('error', (error) => {
      console.error('File watcher error:', error);
      fileWatchers.delete(filePath);
    });

    fileWatchers.set(filePath, watcher);
    return { success: true };
  } catch (error) {
    console.error('Error setting up file watcher:', error);
    return { success: false, error: error.message };
  }
});

// Обработчик для остановки отслеживания файла
ipcMain.handle('fs:unwatchFile', async (event, filePath) => {
  try {
    if (fileWatchers.has(filePath)) {
      const watcher = fileWatchers.get(filePath);
      watcher.close();
      fileWatchers.delete(filePath);
      return { success: true };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Обработчик для удаления файла
ipcMain.handle('fs:deleteFile', async (event, filePath) => {
  try {
    // Проверяем существование файла
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return { success: false, error: 'Путь не является файлом' };
    }
    
    // Останавливаем watcher, если он активен
    if (fileWatchers.has(filePath)) {
      const watcher = fileWatchers.get(filePath);
      watcher.close();
      fileWatchers.delete(filePath);
    }
    
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Обработчик для удаления директории (рекурсивно)
ipcMain.handle('fs:deleteDirectory', async (event, dirPath) => {
  try {
    // Проверяем существование директории
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return { success: false, error: 'Путь не является директорией' };
    }
    
    // Останавливаем все watchers для файлов внутри этой директории
    for (const [watchedPath, watcher] of fileWatchers.entries()) {
      if (watchedPath.startsWith(dirPath)) {
        watcher.close();
        fileWatchers.delete(watchedPath);
      }
    }
    
    // Рекурсивно удаляем директорию
    await fs.rm(dirPath, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Обработчик для переименования файла или директории
ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
  try {
    // Проверяем существование старого пути
    const stats = await fs.stat(oldPath);
    
    // Проверяем, что новый путь не существует
    try {
      await fs.stat(newPath);
      return { success: false, error: 'Файл или папка с таким именем уже существует' };
    } catch (e) {
      // Это нормально - файл не существует, можно переименовывать
    }
    
    // Обновляем watchers
    if (fileWatchers.has(oldPath)) {
      const watcher = fileWatchers.get(oldPath);
      watcher.close();
      fileWatchers.delete(oldPath);
    }
    
    // Обновляем watchers для всех файлов внутри директории, если это директория
    if (stats.isDirectory()) {
      const watchersToUpdate = [];
      for (const [watchedPath, watcher] of fileWatchers.entries()) {
        if (watchedPath.startsWith(oldPath)) {
          watchersToUpdate.push({ oldPath: watchedPath, watcher });
        }
      }
      
      // Переименовываем
      await fs.rename(oldPath, newPath);
      
      // Обновляем пути в watchers
      for (const { oldPath: watchedPath, watcher } of watchersToUpdate) {
        watcher.close();
        fileWatchers.delete(watchedPath);
        const newWatchedPath = watchedPath.replace(oldPath, newPath);
        // Watcher будет пересоздан при следующем открытии файла
      }
    } else {
      // Просто переименовываем файл
      await fs.rename(oldPath, newPath);
    }
    
    return { success: true, newPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Этот метод будет вызван когда Electron завершит
// инициализацию и будет готов к созданию окон браузера
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // На macOS принято пересоздавать окно, когда пользователь
    // кликает на иконку в доке и нет других открытых окон
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Выход когда все окна закрыты, кроме macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
