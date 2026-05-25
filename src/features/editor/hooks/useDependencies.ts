import { useCallback } from 'react';
import { readFile, readFileBase64 } from '../../../shared/api/electron-api';
import { resolvePath, resolvePathSync } from '../lib/path-resolver';

export function useDependencies() {
  const resolvePathMemo = useCallback(resolvePath, []);
  const resolvePathForFramework = useCallback((path: string, base?: string) => resolvePathSync(base ?? '', path), []);

  const loadDependency = useCallback(
    async (
      basePath: string,
      importPath: string
    ): Promise<{ success: boolean; content?: string; error?: string; path?: string }> => {
      try {
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg'];
        const isImagePath = (p: string) => imageExts.some((ext) => String(p || '').toLowerCase().endsWith(ext));
        let resolvedPath = await resolvePathMemo(basePath, importPath);

        const extMatch = resolvedPath.match(/\.([^.]+)$/);
        if (!extMatch) {
          const tryPaths = [
            resolvedPath + '.js',
            resolvedPath + '.jsx',
            resolvedPath + '.ts',
            resolvedPath + '.tsx',
            resolvedPath + '.css',
            resolvedPath + '.png',
            resolvedPath + '.jpg',
            resolvedPath + '.jpeg',
            resolvedPath + '.gif',
            resolvedPath + '.webp',
            resolvedPath + '.avif',
            resolvedPath + '.bmp',
            resolvedPath + '.svg',
            resolvedPath + '/index.js',
            resolvedPath + '/index.jsx',
            resolvedPath + '/index.ts',
            resolvedPath + '/index.tsx',
          ];

          for (const tryPath of tryPaths) {
            try {
              if (isImagePath(tryPath)) {
                const imgResult = await readFileBase64(tryPath);
                if (imgResult.success) {
                  const dataUrl = `data:${imgResult.mimeType};base64,${imgResult.base64}`;
                  return { success: true, content: dataUrl, path: tryPath };
                }
              } else {
                const result = await readFile(tryPath);
                if (result.success) {
                  return { success: true, content: result.content, path: tryPath };
                }
              }
            } catch {}
          }
        } else {
          if (isImagePath(resolvedPath)) {
            const imgResult = await readFileBase64(resolvedPath);
            if (imgResult.success) {
              const dataUrl = `data:${imgResult.mimeType};base64,${imgResult.base64}`;
              return { success: true, content: dataUrl, path: resolvedPath };
            }
          } else {
            const result = await readFile(resolvedPath);
            if (result.success) {
              return { success: true, content: result.content, path: resolvedPath };
            }
          }
        }

        return { success: false, error: `Файл не найден: ${importPath}` };
      } catch (error) {
        console.error('useDependencies: Error loading dependency:', error);
        return { success: false, error: (error as Error).message };
      }
    },
    [resolvePathMemo]
  );

  const processHTMLWithDependencies = useCallback(
    async (htmlContent: string, basePath: string): Promise<{ html: string; dependencyPaths: string[] }> => {
      const dependencyPaths: string[] = [];
      let processedHTML = htmlContent;

      const cssLinkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
      const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
      const imgSrcRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

      const cssMatches = [...htmlContent.matchAll(cssLinkRegex)];
      for (const match of cssMatches) {
        const cssPath = match[1];
        if (cssPath.startsWith('http://') || cssPath.startsWith('https://') || cssPath.startsWith('//')) {
          continue;
        }

        const depResult = await loadDependency(basePath, cssPath);
        if (depResult.success) {
          dependencyPaths.push(depResult.path || '');
          const styleTag = `<style>\n/* ${cssPath} */\n${depResult.content}\n</style>`;
          processedHTML = processedHTML.replace(match[0], styleTag);
        }
      }

      const scriptMatches = [...htmlContent.matchAll(scriptSrcRegex)];
      for (const match of scriptMatches) {
        const scriptPath = match[1];
        if (scriptPath.startsWith('http://') || scriptPath.startsWith('https://') || scriptPath.startsWith('//')) {
          continue;
        }

        const depResult = await loadDependency(basePath, scriptPath);
        if (depResult.success) {
          dependencyPaths.push(depResult.path || '');
          const scriptTag = `<script>\n/* ${scriptPath} */\n${depResult.content}\n</script>`;
          processedHTML = processedHTML.replace(match[0], scriptTag);
        }
      }

      const imgMatches = [...htmlContent.matchAll(imgSrcRegex)];
      for (const match of imgMatches) {
        const imgPath = match[1];
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('//') || imgPath.startsWith('data:')) {
          continue;
        }

        const resolvedPath = await resolvePathMemo(basePath, imgPath);
        try {
          const result = await readFileBase64(resolvedPath);
          if (result.success) {
            dependencyPaths.push(resolvedPath);
            const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
            processedHTML = processedHTML.replace(match[1], dataUrl);
          }
        } catch {}
      }

      return { html: processedHTML, dependencyPaths };
    },
    [loadDependency, resolvePathMemo]
  );

  return {
    resolvePathMemo,
    resolvePathForFramework,
    loadDependency,
    processHTMLWithDependencies,
  };
}
