import { readFile, readDirectory } from '../../../shared/api/electron-api';

/**
 * Находит корень проекта (директорию с package.json)
 */
export async function findProjectRoot(filePath) {
  if (!filePath) return null;
  
  // Нормализуем путь
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  
  // Поднимаемся от текущего файла вверх, ищем package.json
  for (let i = parts.length - 1; i >= 0; i--) {
    const testPath = parts.slice(0, i + 1).join('/');
    
    try {
      const result = await readFile(testPath + '/package.json');
      if (result.success) {
        return testPath;
      }
    } catch (e) {
      // Продолжаем поиск
    }
  }
  
  // Если не нашли package.json, возвращаем директорию, содержащую src или node_modules
  for (let i = parts.length - 1; i >= 0; i--) {
    const testPath = parts.slice(0, i + 1).join('/');
    
    try {
      const result = await readDirectory(testPath);
      if (result.success) {
        const hasSrc = result.items.some(item => item.name === 'src' && item.isDirectory);
        const hasNodeModules = result.items.some(item => item.name === 'node_modules' && item.isDirectory);
        if (hasSrc || hasNodeModules) {
          return testPath;
        }
      }
    } catch (e) {
      // Продолжаем поиск
    }
  }
  
  // Fallback: возвращаем директорию на один уровень выше от файла
  const lastSlash = normalizedPath.lastIndexOf('/');
  if (lastSlash > 0) {
    const parentDir = normalizedPath.substring(0, lastSlash);
    const parentLastSlash = parentDir.lastIndexOf('/');
    return parentLastSlash > 0 ? parentDir.substring(0, parentLastSlash) : parentDir;
  }
  
  return null;
}

/**
 * Разрешает путь относительно базового пути, включая поддержку @ путей
 */
export async function resolvePath(basePath, relativePath) {
  // Если путь начинается с @, разрешаем его относительно корня проекта
  if (relativePath.startsWith('@/')) {
    const projectRoot = await findProjectRoot(basePath);
    if (projectRoot) {
      // Убираем @/ и добавляем к корню проекта
      const pathWithoutAlias = relativePath.substring(2); // Убираем '@/'
      // Пробуем сначала src/, потом корень
      const tryPaths = [
        projectRoot + '/src/' + pathWithoutAlias,
        projectRoot + '/' + pathWithoutAlias
      ];
      
      // Проверяем, какой путь существует
      for (const tryPath of tryPaths) {
        try {
          // Пробуем с расширениями
          const extensions = ['', '.js', '.jsx', '.ts', '.tsx'];
          for (const ext of extensions) {
            const fullPath = tryPath + ext;
            const result = await readFile(fullPath);
            if (result.success) {
              return fullPath.replace(/\\/g, '/');
            }
          }
          // Пробуем как директорию с index
          const indexPaths = [
            tryPath + '/index.js',
            tryPath + '/index.jsx',
            tryPath + '/index.ts',
            tryPath + '/index.tsx'
          ];
          for (const indexPath of indexPaths) {
            const result = await readFile(indexPath);
            if (result.success) {
              return indexPath.replace(/\\/g, '/');
            }
          }
        } catch (e) {
          // Продолжаем
        }
      }
      
      // Если не нашли, возвращаем путь относительно src
      return (projectRoot + '/src/' + pathWithoutAlias).replace(/\\/g, '/');
    }
    
    // Если не нашли корень проекта, используем базовый путь
    const lastSlash = basePath.lastIndexOf('/');
    const lastBackslash = basePath.lastIndexOf('\\');
    const lastSeparator = Math.max(lastSlash, lastBackslash);
    const dir = lastSeparator >= 0 ? basePath.substring(0, lastSeparator + 1) : '';
    const pathWithoutAlias = relativePath.substring(2);
    // Пробуем src/ относительно текущей директории
    return (dir + 'src/' + pathWithoutAlias).replace(/\\/g, '/');
  }
  
  // Получаем директорию основного файла
  const lastSlash = basePath.lastIndexOf('/');
  const lastBackslash = basePath.lastIndexOf('\\');
  const lastSeparator = Math.max(lastSlash, lastBackslash);
  const dir = lastSeparator >= 0 ? basePath.substring(0, lastSeparator + 1) : '';
  
  // Если путь начинается с /, это абсолютный путь относительно корня проекта
  // В этом случае используем путь как есть (но убираем начальный /)
  if (relativePath.startsWith('/')) {
    return relativePath.substring(1).replace(/\\/g, '/');
  }
  
  // Если путь начинается с ./, убираем точку
  if (relativePath.startsWith('./')) {
    return (dir + relativePath.substring(2)).replace(/\\/g, '/');
  }
  
  // Если путь начинается с ../, обрабатываем родительские директории
  if (relativePath.startsWith('../')) {
    let currentDir = dir;
    let path = relativePath;
    
    while (path.startsWith('../')) {
      // Поднимаемся на уровень вверх
      const parentSlash = currentDir.substring(0, currentDir.length - 1).lastIndexOf('/');
      const parentBackslash = currentDir.substring(0, currentDir.length - 1).lastIndexOf('\\');
      const parentSeparator = Math.max(parentSlash, parentBackslash);
      if (parentSeparator >= 0) {
        currentDir = currentDir.substring(0, parentSeparator + 1);
      } else {
        // Не можем подняться выше корня
        break;
      }
      path = path.substring(3);
    }
    
    return (currentDir + path).replace(/\\/g, '/');
  }
  
  // Относительный путь без префикса
  return (dir + relativePath).replace(/\\/g, '/');
}

/**
 * Синхронная версия resolvePath для относительных путей (без @)
 */
export function resolvePathSync(basePath, relativePath) {
  // Если путь начинается с @, не можем разрешить синхронно - возвращаем как есть
  if (relativePath.startsWith('@/')) {
    return relativePath;
  }
  
  // Получаем директорию основного файла
  const lastSlash = basePath.lastIndexOf('/');
  const lastBackslash = basePath.lastIndexOf('\\');
  const lastSeparator = Math.max(lastSlash, lastBackslash);
  const dir = lastSeparator >= 0 ? basePath.substring(0, lastSeparator + 1) : '';
  
  // Если путь начинается с /, это абсолютный путь относительно корня проекта
  if (relativePath.startsWith('/')) {
    return relativePath.substring(1).replace(/\\/g, '/');
  }
  
  // Если путь начинается с ./, убираем точку
  if (relativePath.startsWith('./')) {
    return (dir + relativePath.substring(2)).replace(/\\/g, '/');
  }
  
  // Если путь начинается с ../, обрабатываем родительские директории
  if (relativePath.startsWith('../')) {
    let currentDir = dir;
    let path = relativePath;
    
    while (path.startsWith('../')) {
      // Поднимаемся на уровень вверх
      const parentSlash = currentDir.substring(0, currentDir.length - 1).lastIndexOf('/');
      const parentBackslash = currentDir.substring(0, currentDir.length - 1).lastIndexOf('\\');
      const parentSeparator = Math.max(parentSlash, parentBackslash);
      if (parentSeparator >= 0) {
        currentDir = currentDir.substring(0, parentSeparator + 1);
      } else {
        // Не можем подняться выше корня
        break;
      }
      path = path.substring(3);
    }
    
    return (currentDir + path).replace(/\\/g, '/');
  }
  
  // Относительный путь без префикса
  return (dir + relativePath).replace(/\\/g, '/');
}

