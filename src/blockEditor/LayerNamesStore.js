import { readFile, writeFile, ensureDir } from '../shared/api/electron-api';

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/');
}

function joinPath(a, b) {
  const aa = normalizePath(a).replace(/\/+$/, '');
  const bb = normalizePath(b).replace(/^\/+/, '');
  return `${aa}/${bb}`;
}

export function getLayerStorePaths(projectRoot) {
  const root = normalizePath(projectRoot);
  const dirPath = joinPath(root, '.mrpak');
  const filePath = joinPath(dirPath, 'layers.json');
  return { dirPath, filePath };
}

export async function loadLayerNames({ projectRoot, targetFilePath }) {
  const { filePath } = getLayerStorePaths(projectRoot);
  const key = normalizePath(targetFilePath);

  try {
    const res = await readFile(filePath);
    if (!res?.success) {
      // если файла нет — это нормально
      return { ok: true, names: {} };
    }

    const json = JSON.parse(res.content || '{}');
    const names = (json && typeof json === 'object' && json[key] && typeof json[key] === 'object')
      ? json[key]
      : {};
    return { ok: true, names };
  } catch (e) {
    return { ok: false, error: e.message, names: {} };
  }
}

export async function upsertLayerName({ projectRoot, targetFilePath, mrpakId, name }) {
  const { dirPath, filePath } = getLayerStorePaths(projectRoot);
  const key = normalizePath(targetFilePath);

  try {
    await ensureDir(dirPath);

    let json = {};
    const readRes = await readFile(filePath);
    if (readRes?.success) {
      try {
        json = JSON.parse(readRes.content || '{}') || {};
      } catch {
        json = {};
      }
    }

    if (!json[key] || typeof json[key] !== 'object') {
      json[key] = {};
    }

    const trimmed = String(name ?? '').trim();
    if (trimmed) {
      json[key][mrpakId] = trimmed;
    } else {
      delete json[key][mrpakId];
    }

    const writeRes = await writeFile(filePath, JSON.stringify(json, null, 2), { backup: true });
    if (!writeRes?.success) return { ok: false, error: writeRes?.error || 'Ошибка записи layers.json' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


