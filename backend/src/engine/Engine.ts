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
import { removeBlockAndCleanup } from './mutators/deleteBlock';

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

    this.resolveComponentUsages();
    this.resolveStyleImportsReactPriority();
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

  async loadFileTree(entryFile: string): Promise<ProjectTree> {
  this.blocks.clear();
  this.cssStyles.clear();

  const visitedFiles = new Set<string>();

  const processFile = async (absPath: string) => {
    const normalized = this.normalizeAbs(absPath);
    if (visitedFiles.has(normalized)) return;
    visitedFiles.add(normalized);

    const relPath = path.relative(this.projectRoot, absPath);

    // ---------- PARSE FILE ----------
    if (this.isScriptFile(normalized)) {
      const sourceFile =
        this.project.getSourceFile(absPath) ??
        this.project.addSourceFileAtPath(absPath);

      new ReactParser(absPath, relPath, this.blocks).parse(sourceFile);
    }

    if (/\.html?$/.test(normalized)) {
      new HtmlParser(absPath, relPath, this.blocks).parse(absPath);
    }

    // ---------- COLLECT IMPORTS FROM PARSED BLOCKS ----------
    const blocksFromFile = Array.from(this.blocks.values()).filter(
      b => this.normalizeAbs(b.filePath) === normalized
    );

    for (const block of blocksFromFile) {
      for (const raw of block.imports ?? []) {
        const [importSpec] = raw.split('|');
        if (!importSpec || !importSpec.startsWith('.')) continue;

        const resolved = this.resolveImportToAbsPath(absPath, importSpec);
        if (!resolved) continue;

        const resolvedAbs = this.normalizeAbs(resolved);

        // CSS — парсим, но не уходим дальше
        if (this.isStyleFile(resolvedAbs)) {
          if (!this.cssStyles.has(resolvedAbs)) {
            new CssParser(
              resolvedAbs,
              path.relative(this.projectRoot, resolvedAbs),
              this.cssStyles
            ).parse(resolvedAbs);
          }
          continue;
        }

        // JS / TS — идём рекурсивно
        if (this.isScriptFile(resolvedAbs)) {
          await processFile(resolvedAbs);
        }
      }
    }
  };

  // ---------- ENTRY ----------
  const entryAbs = this.normalizeAbs(path.resolve(entryFile));
  await processFile(entryAbs);

  // ---------- POST PROCESS ----------
  this.resolveComponentUsages();
  this.resolveStyleImportsReactPriority();

  return {
    blocks: Object.fromEntries(
      Array.from(this.blocks.entries()).map(([id, block]) => [
        id,
        { ...block, astNode: undefined },
      ])
    ),
    roots: this.findRootBlocks(),
  };
}

async reloadFile(entryFile: string): Promise<void> {
  const absPath = entryFile;

  // ---------- УДАЛЕНИЕ БЛОКОВ ----------
  const blocksInFile = Object.fromEntries(
    Object.entries(this.blocks).filter(
      ([, block]) => this.normalizeAbs(block.filePath) === absPath
    )
  );

  for (const block of Object.values(blocksInFile)) {
    removeBlockAndCleanup(Object.fromEntries(this.blocks), block.id);
    this.blocks.delete(block.id); // убедимся, что удалили из карты
  }

  // ---------- ПАРСИНГ ФАЙЛА ----------
  const relPath = path.relative(this.projectRoot, absPath);

  if (this.isScriptFile(absPath)) {
    const sourceFile =
      this.project.getSourceFile(absPath) ??
      this.project.addSourceFileAtPath(absPath);
    new ReactParser(absPath, relPath, this.blocks).parse(sourceFile);
  }

  if (/\.html?$/.test(absPath)) {
    new HtmlParser(absPath, relPath, this.blocks).parse(absPath);
  }

  if (this.isStyleFile(absPath)) {
    new CssParser(absPath, relPath, this.cssStyles).parse(absPath);
  }


  // ---------- ПОСТ ОБРАБОТКА ----------
  this.resolveComponentUsages();
  this.resolveStyleImportsReactPriority();
}



  private async findAllFiles(): Promise<string[]> {
    const entries = await fs.readdir(this.projectRoot, { recursive: true, withFileTypes: true });
    return entries
      .filter(d => d.isFile())
      .map(d => path.join(d.parentPath!, d.name))
      .filter(f => !f.includes('node_modules') && !f.includes('.git'));
  }

