import { readFile, readDirectory } from '../../../shared/api/electron-api';

function isBareModuleImport(relativePath) {
  const value = String(relativePath || '').trim();
  if (!value) return false;
  if (value.startsWith('./') || value.startsWith('../') || value.startsWith('@/')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/')) return false;
  if (/^[A-Za-z]:[\\/]/.test(value)) return false;
  return true;
}

function splitBareModulePath(relativePath) {
  const value = String(relativePath || '').trim().replace(/\\/g, '/');
  if (!value) return { packageName: '', subPath: '' };
  if (value.startsWith('@')) {
    const parts = value.split('/');
    return {
      packageName: parts.slice(0, 2).join('/'),
      subPath: parts.slice(2).join('/'),
    };
  }
  const parts = value.split('/');
  return {
    packageName: parts[0] || '',
    subPath: parts.slice(1).join('/'),
  };
}

async function tryResolveExistingFile(basePathWithoutExt) {
  const normalizedBase = String(basePathWithoutExt || '').replace(/\\/g, '/');
  const candidates = [
    normalizedBase,
    `${normalizedBase}.js`,
    `${normalizedBase}.jsx`,
    `${normalizedBase}.ts`,
    `${normalizedBase}.tsx`,
    `${normalizedBase}.mjs`,
    `${normalizedBase}/index.js`,
    `${normalizedBase}/index.jsx`,
    `${normalizedBase}/index.ts`,
    `${normalizedBase}/index.tsx`,
    `${normalizedBase}/index.mjs`,
  ];

  for (const candidate of candidates) {
    try {
      const result = await readFile(candidate);
      if (result?.success) return candidate.replace(/\\/g, '/');
    } catch (e) {}
  }

  return null;
}

function pickPackageEntryFromExports(exportsField, subPath) {
  const exportKey = subPath ? `./${subPath}` : '.';
  const entry = exportsField && typeof exportsField === 'object' ? exportsField[exportKey] : null;
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object') return entry.import || entry.default || entry.require || null;
  return null;
}

function getCandidateDirectories(filePath) {
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  const looksLikeFile = /\.[^./\\]+$/.test(parts[parts.length - 1] || '');
  const candidateDirs = [];

  for (let i = parts.length; i >= 0; i--) {
    if (looksLikeFile && i === parts.length) continue;
    candidateDirs.push(parts.slice(0, i).join('/'));
  }

  return { normalizedPath, candidateDirs };
}

function joinPathSegments(...segments) {
  return segments
    .filter((segment) => segment !== null && segment !== undefined && String(segment) !== '')
    .map((segment) => String(segment).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

async function findNearestNodeModulesRoot(filePath) {
  const { candidateDirs } = getCandidateDirectories(filePath);

  for (const testPath of candidateDirs) {
    try {
      const result = await readDirectory(testPath || '.');
      if (!result?.success || !result.items) continue;
      const hasNodeModules = result.items.some((item) => item.name === 'node_modules' && item.isDirectory);
      if (hasNodeModules) {
        return testPath;
      }
    } catch (e) {}
  }

  return null;
}

async function resolveNodeModuleImport(basePath, relativePath) {
  const { packageName, subPath } = splitBareModulePath(relativePath);
  if (!packageName) return null;

  const { candidateDirs } = getCandidateDirectories(basePath);
  const searchRoots = candidateDirs.slice();

  const nearestNodeModulesRoot = await findNearestNodeModulesRoot(basePath);
  if (nearestNodeModulesRoot !== null && nearestNodeModulesRoot !== undefined && !searchRoots.includes(nearestNodeModulesRoot)) {
    searchRoots.unshift(nearestNodeModulesRoot);
  }

  const projectRoot = await findProjectRoot(basePath);
  if (projectRoot !== null && projectRoot !== undefined && !searchRoots.includes(projectRoot)) {
    searchRoots.push(projectRoot);
  }

  for (const rootPath of searchRoots) {
    const packageDir = joinPathSegments(rootPath, 'node_modules', packageName);
    const packageJsonPath = `${packageDir}/package.json`;
    let packageJson = null;

    try {
      const packageRead = await readFile(packageJsonPath);
      if (packageRead?.success) {
        packageJson = JSON.parse(String(packageRead.content || '{}'));
      }
    } catch (e) {}

    if (subPath) {
      if (packageJson?.exports) {
        const exportEntry = pickPackageEntryFromExports(packageJson.exports, subPath);
        if (exportEntry) {
          const resolvedExportPath = await tryResolveExistingFile(`${packageDir}/${String(exportEntry).replace(/^\.\//, '')}`);
          if (resolvedExportPath) return resolvedExportPath;
        }
      }

      const resolvedSubPath = await tryResolveExistingFile(`${packageDir}/${subPath}`);
      if (resolvedSubPath) return resolvedSubPath;
    }

    if (packageJson) {
      const packageEntry =
        pickPackageEntryFromExports(packageJson.exports, '') ||
        packageJson.module ||
        packageJson.main ||
        'index.js';
      const resolvedEntry = await tryResolveExistingFile(`${packageDir}/${String(packageEntry).replace(/^\.\//, '')}`);
      if (resolvedEntry) return resolvedEntry;
    }

    const resolvedPackageDir = await tryResolveExistingFile(packageDir);
    if (resolvedPackageDir) return resolvedPackageDir;
  }

  return null;
}

/**
 * РќР°С…РѕРґРёС‚ РєРѕСЂРµРЅСЊ РїСЂРѕРµРєС‚Р° (РґРёСЂРµРєС‚РѕСЂРёСЋ СЃ package.json)
 */
export async function findProjectRoot(filePath: string) {
  if (!filePath) return null;

  const { normalizedPath, candidateDirs } = getCandidateDirectories(filePath);

  for (const testPath of candidateDirs) {
    const packageJsonPath = testPath ? testPath + '/package.json' : 'package.json';

    try {
      const result = await readFile(packageJsonPath);
      if (result.success) {
        return testPath;
      }
    } catch (e) {}
  }

  for (const testPath of candidateDirs) {
    try {
      const result = await readDirectory(testPath || '.');
      if (result.success) {
        if (!result.items) return null;
        const hasSrc = result.items.some(item => item.name === 'src' && item.isDirectory);
        const hasNodeModules = result.items.some(item => item.name === 'node_modules' && item.isDirectory);
        if (hasSrc || hasNodeModules) {
          return testPath;
        }
      }
    } catch (e) {}
  }

  const lastSlash = normalizedPath.lastIndexOf('/');
  if (lastSlash > 0) {
    const parentDir = normalizedPath.substring(0, lastSlash);
    const parentLastSlash = parentDir.lastIndexOf('/');
    return parentLastSlash > 0 ? parentDir.substring(0, parentLastSlash) : parentDir;
  }

  return null;
}

/**
 * Р Р°Р·СЂРµС€Р°РµС‚ РїСѓС‚СЊ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ Р±Р°Р·РѕРІРѕРіРѕ РїСѓС‚Рё, РІРєР»СЋС‡Р°СЏ РїРѕРґРґРµСЂР¶РєСѓ @ РїСѓС‚РµР№
 */
export async function resolvePath(basePath: string, relativePath: string) {
  if (isBareModuleImport(relativePath)) {
    return String(relativePath || '').replace(/\\/g, '/');
  }
  // Р•СЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ @, СЂР°Р·СЂРµС€Р°РµРј РµРіРѕ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РєРѕСЂРЅСЏ РїСЂРѕРµРєС‚Р°
  if (relativePath.startsWith('@/')) {
    const projectRoot = await findProjectRoot(basePath);
    if (projectRoot) {
      // РЈР±РёСЂР°РµРј @/ Рё РґРѕР±Р°РІР»СЏРµРј Рє РєРѕСЂРЅСЋ РїСЂРѕРµРєС‚Р°
      const pathWithoutAlias = relativePath.substring(2); // РЈР±РёСЂР°РµРј '@/'
      // РџСЂРѕР±СѓРµРј СЃРЅР°С‡Р°Р»Р° src/, РїРѕС‚РѕРј РєРѕСЂРµРЅСЊ
      const tryPaths = [
        projectRoot + '/src/' + pathWithoutAlias,
        projectRoot + '/' + pathWithoutAlias
      ];
      
      // РџСЂРѕРІРµСЂСЏРµРј, РєР°РєРѕР№ РїСѓС‚СЊ СЃСѓС‰РµСЃС‚РІСѓРµС‚
      for (const tryPath of tryPaths) {
        try {
          // РџСЂРѕР±СѓРµРј СЃ СЂР°СЃС€РёСЂРµРЅРёСЏРјРё
          const extensions = ['', '.js', '.jsx', '.ts', '.tsx'];
          for (const ext of extensions) {
            const fullPath = tryPath + ext;
            const result = await readFile(fullPath);
            if (result.success) {
              return fullPath.replace(/\\/g, '/');
            }
          }
          // РџСЂРѕР±СѓРµРј РєР°Рє РґРёСЂРµРєС‚РѕСЂРёСЋ СЃ index
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
          // РџСЂРѕРґРѕР»Р¶Р°РµРј
        }
      }
      
      // Р•СЃР»Рё РЅРµ РЅР°С€Р»Рё, РІРѕР·РІСЂР°С‰Р°РµРј РїСѓС‚СЊ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ src
      return (projectRoot + '/src/' + pathWithoutAlias).replace(/\\/g, '/');
    }
    
    // Р•СЃР»Рё РЅРµ РЅР°С€Р»Рё РєРѕСЂРµРЅСЊ РїСЂРѕРµРєС‚Р°, РёСЃРїРѕР»СЊР·СѓРµРј Р±Р°Р·РѕРІС‹Р№ РїСѓС‚СЊ
    const lastSlash = basePath.lastIndexOf('/');
    const lastBackslash = basePath.lastIndexOf('\\');
    const lastSeparator = Math.max(lastSlash, lastBackslash);
    const dir = lastSeparator >= 0 ? basePath.substring(0, lastSeparator + 1) : '';
    const pathWithoutAlias = relativePath.substring(2);
    // РџСЂРѕР±СѓРµРј src/ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ С‚РµРєСѓС‰РµР№ РґРёСЂРµРєС‚РѕСЂРёРё
    return (dir + 'src/' + pathWithoutAlias).replace(/\\/g, '/');
  }
  
  // РџРѕР»СѓС‡Р°РµРј РґРёСЂРµРєС‚РѕСЂРёСЋ РѕСЃРЅРѕРІРЅРѕРіРѕ С„Р°Р№Р»Р°
  const lastSlash = basePath.lastIndexOf('/');
  const lastBackslash = basePath.lastIndexOf('\\');
  const lastSeparator = Math.max(lastSlash, lastBackslash);
  const dir = lastSeparator >= 0 ? basePath.substring(0, lastSeparator + 1) : '';
  
  // Р•СЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ /, СЌС‚Рѕ Р°Р±СЃРѕР»СЋС‚РЅС‹Р№ РїСѓС‚СЊ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РєРѕСЂРЅСЏ РїСЂРѕРµРєС‚Р°
  // Р’ СЌС‚РѕРј СЃР»СѓС‡Р°Рµ РёСЃРїРѕР»СЊР·СѓРµРј РїСѓС‚СЊ РєР°Рє РµСЃС‚СЊ (РЅРѕ СѓР±РёСЂР°РµРј РЅР°С‡Р°Р»СЊРЅС‹Р№ /)
  if (relativePath.startsWith('/')) {
    return relativePath.substring(1).replace(/\\/g, '/');
  }
  
  // Р•СЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ ./, СѓР±РёСЂР°РµРј С‚РѕС‡РєСѓ
  if (relativePath.startsWith('./')) {
    return (dir + relativePath.substring(2)).replace(/\\/g, '/');
  }
  
  // Р•СЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ ../, РѕР±СЂР°Р±Р°С‚С‹РІР°РµРј СЂРѕРґРёС‚РµР»СЊСЃРєРёРµ РґРёСЂРµРєС‚РѕСЂРёРё
  if (relativePath.startsWith('../')) {
    let currentDir = dir;
    let path = relativePath;
    
    while (path.startsWith('../')) {
      // РџРѕРґРЅРёРјР°РµРјСЃСЏ РЅР° СѓСЂРѕРІРµРЅСЊ РІРІРµСЂС…
      const parentSlash = currentDir.substring(0, currentDir.length - 1).lastIndexOf('/');
      const parentBackslash = currentDir.substring(0, currentDir.length - 1).lastIndexOf('\\');
      const parentSeparator = Math.max(parentSlash, parentBackslash);
      if (parentSeparator >= 0) {
        currentDir = currentDir.substring(0, parentSeparator + 1);
      } else {
        // РќРµ РјРѕР¶РµРј РїРѕРґРЅСЏС‚СЊСЃСЏ РІС‹С€Рµ РєРѕСЂРЅСЏ
        break;
      }
      path = path.substring(3);
    }
    
    return (currentDir + path).replace(/\\/g, '/');
  }
  
  // РћС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Р№ РїСѓС‚СЊ Р±РµР· РїСЂРµС„РёРєСЃР°
  return (dir + relativePath).replace(/\\/g, '/');
}

/**
 * РЎРёРЅС…СЂРѕРЅРЅР°СЏ РІРµСЂСЃРёСЏ resolvePath РґР»СЏ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹С… РїСѓС‚РµР№ (Р±РµР· @)
 */
export function resolvePathSync(basePath: string, relativePath: string) {
  if (isBareModuleImport(relativePath)) {
    return String(relativePath || '').replace(/\\/g, '/');
  }
  // Р•СЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ @, РЅРµ РјРѕР¶РµРј СЂР°Р·СЂРµС€РёС‚СЊ СЃРёРЅС…СЂРѕРЅРЅРѕ - РІРѕР·РІСЂР°С‰Р°РµРј РєР°Рє РµСЃС‚СЊ
  if (relativePath.startsWith('@/')) {
    return relativePath;
  }
  
  // РџРѕР»СѓС‡Р°РµРј РґРёСЂРµРєС‚РѕСЂРёСЋ РѕСЃРЅРѕРІРЅРѕРіРѕ С„Р°Р№Р»Р°
  const lastSlash = basePath.lastIndexOf('/');
  const lastBackslash = basePath.lastIndexOf('\\');
  const lastSeparator = Math.max(lastSlash, lastBackslash);
  const dir = lastSeparator >= 0 ? basePath.substring(0, lastSeparator + 1) : '';
  
  // Р•СЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ /, СЌС‚Рѕ Р°Р±СЃРѕР»СЋС‚РЅС‹Р№ РїСѓС‚СЊ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РєРѕСЂРЅСЏ РїСЂРѕРµРєС‚Р°
  if (relativePath.startsWith('/')) {
    return relativePath.substring(1).replace(/\\/g, '/');
  }
  
  // Р•СЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ ./, СѓР±РёСЂР°РµРј С‚РѕС‡РєСѓ
  if (relativePath.startsWith('./')) {
    return (dir + relativePath.substring(2)).replace(/\\/g, '/');
  }
  
  // Р•СЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ ../, РѕР±СЂР°Р±Р°С‚С‹РІР°РµРј СЂРѕРґРёС‚РµР»СЊСЃРєРёРµ РґРёСЂРµРєС‚РѕСЂРёРё
  if (relativePath.startsWith('../')) {
    let currentDir = dir;
    let path = relativePath;
    
    while (path.startsWith('../')) {
      // РџРѕРґРЅРёРјР°РµРјСЃСЏ РЅР° СѓСЂРѕРІРµРЅСЊ РІРІРµСЂС…
      const parentSlash = currentDir.substring(0, currentDir.length - 1).lastIndexOf('/');
      const parentBackslash = currentDir.substring(0, currentDir.length - 1).lastIndexOf('\\');
      const parentSeparator = Math.max(parentSlash, parentBackslash);
      if (parentSeparator >= 0) {
        currentDir = currentDir.substring(0, parentSeparator + 1);
      } else {
        // РќРµ РјРѕР¶РµРј РїРѕРґРЅСЏС‚СЊСЃСЏ РІС‹С€Рµ РєРѕСЂРЅСЏ
        break;
      }
      path = path.substring(3);
    }
    
    return (currentDir + path).replace(/\\/g, '/');
  }
  
  // РћС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Р№ РїСѓС‚СЊ Р±РµР· РїСЂРµС„РёРєСЃР°
  return (dir + relativePath).replace(/\\/g, '/');
}
