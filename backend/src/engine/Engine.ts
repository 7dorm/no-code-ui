// src/engine/VisualEngine.ts
import {
  Project,
  SourceFile,
  Node,
  SyntaxKind,
  JsxElement,
  JsxSelfClosingElement,
  JsxAttribute,
  JsxOpeningElement,
} from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs-extra';
import { VisualBlock, ProjectTree } from './types';
import { ReactParser } from './parsers/ReactParser';
import { HtmlParser } from './parsers/HtmlParser';
import { CssParser } from './parsers/CssParser';

export class VisualEngine {
  private project: Project;
  private blocks = new Map<string, VisualBlock>();
  cssStyles = new Map<string, VisualBlock>();
  private projectRoot: string;

constructor(projectRoot: string) {
  this.projectRoot = path.resolve(projectRoot);

  const tsConfigPath = this.findConfigUpwards(
    this.projectRoot,
    ['tsconfig.json', 'package.json', "index.html"]
  );

  if (tsConfigPath) {
    this.project = new Project({
      tsConfigFilePath: tsConfigPath,
      skipAddingFilesFromTsConfig: true,
    });
  } else {
    // fallback — если вообще нет конфигов
    this.project = new Project({
      compilerOptions: {
        allowJs: true,
        jsx: 2, // React JSX
      },
      skipAddingFilesFromTsConfig: true,
    });
  }
}

private findConfigUpwards(
  startDir: string,
  fileNames: string[]
): string | null {
  let current = startDir;

  while (true) {
    for (const name of fileNames) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}


  async loadProject(): Promise<ProjectTree> {
    this.blocks.clear();
    this.cssStyles.clear();
    const files = await this.findAllFiles();

    for (const file of files) {
      const relPath = path.relative(this.projectRoot, file);

      if (/\.(tsx|jsx|ts|js)$/.test(relPath) && !relPath.includes('node_modules')) {
        const sourceFile = this.project.addSourceFileAtPath(file);
        new ReactParser(file, relPath, this.blocks).parse(sourceFile);
      }

      if (/\.html?$/.test(relPath)) {
        new HtmlParser(file, relPath, this.blocks).parse(file);
      }

      if (/\.(css|scss)$/.test(relPath)) {
        new CssParser(file, relPath, this.cssStyles).parse(file);
      }
    }

    this.resolveCrossReferences();
    this.resolveComponentImports();
    return {
  blocks: Object.fromEntries(
    Array.from(this.blocks.entries()).map(([id, block]) => [
      id,
      {
        ...block,
        astNode: undefined, 
      },
    ])
  ),
  roots: this.findRootBlocks(),
};
  }



  private async findAllFiles(): Promise<string[]> {
    const entries = await fs.readdir(this.projectRoot, { recursive: true, withFileTypes: true });
    return entries
      .filter(d => d.isFile())
      .map(d => path.join(d.parentPath!, d.name))
      .filter(f => !f.includes('node_modules') && !f.includes('.git'));
  }

private resolveCrossReferences() {
  for (const block of this.blocks.values()) {
    if (!block.props?.className?.value) continue;

    const classes = block.props.className.value
      .split(' ')
      .map(c => c.trim())
      .filter(Boolean);

    for (const cls of classes) {
      const cssId = `${block.relPath}__css-class__${cls}`;

      // 1. Проверяем обычные блоки
      const normalCss = this.blocks.get(cssId);
      if (normalCss) {
        block.uses.push(cssId);
        normalCss.usedIn.push(block.id);
      }

      // 2. Проверяем отдельно cssStyles
      const separateCss = this.cssStyles.get(cssId);
      if (separateCss) {
        block.uses.push(cssId);
        separateCss.usedIn.push(block.id);
      }
    }
  }
}


private resolveComponentImports() {
  const rootBlocks = this.findRootBlocks();

  // --- сначала строим все компоненты ---
  for (const rootId of rootBlocks) {
    const rootBlock = this.blocks.get(rootId);
    if (!rootBlock || !rootBlock.imports?.length) continue;

    const baseDir = path.dirname(path.resolve(this.projectRoot, rootBlock.relPath));

    // строим мапу компонентов для текущего файла
    const importMap = new Map<string, string>();
    for (const raw of rootBlock.imports) {
      const [importPath, , localName] = raw.split('|');
      if (!importPath || !importPath.startsWith('.')) continue; 

      const absPath = path.normalize(path.resolve(baseDir, importPath));

      const comp = Array.from(this.blocks.values()).find(
        b => b.type === 'component' && path.normalize(path.resolve(this.projectRoot, "./" + b.relPath)).startsWith(absPath)
      );
      if (comp) importMap.set(localName, comp.id);
    }

    // рекурсивная замена элементов на компоненты
    this.resolveComponentTreeWithImportMap(rootId, importMap);
  }
  

  // --- потом строим CSS-мапы и сопоставляем ---
  for (const rootId of rootBlocks) {
    const rootBlock = this.blocks.get(rootId);
    if (!rootBlock) continue;

    // строим локальную CSS-мапу по классам
    const cssMap = new Map<string, VisualBlock>();
    if (rootBlock.imports?.length) {
      const baseDir = path.dirname(path.resolve(this.projectRoot, rootBlock.relPath));
      for (const raw of rootBlock.imports) {
        const [importPath] = raw.split('|');
        if (!importPath || !importPath.endsWith('.css')) continue;

        const absPath = path.normalize(path.resolve(baseDir, importPath));

        for (const cssBlock of this.cssStyles.values()) {
          const cssAbsPath = path.normalize(path.resolve(this.projectRoot, "./" + cssBlock.relPath));
          if (cssAbsPath === absPath) {
            cssMap.set(cssBlock.name, cssBlock); 
          }
        }
      }
    }

    // рекурсивно сопоставляем CSS всем элементам, наследуя от родителей
    this.resolveCssTree(rootId, cssMap);
  }
}

// Рекурсивное сопоставление CSS с элементами
private resolveCssTree(blockId: string, inheritedCssMap: Map<string, VisualBlock>) {
  const block = this.blocks.get(blockId);
  if (!block?.childrenIds?.length) return;

  // создаём локальную карту CSS для этого блока (на основе наследуемой)
  const localCssMap = new Map(inheritedCssMap);

  // добавляем CSS из текущего блока, если есть
  if (block.type === 'component' && block.imports?.length) {
    const baseDir = path.dirname(path.resolve(this.projectRoot, block.relPath));
    for (const raw of block.imports) {
      const [importPath] = raw.split('|');
      if (!importPath || !importPath.endsWith('.css')) continue;

      const absPath = path.normalize(path.resolve(baseDir, importPath));
      for (const cssBlock of this.cssStyles.values()) {
        const cssAbsPath = path.normalize(path.resolve(this.projectRoot, "./" + cssBlock.relPath));
        if (cssAbsPath === absPath) {
          localCssMap.set(cssBlock.name, cssBlock);
        }
      }
    }
  }
  for (const childId of block.childrenIds) {
    const child = this.blocks.get(childId);
    if (!child || (child.type !== 'component' && child.type !== 'element')) continue;

    // сопоставляем классы с CSS
    const className = child.props?.className?.value;
    if (className) {
      const classes = className.split(' ').map(c => c.trim()).filter(Boolean);
      for (const cls of classes) {
        const cssBlock = localCssMap.get(cls);
        if (cls === "main-header")
        if (cssBlock) {
          if (!child.uses.includes(cssBlock.id)) child.uses.push(cssBlock.id);
          if (!cssBlock.usedIn.includes(child.id)) cssBlock.usedIn.push(child.id);
        }
      }
    }

    // рекурсивно передаём локальную карту CSS детям
    this.resolveCssTree(childId, localCssMap);
  }
}



private resolveComponentTreeWithImportMap(
  blockId: string,
  importMap: Map<string, string>
) {
  const block = this.blocks.get(blockId);
  if (!block?.childrenIds?.length) return;

  const newChildren: string[] = [];

  for (const childId of block.childrenIds) {
    const child = this.blocks.get(childId);
    if (!child) continue;

    // Если элемент с большой буквы
    if (child.type === 'element') {
      if (/^[A-Z]/.test(child.name)) {
        const replacementId = importMap.get(child.name);
        if (replacementId) {
          const realComp = this.blocks.get(replacementId);
          if (realComp) {
            realComp.usedIn.push(block.id);
            newChildren.push(realComp.id);
            this.blocks.delete(child.id);
            continue; // не идем внутрь реального компонента
          }
        }
      }

      // 2) Проверка props, которые могут быть компонентами
      for (const [propName, propValue] of Object.entries(child.props || {})) {
       
        if (((propValue as any).type === 'expression' || (propValue as any).type === 'component')  && /^[A-Z]/.test(propValue.value)) {
          // значение пропа — имя компонента
          const replacementId = importMap.get(propValue.value);
          if (replacementId) {
            const realComp = this.blocks.get(replacementId);
            if (realComp) {
              realComp.usedIn.push(block.id);
 
              // можно заменить prop на блок компонента
              child.childrenIds.push(realComp.id);
            }
          }
        }
      }
    }

    // оставляем текущий элемент
    newChildren.push(childId);

    // рекурсивно обходим оставшиеся children
    this.resolveComponentTreeWithImportMap(childId, importMap);
  }

  block.childrenIds = newChildren;
}

  private findRootBlocks(): string[] {
    return Array.from(this.blocks.values())
      .filter(b => (b.type === 'component' && b.isExported) || b.type === 'html-root')
      .map(b => b.id);
  }

  async saveAll() {
    await this.project.save();
  }
}