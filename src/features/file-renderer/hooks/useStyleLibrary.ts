import { useCallback, useEffect, useState } from 'react';
import { readDirectory, readFile } from '../../../shared/api/electron-api';
import { openFileDialog } from '../../../shared/api/filesystem-api';
import { createFolder } from '../../file-operations/lib/file-operations';
import { createFramework, isFrameworkSupported } from '../../../frameworks/FrameworkFactory';
import type { BlockMap, StyleLibraryEntry } from '../types';
import {
  ensureCssImportInCode,
  extractImportedCssPathsFromCode,
  getRelativeImportPath,
  parseCssLibraryEntries,
  STYLE_TEMPLATES,
  toPosixPath,
  upsertClassNameInJsxOpeningTag,
} from '../utils';

type UseStyleLibraryParams = {
  filePath: string;
  fileType: string | null;
  fileContent: string | null;
  monacoEditorRef: React.MutableRefObject<any>;
  blockMapForFile: BlockMap;
  selectedBlock: { id: string; meta?: any } | null;
  applyAndCommitPatch: (blockId: any, patch: any) => Promise<void>;
  resolveToMappedBlockId: (rawId: any) => string | null;
  writeFile: (targetPath: string, content: string, options?: any) => Promise<any>;
  updateMonacoEditorWithScroll: (newContent: any) => void;
  setFileContent: React.Dispatch<React.SetStateAction<string | null>>;
  setUnsavedContent: React.Dispatch<React.SetStateAction<string | null>>;
  setIsModified: React.Dispatch<React.SetStateAction<boolean>>;
  setRenderVersion: React.Dispatch<React.SetStateAction<number>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useStyleLibrary({
  filePath,
  fileType,
  fileContent,
  monacoEditorRef,
  blockMapForFile,
  selectedBlock,
  applyAndCommitPatch,
  resolveToMappedBlockId,
  writeFile,
  updateMonacoEditorWithScroll,
  setFileContent,
  setUnsavedContent,
  setIsModified,
  setRenderVersion,
  setError,
}: UseStyleLibraryParams) {
  const [styleLibraryEntries, setStyleLibraryEntries] = useState<StyleLibraryEntry[]>([]);

  const getCurrentFileDir = useCallback(() => {
    const normalized = toPosixPath(filePath);
    const idx = normalized.lastIndexOf('/');
    return idx >= 0 ? normalized.slice(0, idx) : '';
  }, [filePath]);

  const isCanceledError = useCallback((error: unknown) => {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return (
      message.includes('canceled')
      || message.includes('cancelled')
      || message.includes('abort')
    );
  }, []);

  const loadStyleLibraryEntries = useCallback(async () => {
    try {
      const currentDir = getCurrentFileDir();
      if (!currentDir) {
        setStyleLibraryEntries([]);
        return;
      }

      const dirResult = await readDirectory(currentDir);
      if (!dirResult?.success || !Array.isArray(dirResult.items)) {
        setStyleLibraryEntries([]);
        return;
      }

      const styleDirs = dirResult.items
        .filter((item: any) => item?.isDirectory && /^styles\d+$/i.test(String(item.name || '')))
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

      const cssPaths = new Set<string>();
      const collected: StyleLibraryEntry[] = [];
      for (const styleDir of styleDirs) {
        const dirPath = `${currentDir}/${styleDir.name}`;
        const filesResult = await readDirectory(dirPath);
        if (!filesResult?.success || !Array.isArray(filesResult.items)) continue;
        for (const item of filesResult.items) {
          if (!item?.isFile || !/\.css$/i.test(String(item.name || ''))) continue;
          const cssPath = `${dirPath}/${item.name}`;
          cssPaths.add(cssPath);
        }
      }

      const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
      const importedCssPaths = extractImportedCssPathsFromCode(currentCode, fileType, filePath);
      importedCssPaths.forEach((path) => cssPaths.add(path));

      for (const cssPath of Array.from(cssPaths)) {
        const cssRead = await readFile(cssPath);
        if (!cssRead?.success) continue;
        const cssText = String(cssRead.content || '');
        const entries = parseCssLibraryEntries(cssText, fileType, cssPath);
        if (entries.length > 0) {
          collected.push(...entries);
        }
      }

      setStyleLibraryEntries(collected);
    } catch (error) {
      if (isCanceledError(error)) return;
      console.error('[useStyleLibrary] Failed to load style library entries:', error);
      setStyleLibraryEntries([]);
    }
  }, [fileContent, filePath, fileType, getCurrentFileDir, isCanceledError, monacoEditorRef]);

  const ensureNextStylesDir = useCallback(async (): Promise<string | null> => {
    const currentDir = getCurrentFileDir();
    if (!currentDir) return null;

    const dirResult = await readDirectory(currentDir);
    if (!dirResult?.success || !Array.isArray(dirResult.items)) return null;
    const names = new Set(
      dirResult.items
        .filter((item: any) => item?.isDirectory)
        .map((item: any) => String(item.name || ''))
    );

    let n = 1;
    while (names.has(`styles${n}`)) n += 1;
    const stylesDirName = `styles${n}`;
    const createRes = await createFolder(`${currentDir}/${stylesDirName}`);
    if (!createRes?.success) return null;
    return `${currentDir}/${stylesDirName}`;
  }, [getCurrentFileDir]);

  const importCssIntoCurrentFile = useCallback(async (relativeImportPath: string) => {
    const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
    if (!currentCode) return;

    let nextContent = String(currentCode);
    if (fileType === 'html') {
      const linkTag = `<link rel="stylesheet" href="${relativeImportPath}">`;
      if (!nextContent.includes(linkTag)) {
        if (nextContent.includes('</head>')) {
          nextContent = nextContent.replace('</head>', `  ${linkTag}\n</head>`);
        } else {
          nextContent = `${linkTag}\n${nextContent}`;
        }
      }
    } else {
      nextContent = ensureCssImportInCode(nextContent, relativeImportPath);
    }

    updateMonacoEditorWithScroll(nextContent);
    setFileContent(nextContent);
    setUnsavedContent(nextContent);
    setIsModified(true);
    setRenderVersion((v) => v + 1);
  }, [fileContent, fileType, monacoEditorRef, setFileContent, setIsModified, setRenderVersion, setUnsavedContent, updateMonacoEditorWithScroll]);

  const handleImportStyleTemplate = useCallback(async (templateId: string) => {
    try {
      const template = STYLE_TEMPLATES.find((item) => item.id === templateId);
      if (!template) return;
      const targetDir = await ensureNextStylesDir();
      if (!targetDir) {
        setError('Failed to create stylesN folder for template.');
        return;
      }

      const cssPath = `${targetDir}/${template.fileName}`;
      const writeRes = await writeFile(cssPath, template.cssText, { backup: false });
      if (!writeRes?.success) {
        setError(`Failed to write template file: ${writeRes?.error || 'unknown error'}`);
        return;
      }

      const relativeImportPath = getRelativeImportPath(filePath, cssPath);
      await importCssIntoCurrentFile(relativeImportPath);
      await loadStyleLibraryEntries();
    } catch (error) {
      if (isCanceledError(error)) return;
      const message = error instanceof Error ? error.message : String(error);
      setError(`Style template import error: ${message}`);
    }
  }, [ensureNextStylesDir, filePath, importCssIntoCurrentFile, isCanceledError, loadStyleLibraryEntries, setError, writeFile]);

  const handleImportStyleFromPicker = useCallback(async () => {
    try {
      const pickRes = await openFileDialog([{ name: 'CSS', extensions: ['css'] } as any]);
      if (!pickRes || pickRes.canceled || !pickRes.fileHandle) return;
      const pickedFile = await pickRes.fileHandle.getFile();
      const cssText = await pickedFile.text();
      const cssFileName = String(pickedFile.name || 'imported-style.css').replace(/[^a-zA-Z0-9._-]/g, '_');

      const targetDir = await ensureNextStylesDir();
      if (!targetDir) {
        setError('Failed to create stylesN folder for imported file.');
        return;
      }

      const cssPath = `${targetDir}/${cssFileName}`;
      const writeRes = await writeFile(cssPath, cssText, { backup: false });
      if (!writeRes?.success) {
        setError(`Failed to save selected CSS: ${writeRes?.error || 'unknown error'}`);
        return;
      }

      const relativeImportPath = getRelativeImportPath(filePath, cssPath);
      await importCssIntoCurrentFile(relativeImportPath);
      await loadStyleLibraryEntries();
    } catch (error) {
      if (isCanceledError(error)) return;
      const message = error instanceof Error ? error.message : String(error);
      setError(`CSS import error: ${message}`);
    }
  }, [ensureNextStylesDir, filePath, importCssIntoCurrentFile, isCanceledError, loadStyleLibraryEntries, setError, writeFile]);

  const applyStyleLibraryClassToBlock = useCallback((blockId: string, className: string) => {
    const mappedBlockId = resolveToMappedBlockId(blockId) || blockId;
    const currentCode = monacoEditorRef?.current?.getValue?.() || fileContent || '';
    let nextContent = String(currentCode || '');
    let mapEntry = blockMapForFile?.[mappedBlockId] || null;
    const token = String(className || '').trim();
    if (!token) {
      setError('Failed to apply className: class is empty.');
      return;
    }

    if (fileType === 'html') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(nextContent, 'text/html');
        const target = mapEntry?.selector ? doc.querySelector(String(mapEntry.selector)) : null;
        if (!target) {
          setError('Failed to apply className: element not found in HTML.');
          return;
        }
        target.classList.add(token);
        const hasDoctype = /^\s*<!doctype/i.test(nextContent);
        nextContent = `${hasDoctype ? '<!DOCTYPE html>' : ''}${doc.documentElement.outerHTML}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(`Failed to apply className: ${message}`);
        return;
      }
    } else {
      const isRangeUsable = (entry: any) => {
        const start = Number(entry?.start);
        const end = Number(entry?.end);
        return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= nextContent.length;
      };
      if (!isRangeUsable(mapEntry)) {
        try {
          if (isFrameworkSupported(fileType as string)) {
            const framework = createFramework(fileType as string, filePath);
            const reInstrumented = framework.instrument(nextContent, filePath);
            mapEntry = reInstrumented?.map?.[mappedBlockId] || mapEntry;
          }
        } catch {}
      }
      const start = Number(mapEntry?.start);
      const end = Number(mapEntry?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > nextContent.length) {
        setError('Failed to apply className: invalid tag range.');
        return;
      }
      const openingTag = nextContent.slice(start, end);
      if (!openingTag.startsWith('<') || openingTag.indexOf('>') < 0) {
        try {
          if (isFrameworkSupported(fileType as string)) {
            const framework = createFramework(fileType as string, filePath);
            const reInstrumented = framework.instrument(nextContent, filePath);
            const refreshed = reInstrumented?.map?.[mappedBlockId];
            const rs = Number(refreshed?.start);
            const re = Number(refreshed?.end);
            if (Number.isFinite(rs) && Number.isFinite(re) && rs >= 0 && re > rs && re <= nextContent.length) {
              const refreshedOpeningTag = nextContent.slice(rs, re);
              const refreshedUpdated = upsertClassNameInJsxOpeningTag(refreshedOpeningTag, token);
              if (refreshedUpdated.ok) {
                nextContent = `${nextContent.slice(0, rs)}${refreshedUpdated.text}${nextContent.slice(re)}`;
                updateMonacoEditorWithScroll(nextContent);
                setFileContent(nextContent);
                setUnsavedContent(nextContent);
                setIsModified(true);
                setRenderVersion((v) => v + 1);
                return;
              }
            }
          }
        } catch {}
      }
      const updated = upsertClassNameInJsxOpeningTag(openingTag, token);
      if (!updated.ok) {
        setError(updated.error);
        return;
      }
      nextContent = `${nextContent.slice(0, start)}${updated.text}${nextContent.slice(end)}`;
    }

    updateMonacoEditorWithScroll(nextContent);
    setFileContent(nextContent);
    setUnsavedContent(nextContent);
    setIsModified(true);
    setRenderVersion((v) => v + 1);
  }, [
    blockMapForFile,
    fileContent,
    filePath,
    fileType,
    monacoEditorRef,
    resolveToMappedBlockId,
    setError,
    setFileContent,
    setIsModified,
    setRenderVersion,
    setUnsavedContent,
    updateMonacoEditorWithScroll,
  ]);

  const handleApplyStyleLibraryEntry = useCallback((entryId: string) => {
    const entry = styleLibraryEntries.find((item) => item.id === entryId);
    if (!entry || !selectedBlock?.id) return;
    if (fileType !== 'react-native' && entry.className) {
      applyStyleLibraryClassToBlock(selectedBlock.id, entry.className);
      return;
    }
    const patch = entry.stylePatch || {};
    if (!patch || Object.keys(patch).length === 0) return;
    void applyAndCommitPatch(selectedBlock.id, patch);
  }, [applyAndCommitPatch, applyStyleLibraryClassToBlock, fileType, selectedBlock?.id, styleLibraryEntries]);

  useEffect(() => {
    void loadStyleLibraryEntries();
  }, [filePath, loadStyleLibraryEntries]);

  return {
    styleLibraryEntries,
    loadStyleLibraryEntries,
    handleImportStyleTemplate,
    handleImportStyleFromPicker,
    handleApplyStyleLibraryEntry,
  };
}
