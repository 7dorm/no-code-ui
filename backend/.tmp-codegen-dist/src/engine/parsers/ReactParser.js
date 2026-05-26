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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactParser = void 0;
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const generator_1 = __importDefault(require("@babel/generator"));
const t = __importStar(require("@babel/types"));
const utils_1 = require("./utils");
const STYLE_EXTS = new Set(['.css', '.scss', '.sass', '.less']);
const SCRIPT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ASSET_EXTS = new Set([
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.ico',
    '.avif',
    '.mp4',
    '.mp3',
    '.wav',
    '.ogg',
    '.json',
    '.txt',
]);
function stripImportQuery(spec) {
    const idx = spec.search(/[?#]/);
    return idx === -1 ? spec : spec.slice(0, idx);
}
function getImportExt(spec) {
    const clean = stripImportQuery(spec);
    const m = clean.match(/(\.[a-z0-9]+)$/i);
    return (m?.[1] ?? '').toLowerCase();
}
function isStyleImport(spec) {
    const ext = getImportExt(spec);
    return STYLE_EXTS.has(ext);
}
function isScriptImport(spec) {
    const ext = getImportExt(spec);
    return ext ? SCRIPT_EXTS.has(ext) : false;
}
class ReactParser {
    constructor(filePath, relPath, blocks) {
        this.filePath = filePath;
        this.relPath = relPath;
        this.blocks = blocks;
        this.objectImportNames = new Set();
        this.importBindingsByLocalName = new Map();
    }
    parse(sourceFile) {
        const ext = this.filePath.split('.').pop()?.toLowerCase();
        let plugins = ['jsx'];
        if (ext === 'ts' || ext === 'tsx') {
            plugins.push('typescript', 'classProperties', 'decorators-legacy', 'optionalChaining', 'nullishCoalescingOperator');
        }
        const code = sourceFile.getFullText();
        const imports = this.collectImports(sourceFile);
        // Парсим через Babel
        const ast = (0, parser_1.parse)(code, { sourceType: 'module', plugins });
        // --- create "object" blocks for non-rendered imports (svg/utils/etc) ---
        this.importBindingsByLocalName.clear();
        this.objectImportNames.clear();
        const importBindings = this.collectImportBindings(ast, code);
        const componentLikeNames = this.collectComponentLikeIdentifiers(ast, importBindings);
        this.createObjectImportBlocks(importBindings, componentLikeNames);
        (0, traverse_1.default)(ast, {
            ExportDefaultDeclaration: path => {
                const decl = path.node.declaration;
                // Пропускаем, если уже обработан
                if (decl.__parsed)
                    return;
                const name = decl.id?.name || 'DefaultExport';
                this.parseJsxComponent(code, name, true, imports, decl);
                // Помечаем как обработанный
                decl.__parsed = true;
            },
            FunctionDeclaration: path => {
                const node = path.node;
                // Пропускаем, если уже обработан как export default
                if (node.__parsed)
                    return;
                if (this.isReactComponentBabel(node)) {
                    const name = node.id?.name || '<anonymous>';
                    this.parseJsxComponent(code, name, false, imports, node);
                    node.__parsed = true;
                }
            },
            VariableDeclaration: path => {
                path.node.declarations.forEach(decl => {
                    const fn = decl.init;
                    if (t.isArrowFunctionExpression(fn) ||
                        t.isFunctionExpression(fn)) {
                        // Пропускаем, если уже обработан
                        if (fn.__parsed)
                            return;
                        if (this.isReactComponentBabel(fn)) {
                            const name = decl.id?.name || '<anonymous>';
                            this.parseJsxComponent(code, name, false, imports, fn);
                            fn.__parsed = true;
                        }
                    }
                });
            },
            ClassDeclaration: path => {
                const node = path.node;
                // Ищем метод render
                const renderMethod = node.body.body.find((m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'render');
                if (renderMethod) {
                    // Пропускаем, если метод уже обработан
                    if (renderMethod.__parsed)
                        return;
                    const name = node.id?.name || 'DefaultClass';
                    this.parseJsxComponent(code, name, false, imports, renderMethod);
                    renderMethod.__parsed = true;
                }
            }
        });
    }
    collectImportBindings(ast, code) {
        const bindings = [];
        const body = ast?.program?.body ?? [];
        for (const stmt of body) {
            if (!t.isImportDeclaration(stmt))
                continue;
            const source = String(stmt.source?.value ?? '');
            const importCode = code.slice(stmt.start ?? 0, stmt.end ?? 0);
            const ext = getImportExt(source);
            const isAsset = ASSET_EXTS.has(ext) && !STYLE_EXTS.has(ext) && !SCRIPT_EXTS.has(ext);
            for (const spec of stmt.specifiers ?? []) {
                let kind;
                let importedName;
                if (t.isImportDefaultSpecifier(spec)) {
                    kind = 'default';
                }
                else if (t.isImportNamespaceSpecifier(spec)) {
                    kind = 'namespace';
                }
                else if (t.isImportSpecifier(spec)) {
                    kind = 'named';
                    const imported = spec.imported;
                    importedName = t.isIdentifier(imported)
                        ? imported.name
                        : t.isStringLiteral(imported)
                            ? imported.value
                            : undefined;
                }
                else {
                    continue;
                }
                const localName = spec.local?.name;
                if (!localName)
                    continue;
                const loc = spec.loc ?? stmt.loc;
                const startLine = loc?.start.line ?? 0;
                const endLine = loc?.end.line ?? 0;
                const startCol = loc?.start.column ?? 0;
                const endCol = loc?.end.column ?? 0;
                const info = {
                    source,
                    kind,
                    importedName,
                    localName,
                    importCode,
                    startLine,
                    endLine,
                    startCol,
                    endCol,
                    isAsset,
                };
                bindings.push(info);
                this.importBindingsByLocalName.set(localName, info);
            }
        }
        return bindings;
    }
    collectComponentLikeIdentifiers(ast, importBindings) {
        const componentLike = new Set();
        const importByLocal = new Map();
        for (const info of importBindings)
            importByLocal.set(info.localName, info);
        const jsxPropIdentifierNames = new Set();
        (0, traverse_1.default)(ast, {
            JSXOpeningElement: path => {
                const rootName = this.getJsxOpeningRootIdentifierName(path.node.name);
                if (rootName)
                    componentLike.add(rootName);
            },
            JSXAttribute: path => {
                const v = path.node.value;
                if (!v || !t.isJSXExpressionContainer(v))
                    return;
                const expr = v.expression;
                if (!t.isIdentifier(expr))
                    return;
                jsxPropIdentifierNames.add(expr.name);
            },
        });
        for (const name of jsxPropIdentifierNames) {
            const imported = importByLocal.get(name);
            const importedIsAsset = imported?.isAsset ?? false;
            if (importedIsAsset)
                continue;
            if (/^[A-Z]/.test(name)) {
                componentLike.add(name);
            }
        }
        return componentLike;
    }
    getJsxOpeningRootIdentifierName(name) {
        if (t.isJSXIdentifier(name))
            return name.name;
        if (t.isJSXMemberExpression(name)) {
            let obj = name.object;
            while (t.isJSXMemberExpression(obj))
                obj = obj.object;
            if (t.isJSXIdentifier(obj))
                return obj.name;
        }
        return null;
    }
    createObjectImportBlocks(importBindings, componentLikeNames) {
        for (const binding of importBindings) {
            if (!binding.localName)
                continue;
            if (componentLikeNames.has(binding.localName))
                continue;
            this.objectImportNames.add(binding.localName);
            const objectId = (0, utils_1.generateId)(this.relPath, 'object', binding.localName);
            const block = {
                id: objectId,
                type: 'object',
                name: binding.localName,
                filePath: this.filePath.replace(/\\/g, '/'),
                relPath: this.relPath.replace(/\\/g, '/'),
                sourceCode: binding.importCode,
                startLine: binding.startLine,
                endLine: binding.endLine,
                startCol: binding.startCol,
                endCol: binding.endCol,
                childrenIds: [],
                uses: [],
                usedIn: [],
                metadata: {
                    importSource: binding.source,
                    importKind: binding.kind,
                    importedName: binding.importedName,
                    isStyle: isStyleImport(binding.source),
                    isScript: isScriptImport(binding.source),
                    isAsset: binding.isAsset,
                },
            };
            this.blocks.set(objectId, block);
        }
    }
    parseJsxComponent(code, name, isDefault, imports, babelNode) {
        const jsxRoots = this.findJsxReturnsInBabelNode(babelNode);
        if (jsxRoots.length === 0)
            return;
        const componentId = (0, utils_1.generateId)(this.relPath, 'component', name);
        const args = this.extractComponentArgs(babelNode);
        const componentBlock = {
            id: componentId,
            type: 'component',
            name,
            astNode: babelNode,
            filePath: this.filePath.replace(/\\/g, '/'),
            relPath: this.relPath.replace(/\\/g, '/'),
            sourceCode: code.slice(babelNode.start, babelNode.end),
            startLine: babelNode.loc?.start.line || 0,
            endLine: babelNode.loc?.end.line || 0,
            startCol: babelNode.loc?.start.column || 0,
            endCol: babelNode.loc?.end.column || 0,
            childrenIds: [],
            uses: [],
            usedIn: [],
            isExported: true,
            metadata: { isDefaultExport: isDefault },
            imports: imports,
            args: args, // <--- новое поле с типами и именами
        };
        this.blocks.set(componentId, componentBlock);
        for (const jsxRoot of jsxRoots) {
            this.parseJsxTree(jsxRoot, componentId);
        }
    }
    extractComponentArgs(babelNode) {
        const args = {};
        const params = Array.isArray(babelNode?.params) ? babelNode.params : [];
        for (const param of params) {
            this.collectArgsFromParam(param, args);
        }
        return args;
    }
    collectArgsFromParam(param, args) {
        if (!param)
            return;
        if (t.isAssignmentPattern(param)) {
            this.collectArgsFromParam(param.left, args);
            return;
        }
        if (t.isIdentifier(param)) {
            args[param.name] = this.extractTypeString(param.typeAnnotation);
            return;
        }
        if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
            args[`...${param.argument.name}`] = 'any';
            return;
        }
        if (t.isObjectPattern(param)) {
            const typeMap = this.extractObjectPatternTypeMap(param.typeAnnotation);
            for (const prop of param.properties) {
                if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
                    args[`...${prop.argument.name}`] = 'any';
                    continue;
                }
                if (!t.isObjectProperty(prop))
                    continue;
                const keyName = t.isIdentifier(prop.key)
                    ? prop.key.name
                    : t.isStringLiteral(prop.key)
                        ? prop.key.value
                        : null;
                if (!keyName)
                    continue;
                let type = typeMap?.[keyName] ?? 'any';
                if (t.isIdentifier(prop.value) && prop.value.typeAnnotation) {
                    type = this.extractTypeString(prop.value.typeAnnotation);
                }
                args[keyName] = type;
            }
        }
    }
    extractObjectPatternTypeMap(typeAnnotation) {
        const inner = this.unwrapTsTypeAnnotation(typeAnnotation);
        if (!inner || inner.type !== 'TSTypeLiteral')
            return null;
        const result = {};
        for (const member of inner.members) {
            if (member.type !== 'TSPropertySignature')
                continue;
            const key = member.key;
            const keyName = key.type === 'Identifier'
                ? key.name
                : key.type === 'StringLiteral'
                    ? key.value
                    : null;
            if (!keyName)
                continue;
            result[keyName] = this.extractTypeString(member.typeAnnotation);
        }
        return result;
    }
    // Помощник для извлечения строки типа из typeAnnotation
    extractTypeString(typeAnnotation) {
        const typeNode = this.unwrapTsTypeAnnotation(typeAnnotation);
        if (!typeNode)
            return 'any';
        switch (typeNode.type) {
            case 'TSStringKeyword': return 'string';
            case 'TSNumberKeyword': return 'number';
            case 'TSBooleanKeyword': return 'boolean';
            case 'TSAnyKeyword': return 'any';
            case 'TSUnknownKeyword': return 'unknown';
            case 'TSNeverKeyword': return 'never';
            case 'TSVoidKeyword': return 'void';
            case 'TSLiteralType': {
                const lit = typeNode.literal;
                if (t.isStringLiteral(lit))
                    return JSON.stringify(lit.value);
                if (t.isNumericLiteral(lit))
                    return String(lit.value);
                if (t.isBooleanLiteral(lit))
                    return String(lit.value);
                return 'any';
            }
            case 'TSArrayType':
                return `${this.extractTypeString(typeNode.elementType)}[]`;
            case 'TSUnionType':
                return typeNode.types.map(tn => this.extractTypeString(tn)).join(' | ') || 'any';
            case 'TSParenthesizedType':
                return `(${this.extractTypeString(typeNode.typeAnnotation)})`;
            case 'TSTypeReference':
                return this.tsTypeNameToString(typeNode.typeName) || 'any';
            case 'TSTypeLiteral':
                return 'object';
            default:
                return 'any';
        }
    }
    unwrapTsTypeAnnotation(typeAnnotation) {
        if (!typeAnnotation)
            return null;
        if (typeAnnotation.type === 'TSTypeAnnotation')
            return typeAnnotation.typeAnnotation ?? null;
        return typeAnnotation;
    }
    tsTypeNameToString(typeName) {
        if (!typeName)
            return '';
        if (typeName.type === 'Identifier')
            return typeName.name;
        if (typeName.type === 'TSQualifiedName') {
            return `${this.tsTypeNameToString(typeName.left)}.${this.tsTypeNameToString(typeName.right)}`;
        }
        return '';
    }
    findJsxReturnsInBabelNode(node) {
        if (!node)
            return [];
        // Стрелочные функции с implicit return
        if (t.isArrowFunctionExpression(node) && (t.isJSXElement(node.body) || t.isJSXFragment(node.body))) {
            return [node.body];
        }
        // Обычные функции
        if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
            if (t.isBlockStatement(node.body)) {
                return this.findJsxReturnsInStatements(node.body.body).map(r => r.jsx);
            }
        }
        // Метод render() класса
        if (t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === 'render') {
            return this.findJsxReturnsInStatements(node.body.body).map(r => r.jsx);
        }
        return [];
    }
    findJsxReturnsInStatements(statements) {
        const found = [];
        const visitStatement = (stmt) => {
            if (!stmt)
                return;
            if (t.isReturnStatement(stmt)) {
                const arg = stmt.argument;
                if (arg && (t.isJSXElement(arg) || t.isJSXFragment(arg))) {
                    const start = typeof stmt.start === 'number'
                        ? stmt.start
                        : typeof arg.start === 'number'
                            ? arg.start
                            : 0;
                    found.push({ start, jsx: arg });
                }
                return;
            }
            if (t.isBlockStatement(stmt)) {
                for (const s of stmt.body)
                    visitStatement(s);
                return;
            }
            if (t.isIfStatement(stmt)) {
                visitStatement(stmt.consequent);
                if (stmt.alternate)
                    visitStatement(stmt.alternate);
                return;
            }
            if (t.isTryStatement(stmt)) {
                visitStatement(stmt.block);
                if (stmt.handler)
                    visitStatement(stmt.handler.body);
                if (stmt.finalizer)
                    visitStatement(stmt.finalizer);
                return;
            }
            if (t.isSwitchStatement(stmt)) {
                for (const c of stmt.cases) {
                    for (const s of c.consequent)
                        visitStatement(s);
                }
                return;
            }
            if (t.isForStatement(stmt) ||
                t.isForInStatement(stmt) ||
                t.isForOfStatement(stmt) ||
                t.isWhileStatement(stmt) ||
                t.isDoWhileStatement(stmt)) {
                visitStatement(stmt.body);
                return;
            }
        };
        for (const stmt of statements)
            visitStatement(stmt);
        return found.sort((a, b) => a.start - b.start);
    }
    isReactComponentBabel(node) {
        if (!node)
            return false;
        // стрелочные функции с JSX
        if (t.isArrowFunctionExpression(node)) {
            if (t.isJSXElement(node.body) || t.isJSXFragment(node.body))
                return true;
            if (t.isBlockStatement(node.body)) {
                return this.findJsxReturnsInStatements(node.body.body).length > 0;
            }
        }
        // обычные функции
        if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
            if (t.isBlockStatement(node.body)) {
                return this.findJsxReturnsInStatements(node.body.body).length > 0;
            }
        }
        // классы
        if (t.isClassDeclaration(node)) {
            const renderMethod = node.body.body.find(m => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'render');
            return !!renderMethod;
        }
        return false;
    }
    parseJsxTree(node, parentId) {
        const opening = 'openingElement' in node ? node.openingElement : null;
        const tagName = opening
            ? t.isJSXIdentifier(opening.name)
                ? opening.name.name
                : t.isJSXMemberExpression(opening.name)
                    ? 'MemberExpr'
                    : 'Fragment'
            : 'Fragment';
        const elementId = (0, utils_1.generateId)(this.relPath, 'element', tagName);
        const block = {
            id: elementId,
            type: 'element',
            astNode: node,
            name: tagName,
            filePath: this.filePath.replace(/\\/g, '/'),
            relPath: this.relPath.replace(/\\/g, '/'),
            sourceCode: this.nodeToString(node),
            startLine: node.loc?.start.line || 0,
            endLine: node.loc?.end.line || 0,
            startCol: node.loc?.start.column || 0,
            endCol: node.loc?.end.column || 0,
            parentId,
            childrenIds: [],
            props: this.extractJsxProps(opening?.attributes || []),
            uses: [],
            usedIn: [],
            metadata: { isFragment: tagName === 'Fragment' },
        };
        node.__visualBlockId = elementId; // и ID в узел
        this.blocks.set(elementId, block);
        this.blocks.get(parentId).childrenIds.push(elementId);
        // Обходим детей
        node.children.forEach(child => {
            if (t.isJSXElement(child) || t.isJSXFragment(child)) {
                this.parseJsxTree(child, elementId);
            }
            else if (t.isJSXText(child) && child.value.trim()) {
                const textId = (0, utils_1.generateId)(this.relPath, 'text');
                const textBlock = {
                    id: textId,
                    type: 'element',
                    name: '#text',
                    astNode: child,
                    filePath: this.filePath.replace(/\\/g, '/'),
                    relPath: this.relPath.replace(/\\/g, '/'),
                    sourceCode: child.value,
                    startLine: child.loc?.start.line || 0,
                    endLine: child.loc?.end.line || 0,
                    startCol: child.loc?.start.column || 0,
                    endCol: child.loc?.end.column || 0,
                    parentId: elementId,
                    childrenIds: [],
                    uses: [],
                    usedIn: [],
                };
                this.blocks.set(textId, textBlock);
                block.childrenIds.push(textId);
            }
            else if (t.isJSXExpressionContainer(child)) {
                if (t.isIdentifier(child.expression)) {
                    const varId = (0, utils_1.generateId)(this.relPath, 'variable', child.expression.name);
                    block.uses.push(varId);
                    // Можно создать блок переменной позже
                }
            }
        });
    }
    extractJsxProps(attrs) {
        const props = {};
        attrs.forEach(attr => {
            if (t.isJSXAttribute(attr)) {
                const name = attr.name.name;
                if (t.isStringLiteral(attr.value)) {
                    props[name] = { type: 'string', value: attr.value.value };
                }
                else if (t.isJSXExpressionContainer(attr.value)) {
                    const expr = attr.value.expression;
                    if (t.isNumericLiteral(expr)) {
                        props[name] = { type: 'number', value: String(expr.value) };
                        return;
                    }
                    if (t.isBooleanLiteral(expr)) {
                        props[name] = { type: 'boolean', value: String(expr.value) };
                        return;
                    }
                    if (t.isStringLiteral(expr)) {
                        props[name] = { type: 'string', value: expr.value };
                        return;
                    }
                    if (t.isIdentifier(expr)) {
                        if (this.objectImportNames.has(expr.name)) {
                            props[name] = { type: 'object', value: expr.name };
                            return;
                        }
                        if (/^[A-Z]/.test(expr.name)) {
                            props[name] = { type: 'component', value: expr.name };
                            return;
                        }
                        props[name] = { type: 'expression', value: expr.name };
                        return;
                    }
                    let exprCode = '<expression>';
                    try {
                        exprCode = (0, generator_1.default)(expr, { jsescOption: { minimal: true } }).code;
                    }
                    catch { }
                    props[name] = { type: 'expression', value: exprCode };
                }
                else {
                    props[name] = { type: 'boolean', value: 'true' };
                }
            }
        });
        return props;
    }
    memberExprToString(expr) {
        const parts = [];
        let e = expr;
        while (t.isMemberExpression(e)) {
            if (t.isIdentifier(e.property))
                parts.unshift(e.property.name);
            e = e.object;
        }
        if (t.isIdentifier(e))
            parts.unshift(e.name);
        return parts.join('.');
    }
    nodeToString(node) {
        if (node.getSourceFile)
            return node.getFullText();
        if (node.start !== undefined && node.end !== undefined) {
            return node.getSourceFile?.()?.getFullText().slice(node.start, node.end) || '';
        }
        return '';
    }
    collectImports(sourceFile) {
        const result = [];
        for (const imp of sourceFile.getImportDeclarations()) {
            const modulePath = imp.getModuleSpecifierValue();
            // default
            const def = imp.getDefaultImport();
            if (def) {
                result.push(`${modulePath}|default|${def.getText()}`);
            }
            // namespace: import * as X
            const ns = imp.getNamespaceImport();
            if (ns) {
                result.push(`${modulePath}|namespace|${ns.getText()}`);
            }
            // named imports
            for (const named of imp.getNamedImports()) {
                const orig = named.getName();
                const alias = named.getAliasNode()?.getText() || orig;
                result.push(`${modulePath}|named|${alias}`);
            }
            // --- добавляем пустые импорты (например CSS) ---
            if (!def && !ns && imp.getNamedImports().length === 0) {
                result.push(`${modulePath}|none|`); // просто помечаем как "none"
            }
        }
        return result;
    }
}
exports.ReactParser = ReactParser;
