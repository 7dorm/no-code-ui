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
    this.project = new Project({
      tsConfigFilePath: path.join(this.projectRoot, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: true,
    });
  }

  async loadProject(): Promise<ProjectTree> {
    this.blocks.clear();
    this.cssStyles.clear();
    const files = await this.findAllFiles();

    for (const file of files) {
      const relPath = path.relative(this.projectRoot, file);

      if (/\.(tsx|jsx|ts|js)$/.test(relPath) && !relPath.includes('node_modules')) {
        const sourceFile = this.project.addSourceFileAtPath(file);
        new ReactParser(relPath, this.blocks).parse(sourceFile);
      }

      if (/\.html?$/.test(relPath)) {
        new HtmlParser(relPath, this.blocks).parse(file);
      }

      if (/\.(css|scss)$/.test(relPath)) {
        new CssParser(relPath, this.cssStyles).parse(file);
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

  // ─────────────────────────────── МУТАЦИИ ───────────────────────────────

async moveBlock(blockId: string, newParentId: string, index?: number): Promise<void> {
  const block = this.blocks.get(blockId);
  const newParent = this.blocks.get(newParentId);
  if (!block || !newParent || block.filePath !== newParent.filePath || block.type !== 'element') return;

  const sourceFile = this.project.getSourceFile(block.filePath);
  if (!sourceFile) return;

  const targetNode = block.astNode as JsxElement | JsxSelfClosingElement | undefined;
  const parentNode = newParent.astNode as JsxElement | undefined;
  if (!targetNode || !parentNode || !Node.isJsxElement(parentNode)) return;

  // 1. Удаляем старый узел
  const originalCode = block.sourceCode.trim();
  (targetNode as any).remove?.();

  // 2. Находим SyntaxList с детьми родителя
  const syntaxList = parentNode.getFirstChildByKind(SyntaxKind.SyntaxList);
  if (!syntaxList) return;

  const indent = '  '.repeat(this.getIndentLevel(parentNode));
  const codeToInsert = `\n${indent}${originalCode}\n${indent}`;

  // 3. Определяем позицию вставки
  const children = syntaxList.getChildren();
  const insertAt = typeof index === 'number' ? Math.min(index, children.length) : children.length;

  let insertPos: number;

  if (insertAt === 0) {
    // В начало
    insertPos = syntaxList.getStart();
  } else if (insertAt >= children.length) {
    // В конец
    insertPos = syntaxList.getEnd();
  } else {
    // Перед нужным ребёнком
    const beforeNode = children[insertAt];
    insertPos = beforeNode.getStart();
  }

  // Вставляем текст в нужное место
  sourceFile.insertText(insertPos, codeToInsert);

  // Обновляем связи
  if (block.parentId) {
    const old = this.blocks.get(block.parentId);
    if (old) old.childrenIds = old.childrenIds.filter(id => id !== blockId);
  }
  block.parentId = newParentId;
  newParent.childrenIds.splice(index ?? newParent.childrenIds.length, 0, blockId);

  await sourceFile.save();
}

  async updateProp(blockId: string, propName: string, newValue: string): Promise<void> {
    const block = this.blocks.get(blockId);
    if (!block || block.type !== 'element') return;

    const sourceFile = this.project.getSourceFile(block.filePath);
    if (!sourceFile) return;

    const node = block.astNode as JsxElement | JsxSelfClosingElement | undefined;
    if (!node) return;

    let opening: JsxOpeningElement | JsxSelfClosingElement;

    if (Node.isJsxElement(node)) {
      opening = node.getOpeningElement();
    } else {
      opening = node;
    }

    const attr = opening.getAttribute(propName);
    if (attr && Node.isJsxAttribute(attr)) {
      const init = attr.getInitializer();
      if (init) init.replaceWithText(`"${newValue}"`);
    } else {
      opening.addAttribute({ name: propName, initializer: `"${newValue}"` });
    }

    if (block.props) block.props[propName] = { type: 'string', value: newValue };
    await sourceFile.save();
  }

  async renameBlock(blockId: string, newName: string): Promise<void> {
    const block = this.blocks.get(blockId);
    if (!block || block.type !== 'component') return;

    const sourceFile = this.project.getSourceFile(block.filePath);
    if (!sourceFile) return;

    const decl = sourceFile.getFunction(block.name) ?? sourceFile.getVariableDeclaration(block.name);
    if (!decl) return;

    decl.rename(newName);
    block.name = newName;
    await sourceFile.save();
  }

  async deleteBlock(blockId: string): Promise<void> {
    const block = this.blocks.get(blockId);
    if (!block || !block.parentId || block.usedIn.length > 0) return;

    const sourceFile = this.project.getSourceFile(block.filePath);
    if (!sourceFile) return;

    const node = block.astNode as JsxElement | JsxSelfClosingElement | undefined;
    if (node) {
      (node as any).remove?.();
    }

    const parent = this.blocks.get(block.parentId)!;
    parent.childrenIds = parent.childrenIds.filter(id => id !== blockId);
    this.blocks.delete(blockId);

    await sourceFile.save();
  }

  // ─────────────────────────────── ВСПОМОГАТЕЛЬНОЕ ───────────────────────────────

  private getIndentLevel(node: Node): number {
    const text = node.getFullText();
    const match = text.match(/\n(\s*)</);
    return match ? match[1].length : 2;
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
      const cssId = `${block.filePath}__css-class__${cls}`;

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

private isLocalImport(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../');
}


private removeExtension(p: string): string {
  return p.replace(/\.(tsx|ts|jsx|js)$/, '');
}

private normalizePath(p: string) {
  return p.replace(/\\/g, '/');
}

private resolveComponentImports() {
  const rootBlocks = this.findRootBlocks();

  // --- сначала строим все компоненты ---
  for (const rootId of rootBlocks) {
    const rootBlock = this.blocks.get(rootId);
    if (!rootBlock || !rootBlock.imports?.length) continue;

    const baseDir = path.dirname(path.resolve(this.projectRoot, rootBlock.filePath));

    // строим мапу компонентов для текущего файла
    const importMap = new Map<string, string>();
    for (const raw of rootBlock.imports) {
      const [importPath, , localName] = raw.split('|');
      if (!importPath || !importPath.startsWith('.')) continue; // библиотечные игнорируем

      const absPath = path.normalize(path.resolve(baseDir, importPath));

      const comp = Array.from(this.blocks.values()).find(
        b => b.type === 'component' && path.normalize(path.resolve(this.projectRoot, "./" + b.filePath)).startsWith(absPath)
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
      const baseDir = path.dirname(path.resolve(this.projectRoot, rootBlock.filePath));
      for (const raw of rootBlock.imports) {
        const [importPath] = raw.split('|');
        if (!importPath || !importPath.endsWith('.css')) continue;

        const absPath = path.normalize(path.resolve(baseDir, importPath));

        for (const cssBlock of this.cssStyles.values()) {
          const cssAbsPath = path.normalize(path.resolve(this.projectRoot, "./" + cssBlock.filePath));
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
    const baseDir = path.dirname(path.resolve(this.projectRoot, block.filePath));
    for (const raw of block.imports) {
      const [importPath] = raw.split('|');
      if (!importPath || !importPath.endsWith('.css')) continue;

      const absPath = path.normalize(path.resolve(baseDir, importPath));
      for (const cssBlock of this.cssStyles.values()) {
        const cssAbsPath = path.normalize(path.resolve(this.projectRoot, "./" + cssBlock.filePath));
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
        console.log(localCssMap)
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
  importMap: Map<string, string> // имя компонента -> id компонента
) {
  const block = this.blocks.get(blockId);
  if (!block?.childrenIds?.length) return;

  const newChildren: string[] = [];

  for (const childId of block.childrenIds) {
    const child = this.blocks.get(childId);
    if (!child) continue;

    // Элемент с большой буквы
    if (child.type === 'element' && /^[A-Z]/.test(child.name)) {
      const replacementId = importMap.get(child.name);
      if (replacementId) {
        const realComp = this.blocks.get(replacementId);
        if (realComp) {
          realComp.usedIn.push(block.id);
          newChildren.push(realComp.id);

          // удаляем временный JSX элемент
          this.blocks.delete(child.id);

          // НЕ идём внутрь реального компонента
          continue;
        }
      }
    }

    // оставляем элемент/компонент
    newChildren.push(childId);

    // рекурсивно идем в оставшиеся children
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