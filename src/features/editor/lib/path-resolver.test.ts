import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  readDirectory: vi.fn(),
}));

vi.mock('../../../shared/api/electron-api', () => ({
  readFile: mocks.readFile,
  readDirectory: mocks.readDirectory,
}));

import { findProjectRoot, resolvePath, resolvePathSync } from './path-resolver';

describe('path-resolver', () => {
  beforeEach(() => {
    mocks.readFile.mockReset();
    mocks.readDirectory.mockReset();
  });

  it('finds the nearest project root from package.json', async () => {
    mocks.readFile.mockImplementation(async (filePath: string) => ({
      success: filePath === 'workspace/project/package.json',
      content: '{}',
    }));

    await expect(findProjectRoot('workspace/project/src/components/App.tsx')).resolves.toBe(
      'workspace/project'
    );
  });

  it('falls back to directories that look like project roots', async () => {
    mocks.readFile.mockResolvedValue({ success: false });
    mocks.readDirectory.mockImplementation(async (dirPath: string) => ({
      success: true,
      items:
        dirPath === 'workspace/project'
          ? [{ name: 'src', isDirectory: true }]
          : [],
    }));

    await expect(findProjectRoot('workspace/project/src/App.tsx')).resolves.toBe('workspace/project');
  });

  it('resolves aliased imports inside the src directory', async () => {
    mocks.readFile.mockImplementation(async (filePath: string) => ({
      success:
        filePath === 'workspace/project/package.json' ||
        filePath === 'workspace/project/src/components/Button.tsx',
      content: '{}',
    }));

    await expect(
      resolvePath('workspace/project/src/App.tsx', '@/components/Button')
    ).resolves.toBe('workspace/project/src/components/Button.tsx');
  });

  it('keeps bare package imports untouched and resolves relative paths', async () => {
    await expect(resolvePath('workspace/project/src/App.tsx', 'react-icons/fa')).resolves.toBe(
      'react-icons/fa'
    );
    await expect(resolvePath('workspace/project/src/pages/App.tsx', '../utils/helpers')).resolves.toBe(
      'workspace/project/src/utils/helpers'
    );
  });

  it('provides synchronous relative resolution', () => {
    expect(resolvePathSync('/workspace/project/src/pages/App.tsx', '../utils/helpers')).toBe(
      '/workspace/project/src/utils/helpers'
    );
    expect(resolvePathSync('/workspace/project/src/App.tsx', '@/components/Button')).toBe(
      '@/components/Button'
    );
  });
});
