import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteDirectory: vi.fn(),
  deleteFile: vi.fn(),
  ensureDir: vi.fn(),
  readDirectory: vi.fn(),
  rename: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../../../shared/api/electron-api', () => ({
  readDirectory: mocks.readDirectory,
  rename: mocks.rename,
  deleteFile: mocks.deleteFile,
  deleteDirectory: mocks.deleteDirectory,
  writeFile: mocks.writeFile,
  ensureDir: mocks.ensureDir,
}));

import {
  createFile,
  createProject,
  loadDirectory,
} from './file-operations';

describe('file-operations', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('returns a structured error when loading a directory throws', async () => {
    mocks.readDirectory.mockRejectedValue(new Error('boom'));

    await expect(loadDirectory('/tmp')).resolves.toEqual({
      success: false,
      error: 'boom',
    });
  });

  it('creates files without backups', async () => {
    mocks.writeFile.mockResolvedValue({ success: true });

    await expect(createFile('demo/App.jsx', 'export default null;')).resolves.toEqual({
      success: true,
    });
    expect(mocks.writeFile).toHaveBeenCalledWith('demo/App.jsx', 'export default null;', {
      backup: false,
    });
  });

  it('creates a react project skeleton', async () => {
    mocks.ensureDir.mockResolvedValue({ success: true });
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await createProject('/ignored', 'Demo', 'react');

    expect(result).toEqual({ success: true, projectPath: 'Demo' });
    expect(mocks.ensureDir).toHaveBeenCalledWith('Demo');
    expect(mocks.writeFile).toHaveBeenCalledTimes(2);
    expect(mocks.writeFile).toHaveBeenNthCalledWith(
      1,
      'Demo/App.jsx',
      expect.stringContaining('Добро пожаловать в Demo'),
      { backup: false }
    );
    expect(mocks.writeFile).toHaveBeenNthCalledWith(
      2,
      'Demo/index.html',
      expect.stringContaining('<div id="root"></div>'),
      { backup: false }
    );
  });

  it.each([
    ['react-native', 'App.jsx', 'React Native компонент'],
    ['html', 'App.html', 'HTML страница'],
  ])('creates the %s starter variant', async (projectType, expectedFile, marker) => {
    mocks.ensureDir.mockResolvedValue({ success: true });
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await createProject('/ignored', 'Demo', projectType);

    expect(result).toEqual({ success: true, projectPath: 'Demo' });
    expect(mocks.writeFile).toHaveBeenCalledWith(
      `Demo/${expectedFile}`,
      expect.stringContaining(marker),
      { backup: false }
    );
  });

  it('stops project creation when file generation fails', async () => {
    mocks.ensureDir.mockResolvedValue({ success: true });
    mocks.writeFile.mockResolvedValueOnce({ success: false, error: 'disk full' });

    await expect(createProject('/ignored', 'Demo', 'react')).resolves.toEqual({
      success: false,
      error: 'Ошибка создания App.jsx: disk full',
    });
  });
});