private resolveComponentUsages() {
  // Reset usages so loadProject() is deterministic
  for (const block of this.blocks.values()) {
    if (block.type !== 'component') continue;
    block.usages = [];
    block.usedIn = [];
  }

  const componentsByFile = new Map<string, VisualBlock[]>();
  const importsByFile = new Map<string, string[]>();
  for (const block of this.blocks.values()) {
    if (block.type !== 'component') continue;
    const abs = this.normalizeAbs(block.filePath);
    const list = componentsByFile.get(abs) ?? [];
    list.push(block);
    componentsByFile.set(abs, list);

    if (block.imports && !importsByFile.has(abs)) {
      importsByFile.set(abs, block.imports);
    }
  }

  const importMapByFile = new Map<string, Map<string, string>>();
  for (const block of this.blocks.values()) {
    if (block.type !== 'component') continue;
    const absFile = this.normalizeAbs(block.filePath);
    let importMap = importMapByFile.get(absFile);
    if (!importMap) {
      importMap = this.buildImportMapForFile(
        block.filePath,
        componentsByFile,
        importsByFile.get(absFile)
      );
      importMapByFile.set(absFile, importMap);
    }
    this.resolveComponentTreeWithImportMap(block.id, importMap);
  }
}

private resolveStyleImportsReactPriority() {
  // Clear old links (if any)
  for (const cssBlock of this.cssStyles.values()) cssBlock.usedIn = [];
  for (const block of this.blocks.values()) {
    if (!block.uses?.length) continue;
    block.uses = block.uses.filter(id => !this.cssStyles.has(id));
  }

  const cssBlocksByFile = new Map<string, VisualBlock[]>();
  for (const cssBlock of this.cssStyles.values()) {
    const abs = this.normalizeAbs(cssBlock.filePath);
    const list = cssBlocksByFile.get(abs) ?? [];
    list.push(cssBlock);
    cssBlocksByFile.set(abs, list);
  }

  const importsByFile = new Map<string, string[]>();
  for (const block of this.blocks.values()) {
    if (block.type !== 'component') continue;
    if (!block.imports) continue;
    const abs = this.normalizeAbs(block.filePath);
    if (!importsByFile.has(abs)) importsByFile.set(abs, block.imports);
  }

  for (const rootId of this.findRootBlocks()) {
    const root = this.blocks.get(rootId);
    if (!root || root.type !== 'component') continue;

    const styleLoadOrder = this.collectStyleLoadOrder(root.filePath, importsByFile);
    const effectiveClassMap = this.buildEffectiveClassMap(styleLoadOrder, cssBlocksByFile);
    this.linkCssInTree(rootId, effectiveClassMap);
  }
}

private collectStyleLoadOrder(
  entryFilePath: string,
  importsByFile: Map<string, string[]>
): string[] {
  const visitedFiles = new Set<string>();
  const visitedStyles = new Set<string>();
  const order: string[] = [];

  const visitFile = (absFilePath: string) => {
    const normalized = this.normalizeAbs(absFilePath);
    if (visitedFiles.has(normalized)) return;
    visitedFiles.add(normalized);

    let importSpecs: string[] = [];

    const rawImports = importsByFile.get(normalized);
    if (rawImports !== undefined) {
      importSpecs = rawImports.map(raw => raw.split('|')[0]).filter(Boolean);
    } else {
      // fallback: file has no parsed components, but still might contain CSS imports
      let sourceFile = this.project.getSourceFile(absFilePath);
      if (!sourceFile && fs.existsSync(absFilePath)) {
        try {
          sourceFile = this.project.addSourceFileAtPath(absFilePath);
        } catch {
          return;
        }
      }
      if (!sourceFile) return;
      importSpecs = sourceFile.getImportDeclarations().map(imp => imp.getModuleSpecifierValue());
    }

    for (const spec of importSpecs) {
      if (!spec || !spec.startsWith('.')) continue;

      const resolved = this.resolveImportToAbsPath(absFilePath, spec);
      if (!resolved) continue;

      const resolvedAbs = this.normalizeAbs(resolved);
      if (this.isStyleFile(resolvedAbs)) {
        if (!visitedStyles.has(resolvedAbs)) {
          visitedStyles.add(resolvedAbs);
          order.push(resolvedAbs);
        }
        continue;
      }

      if (this.isScriptFile(resolvedAbs)) {
        visitFile(resolvedAbs);
      }
    }
  };

  visitFile(entryFilePath);
  return order;
}

private buildEffectiveClassMap(
  styleLoadOrder: string[],
  cssBlocksByFile: Map<string, VisualBlock[]>
): Map<string, VisualBlock> {
  const effective = new Map<string, VisualBlock>();

  for (const cssAbsPath of styleLoadOrder) {
    const blocks = cssBlocksByFile.get(cssAbsPath);
    if (!blocks) continue;

    // Within one file: later rules override earlier ones (approx by source position)
    const sorted = [...blocks].sort((a, b) => this.cssBlockOrderKey(a) - this.cssBlockOrderKey(b));
    const perFile = new Map<string, VisualBlock>();
    for (const block of sorted) {
      perFile.set(block.name, block);
    }

    // Between files: later imports override earlier ones
    for (const [className, block] of perFile.entries()) {
      effective.set(className, block);
    }
  }

  return effective;
}

