"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualEngine = void 0;
// src/engine/VisualEngine.ts
const ts_morph_1 = require("ts-morph");
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
const ReactParser_1 = require("./parsers/ReactParser");
const HtmlParser_1 = require("./parsers/HtmlParser");
const CssParser_1 = require("./parsers/CssParser");
const deleteBlock_1 = require("./mutators/deleteBlock");
class VisualEngine {
    constructor(projectRoot) {
        this.blocks = new Map();
        this.cssStyles = new Map();
        this.projectRoot = path.resolve(projectRoot);
        const tsConfigPath = this.findConfigUpwards(this.projectRoot, ['tsconfig.json']);
        if (tsConfigPath) {
            this.project = new ts_morph_1.Project({
                tsConfigFilePath: tsConfigPath,
                skipAddingFilesFromTsConfig: true,
            });
        }
        else {
            // fallback — если вообще нет конфигов
            this.project = new ts_morph_1.Project({
                compilerOptions: {
                    allowJs: true,
                    jsx: 2, // React JSX
                },
                skipAddingFilesFromTsConfig: true,
            });
        }
    }
    findConfigUpwards(startDir, fileNames) {
        let current = startDir;
        while (true) {
            for (const name of fileNames) {
                const candidate = path.join(current, name);
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
            const parent = path.dirname(current);
            if (parent === current)
                break;
            current = parent;
        }
        return null;
    }
    async loadProject() {
        this.blocks.clear();
        this.cssStyles.clear();
        const files = await this.findAllFiles();
        for (const file of files) {
            const relPath = path.relative(this.projectRoot, file);
            if (/\.(tsx|jsx|ts|js)$/.test(relPath) && !relPath.includes('node_modules')) {
                const sourceFile = this.project.addSourceFileAtPath(file);
                new ReactParser_1.ReactParser(file, relPath, this.blocks).parse(sourceFile);
            }
            if (/\.html?$/.test(relPath)) {
                new HtmlParser_1.HtmlParser(file, relPath, this.blocks).parse(file);
            }
            if (/\.(css|scss)$/.test(relPath)) {
                new CssParser_1.CssParser(file, relPath, this.cssStyles).parse(file);
            }
        }
        this.resolveComponentUsages();
        this.resolveStyleImportsReactPriority();
        return {
            blocks: Object.fromEntries(Array.from(this.blocks.entries()).map(([id, block]) => [
                id,
                {
                    ...block,
                    astNode: undefined,
                },
            ])),
            roots: this.findRootBlocks(),
        };
    }
    async loadFileTree(entryFile) {
        this.blocks.clear();
        this.cssStyles.clear();
        const visitedFiles = new Set();
        const processFile = async (absPath) => {
            const normalized = this.normalizeAbs(absPath);
            if (visitedFiles.has(normalized))
                return;
            visitedFiles.add(normalized);
            const relPath = path.relative(this.projectRoot, absPath);
            // ---------- PARSE FILE ----------
            if (this.isScriptFile(normalized)) {
                const sourceFile = this.project.getSourceFile(absPath) ??
                    this.project.addSourceFileAtPath(absPath);
                new ReactParser_1.ReactParser(absPath, relPath, this.blocks).parse(sourceFile);
            }
            if (/\.html?$/.test(normalized)) {
                new HtmlParser_1.HtmlParser(absPath, relPath, this.blocks).parse(absPath);
            }
            // ---------- COLLECT IMPORTS FROM PARSED BLOCKS ----------
            const blocksFromFile = Array.from(this.blocks.values()).filter(b => this.normalizeAbs(b.filePath) === normalized);
            for (const block of blocksFromFile) {
                for (const raw of block.imports ?? []) {
                    const [importSpec] = raw.split('|');
                    if (!importSpec || !importSpec.startsWith('.'))
                        continue;
                    const resolved = this.resolveImportToAbsPath(absPath, importSpec);
                    if (!resolved)
                        continue;
                    const resolvedAbs = this.normalizeAbs(resolved);
                    // CSS — парсим, но не уходим дальше
                    if (this.isStyleFile(resolvedAbs)) {
                        if (!this.cssStyles.has(resolvedAbs)) {
                            new CssParser_1.CssParser(resolvedAbs, path.relative(this.projectRoot, resolvedAbs), this.cssStyles).parse(resolvedAbs);
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
            blocks: Object.fromEntries(Array.from(this.blocks.entries()).map(([id, block]) => [
                id,
                { ...block, astNode: undefined },
            ])),
            roots: this.findRootBlocks(),
        };
    }
    async reloadFile(entryFile) {
        const absPath = this.normalizeAbs(path.resolve(entryFile));
        // ---------- УДАЛЕНИЕ БЛОКОВ ----------
        const blocksInFile = Object.fromEntries(Object.entries(this.blocks).filter(([, block]) => this.normalizeAbs(block.filePath) === absPath));
        for (const block of Object.values(blocksInFile)) {
            (0, deleteBlock_1.removeBlockAndCleanup)(Object.fromEntries(this.blocks), block.id);
            this.blocks.delete(block.id); // убедимся, что удалили из карты
        }
        // ---------- ПАРСИНГ ФАЙЛА ----------
        const relPath = path.relative(this.projectRoot, absPath);
        if (this.isScriptFile(absPath)) {
            const sourceFile = this.project.getSourceFile(absPath) ??
                this.project.addSourceFileAtPath(absPath);
            new ReactParser_1.ReactParser(absPath, relPath, this.blocks).parse(sourceFile);
        }
        if (/\.html?$/.test(absPath)) {
            new HtmlParser_1.HtmlParser(absPath, relPath, this.blocks).parse(absPath);
        }
        if (this.isStyleFile(absPath)) {
            new CssParser_1.CssParser(absPath, relPath, this.cssStyles).parse(absPath);
        }
        // ---------- ПОСТ ОБРАБОТКА ----------
        this.resolveComponentUsages();
        this.resolveStyleImportsReactPriority();
    }
    async findAllFiles() {
        const entries = await fs.readdir(this.projectRoot, { recursive: true, withFileTypes: true });
        return entries
            .filter(d => d.isFile())
            .map(d => path.join(d.parentPath, d.name))
            .filter(f => !f.includes('node_modules') && !f.includes('.git'));
    }
    resolveComponentUsages() {
        // Reset usages so loadProject() is deterministic
        for (const block of this.blocks.values()) {
            if (block.type !== 'component')
                continue;
            block.usages = [];
            block.usedIn = [];
        }
        const componentsByFile = new Map();
        const importsByFile = new Map();
        for (const block of this.blocks.values()) {
            if (block.type !== 'component')
                continue;
            const abs = this.normalizeAbs(block.filePath);
            const list = componentsByFile.get(abs) ?? [];
            list.push(block);
            componentsByFile.set(abs, list);
            if (block.imports && !importsByFile.has(abs)) {
                importsByFile.set(abs, block.imports);
            }
        }
        const importMapByFile = new Map();
        for (const block of this.blocks.values()) {
            if (block.type !== 'component')
                continue;
            const absFile = this.normalizeAbs(block.filePath);
            let importMap = importMapByFile.get(absFile);
            if (!importMap) {
                importMap = this.buildImportMapForFile(block.filePath, componentsByFile, importsByFile.get(absFile));
                importMapByFile.set(absFile, importMap);
            }
            this.resolveComponentTreeWithImportMap(block.id, importMap);
        }
    }
    resolveStyleImportsReactPriority() {
        // Clear old links (if any)
        for (const cssBlock of this.cssStyles.values())
            cssBlock.usedIn = [];
        for (const block of this.blocks.values()) {
            if (!block.uses?.length)
                continue;
            block.uses = block.uses.filter(id => !this.cssStyles.has(id));
        }
        const cssBlocksByFile = new Map();
        for (const cssBlock of this.cssStyles.values()) {
            const abs = this.normalizeAbs(cssBlock.filePath);
            const list = cssBlocksByFile.get(abs) ?? [];
            list.push(cssBlock);
            cssBlocksByFile.set(abs, list);
        }
        const importsByFile = new Map();
        for (const block of this.blocks.values()) {
            if (block.type !== 'component')
                continue;
            if (!block.imports)
                continue;
            const abs = this.normalizeAbs(block.filePath);
            if (!importsByFile.has(abs))
                importsByFile.set(abs, block.imports);
        }
        // IMPORTANT:
        // Linking CSS for every parsed component as a "root" causes duplicates:
        // the same element can be reached from multiple roots with different style graphs.
        // We prefer "entry" components (those not used by any other component-instance),
        // and fall back to all component roots only if we can't detect any entries
        // (e.g. circular component graphs).
        const allComponentRoots = this.findRootBlocks().filter(id => {
            const b = this.blocks.get(id);
            return b?.type === 'component';
        });
        const entryComponentRoots = allComponentRoots.filter(id => {
            const b = this.blocks.get(id);
            return (b?.usedIn ?? []).length === 0;
        });
        const rootsToLink = entryComponentRoots.length > 0 ? entryComponentRoots : allComponentRoots;
        for (const rootId of rootsToLink) {
            const root = this.blocks.get(rootId);
            if (!root || root.type !== 'component')
                continue;
            const styleLoadOrder = this.collectStyleLoadOrder(root.filePath, importsByFile);
            const effectiveClassMap = this.buildEffectiveClassMap(styleLoadOrder, cssBlocksByFile);
            this.linkCssInTree(rootId, effectiveClassMap);
        }
    }
    collectStyleLoadOrder(entryFilePath, importsByFile) {
        const visitedFiles = new Set();
        const visitedStyles = new Set();
        const order = [];
        const visitFile = (absFilePath) => {
            const normalized = this.normalizeAbs(absFilePath);
            if (visitedFiles.has(normalized))
                return;
            visitedFiles.add(normalized);
            let importSpecs = [];
            const rawImports = importsByFile.get(normalized);
            if (rawImports !== undefined) {
                importSpecs = rawImports.map(raw => raw.split('|')[0]).filter(Boolean);
            }
            else {
                // fallback: file has no parsed components, but still might contain CSS imports
                let sourceFile = this.project.getSourceFile(absFilePath);
                if (!sourceFile && fs.existsSync(absFilePath)) {
                    try {
                        sourceFile = this.project.addSourceFileAtPath(absFilePath);
                    }
                    catch {
                        return;
                    }
                }
                if (!sourceFile)
                    return;
                importSpecs = sourceFile.getImportDeclarations().map(imp => imp.getModuleSpecifierValue());
            }
            for (const spec of importSpecs) {
                if (!spec || !spec.startsWith('.'))
                    continue;
                const resolved = this.resolveImportToAbsPath(absFilePath, spec);
                if (!resolved)
                    continue;
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
    buildEffectiveClassMap(styleLoadOrder, cssBlocksByFile) {
        const effective = new Map();
        for (const cssAbsPath of styleLoadOrder) {
            const blocks = cssBlocksByFile.get(cssAbsPath);
            if (!blocks)
                continue;
            // Within one file: later rules override earlier ones (approx by source position)
            const sorted = [...blocks].sort((a, b) => this.cssBlockOrderKey(a) - this.cssBlockOrderKey(b));
            const perFile = new Map();
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
    linkCssInTree(rootId, effectiveClassMap) {
        const visited = new Set();
        const stack = [rootId];
        while (stack.length > 0) {
            const blockId = stack.pop();
            if (visited.has(blockId))
                continue;
            visited.add(blockId);
            const block = this.blocks.get(blockId);
            if (!block)
                continue;
            const isDomElement = block.type === 'element' || block.type === 'html-element';
            if (isDomElement) {
                const className = block.props?.className?.value;
                if (className) {
                    const classes = className.split(' ').map(c => c.trim()).filter(Boolean);
                    for (const cls of classes) {
                        const cssBlock = effectiveClassMap.get(cls);
                        if (!cssBlock)
                            continue;
                        if (!block.uses.includes(cssBlock.id))
                            block.uses.push(cssBlock.id);
                        if (!cssBlock.usedIn.includes(block.id))
                            cssBlock.usedIn.push(block.id);
                    }
                }
            }
            for (const childId of block.childrenIds ?? [])
                stack.push(childId);
            // Follow component-instance -> component definition for tree traversal
            if (block.type === 'component-instance' && block.refId) {
                stack.push(block.refId);
            }
        }
    }
    cssBlockOrderKey(block) {
        const idx = block.metadata?.ruleStartIndex;
        if (typeof idx === 'number')
            return idx;
        return block.startLine * 1000000 + block.startCol;
    }
    normalizeAbs(p) {
        return path.normalize(p).replace(/\\/g, '/');
    }
    isStyleFile(absPath) {
        const ext = path.extname(absPath).toLowerCase();
        return ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less';
    }
    isScriptFile(absPath) {
        const ext = path.extname(absPath).toLowerCase();
        return ext === '.tsx' || ext === '.ts' || ext === '.jsx' || ext === '.js';
    }
    resolveImportToAbsPath(fromAbsFilePath, importPath) {
        const baseDir = path.dirname(fromAbsFilePath);
        const base = path.resolve(baseDir, importPath);
        // Exact file (with extension)
        if (fs.existsSync(base) && fs.statSync(base).isFile())
            return base;
        // Try known extensions
        if (!path.extname(base)) {
            const candidates = [
                ...['.tsx', '.ts', '.jsx', '.js', '.css', '.scss', '.sass', '.less'].map(ext => base + ext),
                ...['.tsx', '.ts', '.jsx', '.js', '.css', '.scss', '.sass', '.less'].map(ext => path.join(base, 'index' + ext)),
            ];
            for (const candidate of candidates) {
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
                    return candidate;
            }
        }
        return null;
    }
    buildImportMapForFile(absFilePath, componentsByFile, imports = []) {
        const importMap = new Map();
        for (const raw of imports) {
            const [spec, importKind, localName] = raw.split('|');
            if (!spec || !spec.startsWith('.'))
                continue;
            if (importKind !== 'default' && importKind !== 'named')
                continue;
            if (!localName)
                continue;
            const resolved = this.resolveImportToAbsPath(absFilePath, spec);
            if (!resolved)
                continue;
            const candidates = componentsByFile.get(this.normalizeAbs(resolved)) ?? [];
            if (candidates.length === 0)
                continue;
            const target = importKind === 'default'
                ? candidates.find(c => c.metadata?.isDefaultExport) ??
                    candidates.find(c => c.name === localName) ??
                    (candidates.length === 1 ? candidates[0] : candidates[0])
                : candidates.find(c => c.name === localName) ?? candidates[0];
            if (target)
                importMap.set(localName, target.id);
        }
        return importMap;
    }
    resolveComponentTreeWithImportMap(blockId, importMap) {
        const block = this.blocks.get(blockId);
        if (!block?.childrenIds?.length)
            return;
        const newChildren = [];
        for (const childId of block.childrenIds) {
            const child = this.blocks.get(childId);
            if (!child)
                continue;
            // If JSX tag starts with an uppercase letter, treat it as component usage.
            if (child.type === 'element' && /^[A-Z]/.test(child.name)) {
                const targetComponentId = importMap.get(child.name);
                if (targetComponentId) {
                    const targetComponent = this.blocks.get(targetComponentId);
                    if (targetComponent && targetComponent.type === 'component') {
                        child.type = 'component-instance';
                        child.refId = targetComponentId;
                        child.uses ?? (child.uses = []);
                        if (!child.uses.includes(targetComponentId))
                            child.uses.push(targetComponentId);
                        targetComponent.usedIn ?? (targetComponent.usedIn = []);
                        if (!targetComponent.usedIn.includes(child.id))
                            targetComponent.usedIn.push(child.id);
                        targetComponent.usages ?? (targetComponent.usages = []);
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
    findRootBlocks() {
        return Array.from(this.blocks.values())
            .filter(b => (b.type === 'component' && b.isExported) || b.type === 'html-root')
            .map(b => b.id);
    }
    async saveAll() {
        await this.project.save();
    }
}
exports.VisualEngine = VisualEngine;