private linkCssInTree(rootId: string, effectiveClassMap: Map<string, VisualBlock>) {
  const visited = new Set<string>();
  const stack: string[] = [rootId];

  while (stack.length > 0) {
    const blockId = stack.pop()!;
    if (visited.has(blockId)) continue;
    visited.add(blockId);

    const block = this.blocks.get(blockId);
    if (!block) continue;

    const isDomElement = block.type === 'element' || block.type === 'html-element';
    if (isDomElement) {
      const className = block.props?.className?.value;
      if (className) {
        const classes = className.split(' ').map(c => c.trim()).filter(Boolean);
        for (const cls of classes) {
          const cssBlock = effectiveClassMap.get(cls);
          if (!cssBlock) continue;
          if (!block.uses.includes(cssBlock.id)) block.uses.push(cssBlock.id);
          if (!cssBlock.usedIn.includes(block.id)) cssBlock.usedIn.push(block.id);
        }
      }
    }

    for (const childId of block.childrenIds ?? []) stack.push(childId);

    // Follow component-instance -> component definition for tree traversal
    if (block.type === 'component-instance' && block.refId) {
      stack.push(block.refId);
    }
  }
}

private cssBlockOrderKey(block: VisualBlock): number {
  const idx = block.metadata?.ruleStartIndex;
  if (typeof idx === 'number') return idx;
  return block.startLine * 1_000_000 + block.startCol;
}

private normalizeAbs(p: string): string {
  return path.normalize(p).replace(/\\/g, '/');
}

private isStyleFile(absPath: string): boolean {
  const ext = path.extname(absPath).toLowerCase();
  return ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less';
}

private isScriptFile(absPath: string): boolean {
  const ext = path.extname(absPath).toLowerCase();
  return ext === '.tsx' || ext === '.ts' || ext === '.jsx' || ext === '.js';
}

private resolveImportToAbsPath(fromAbsFilePath: string, importPath: string): string | null {
  const baseDir = path.dirname(fromAbsFilePath);
  const base = path.resolve(baseDir, importPath);

  // Exact file (with extension)
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;

  // Try known extensions
  if (!path.extname(base)) {
    const candidates = [
      ...['.tsx', '.ts', '.jsx', '.js', '.css', '.scss', '.sass', '.less'].map(ext => base + ext),
      ...['.tsx', '.ts', '.jsx', '.js', '.css', '.scss', '.sass', '.less'].map(ext =>
        path.join(base, 'index' + ext)
      ),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }

  return null;
}

private buildImportMapForFile(
  absFilePath: string,
  componentsByFile: Map<string, VisualBlock[]>,
  imports: string[] = []
): Map<string, string> {
  const importMap = new Map<string, string>();

  for (const raw of imports) {
    const [spec, importKind, localName] = raw.split('|');
    if (!spec || !spec.startsWith('.')) continue;
    if (importKind !== 'default' && importKind !== 'named') continue;
    if (!localName) continue;

    const resolved = this.resolveImportToAbsPath(absFilePath, spec);
    if (!resolved) continue;

    const candidates = componentsByFile.get(this.normalizeAbs(resolved)) ?? [];
    if (candidates.length === 0) continue;

    const target =
      importKind === 'default'
        ? candidates.find(c => c.metadata?.isDefaultExport) ??
          candidates.find(c => c.name === localName) ??
          (candidates.length === 1 ? candidates[0] : candidates[0])
        : candidates.find(c => c.name === localName) ?? candidates[0];
    if (target) importMap.set(localName, target.id);
  }

  return importMap;
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

    // If JSX tag starts with an uppercase letter, treat it as component usage.
    if (child.type === 'element' && /^[A-Z]/.test(child.name)) {
      const targetComponentId = importMap.get(child.name);
      if (targetComponentId) {
        const targetComponent = this.blocks.get(targetComponentId);
        if (targetComponent && targetComponent.type === 'component') {
          child.type = 'component-instance';
          child.refId = targetComponentId;

          child.uses ??= [];
          if (!child.uses.includes(targetComponentId)) child.uses.push(targetComponentId);

          targetComponent.usedIn ??= [];
          if (!targetComponent.usedIn.includes(child.id)) targetComponent.usedIn.push(child.id);

          targetComponent.usages ??= [];
          if (!targetComponent.usages.some(u => u.usageId === child.id)) {
            targetComponent.usages.push({
              usageId: child.id,
              filePath: child.filePath,
              relPath: child.relPath,
              startLine: child.startLine,
              endLine: child.endLine,
              startCol: child.startCol,
              endCol: child.endCol,
              parentId: child.parentId,
              props: child.props,
            });
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
