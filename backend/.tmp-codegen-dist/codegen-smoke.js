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
const strict_1 = __importDefault(require("node:assert/strict"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const node_util_1 = require("node:util");
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const t = __importStar(require("@babel/types"));
const editParams_1 = require("./src/engine/Files/editParams");
const updateCss_1 = require("./src/engine/Files/updateCss");
const createFile_1 = require("./src/engine/Files/createFile");
const add_1 = require("./src/engine/Files/add");
const delete_1 = require("./src/engine/Files/delete");
const CssParser_1 = require("./src/engine/parsers/CssParser");
function printHelp() {
    // eslint-disable-next-line no-console
    console.log(`
codegen-smoke: ручной "smoke test" для функций Files (кодоген/правки файлов).

Запуск (рекомендуется):
  npm -C no-code-ui run codegen:smoke -- --tsx <file.tsx|file.jsx> --css <file.css>

Опции:
  --tsx        Путь до TSX/JSX файла для updateBlockPropInFile
  --css        Путь до CSS файла для updateCssPropertyInFile
  --file       Путь до любого текстового файла для insertTextToFile/removeFragmentFromFile
              (если не указан — берём --tsx)
  --css-class  Имя класса (без точки) для CSS теста (по умолчанию берём последний найденный)
  --jsx-tag    Имя JSX тега для updateBlockPropInFile (например div, Card). По умолчанию первый.
  --create-dir Папка для createTsxComponent (по умолчанию временная)
  --out        Папка, куда писать рабочие копии (по умолчанию backend/demo-output/codegen-smoke-*)
  --in-place   Работать с оригинальными файлами (ОСТОРОЖНО: изменяет файлы)
  --keep       Не удалять временную папку (актуально если out не задан)
  --help       Показать эту справку

Пример (на test_project2):
  npm -C no-code-ui run codegen:smoke -- \\
    --tsx backend/test_project2/src/components/Card.tsx \\
    --css backend/test_project2/src/styles/card.css
`);
}
function normalizePath(p) {
    return p.replace(/\\/g, '/');
}
function findBackendRoot() {
    const direct = path.resolve(__dirname);
    if (fs.existsSync(path.join(direct, 'test_project')))
        return direct;
    const parent = path.resolve(__dirname, '..');
    if (fs.existsSync(path.join(parent, 'test_project')))
        return parent;
    return direct;
}
function ensureFileExists(filePath, label) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        throw new Error(`${label}: файл не найден: ${abs}`);
    }
}
function ensureDirExists(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}
function copyToWorkDir(srcPath, workDir) {
    const absSrc = path.resolve(srcPath);
    const dest = path.join(workDir, path.basename(absSrc));
    fs.copyFileSync(absSrc, dest);
    return dest;
}
function parseFirstJsxOpeningLoc(filePath, jsxTag) {
    const source = fs.readFileSync(filePath, 'utf8');
    const ast = (0, parser_1.parse)(source, {
        sourceType: 'module',
        plugins: [
            'jsx',
            'typescript',
            'classProperties',
            'decorators-legacy',
            'optionalChaining',
            'nullishCoalescingOperator',
        ],
    });
    let found = null;
    (0, traverse_1.default)(ast, {
        JSXOpeningElement(p) {
            if (found)
                return;
            const node = p.node;
            if (!node.loc)
                return;
            let tagName = null;
            if (t.isJSXIdentifier(node.name))
                tagName = node.name.name;
            else if (t.isJSXMemberExpression(node.name)) {
                let obj = node.name.object;
                while (t.isJSXMemberExpression(obj))
                    obj = obj.object;
                if (t.isJSXIdentifier(obj))
                    tagName = obj.name;
            }
            if (jsxTag && tagName !== jsxTag)
                return;
            found = {
                startLine: node.loc.start.line,
                startCol: node.loc.start.column,
            };
            p.stop();
        },
    });
    if (!found) {
        const hint = jsxTag ? ` (не найден тег ${jsxTag})` : '';
        throw new Error(`updateBlockPropInFile: в файле нет JSXOpeningElement${hint}: ${filePath}`);
    }
    return found;
}
function parseFirstJsxAttrValue(filePath, attrName) {
    const source = fs.readFileSync(filePath, 'utf8');
    const ast = (0, parser_1.parse)(source, {
        sourceType: 'module',
        plugins: [
            'jsx',
            'typescript',
            'classProperties',
            'decorators-legacy',
            'optionalChaining',
            'nullishCoalescingOperator',
        ],
    });
    let value = null;
    (0, traverse_1.default)(ast, {
        JSXOpeningElement(p) {
            if (value !== null)
                return;
            for (const attr of p.node.attributes) {
                if (!t.isJSXAttribute(attr))
                    continue;
                if (!t.isJSXIdentifier(attr.name))
                    continue;
                if (attr.name.name !== attrName)
                    continue;
                if (!attr.value) {
                    value = 'true';
                    p.stop();
                    return;
                }
                if (t.isStringLiteral(attr.value)) {
                    value = attr.value.value;
                    p.stop();
                    return;
                }
                if (t.isJSXExpressionContainer(attr.value)) {
                    const expr = attr.value.expression;
                    if (t.isStringLiteral(expr))
                        value = expr.value;
                    else if (t.isNumericLiteral(expr))
                        value = String(expr.value);
                    else if (t.isBooleanLiteral(expr))
                        value = String(expr.value);
                    else {
                        try {
                            value = '<expression>';
                        }
                        catch {
                            value = '<expression>';
                        }
                    }
                    p.stop();
                    return;
                }
                value = '<unknown>';
                p.stop();
                return;
            }
        },
    });
    return value;
}
function parseCssBlocks(filePath) {
    const blocks = new Map();
    const relPath = path.basename(filePath);
    new CssParser_1.CssParser(filePath, relPath, blocks).parse(filePath);
    return [...blocks.values()];
}
function pickCssClassBlock(blocks, className) {
    const cssBlocks = blocks.filter(b => b.type === 'css-class');
    if (cssBlocks.length === 0) {
        throw new Error(`updateCssPropertyInFile: в CSS не найдено ни одного класса: ${className ?? ''}`);
    }
    const candidates = className ? cssBlocks.filter(b => b.name === className) : cssBlocks;
    if (candidates.length === 0) {
        throw new Error(`updateCssPropertyInFile: класс не найден: .${className}`);
    }
    // Берём последний rule (ближе к концу файла) — менее “случайно”.
    const sorted = [...candidates].sort((a, b) => {
        const ai = typeof a.metadata?.ruleStartIndex === 'number' ? a.metadata.ruleStartIndex : a.startLine * 1000000 + a.startCol;
        const bi = typeof b.metadata?.ruleStartIndex === 'number' ? b.metadata.ruleStartIndex : b.startLine * 1000000 + b.startCol;
        return ai - bi;
    });
    return sorted[sorted.length - 1];
}
function buildDummyBlockForUpdate(filePath, loc) {
    return {
        id: 'codex-smoke',
        type: 'element',
        name: 'element',
        filePath: normalizePath(filePath),
        relPath: normalizePath(path.basename(filePath)),
        sourceCode: '',
        startLine: loc.startLine,
        endLine: loc.startLine,
        startCol: loc.startCol,
        endCol: loc.startCol,
        childrenIds: [],
        uses: [],
        usedIn: [],
    };
}
function parseCliArgs() {
    const { values } = (0, node_util_1.parseArgs)({
        args: process.argv.slice(2),
        options: {
            tsx: { type: 'string' },
            css: { type: 'string' },
            file: { type: 'string' },
            out: { type: 'string' },
            'create-dir': { type: 'string' },
            'css-class': { type: 'string' },
            'jsx-tag': { type: 'string' },
            'in-place': { type: 'boolean' },
            keep: { type: 'boolean' },
            help: { type: 'boolean' },
        },
        allowPositionals: true,
    });
    return {
        tsx: values.tsx,
        css: values.css,
        file: values.file,
        out: values.out,
        createDir: values['create-dir'],
        cssClass: values['css-class'],
        jsxTag: values['jsx-tag'],
        inPlace: Boolean(values['in-place']),
        keep: Boolean(values.keep),
        help: Boolean(values.help),
    };
}
function createWorkDir(args, backendRoot) {
    if (args.out) {
        const abs = path.resolve(args.out);
        ensureDirExists(abs);
        return { workDir: abs };
    }
    const base = path.join(backendRoot, 'demo-output');
    ensureDirExists(base);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const workDir = path.join(base, `codegen-smoke-${stamp}`);
    ensureDirExists(workDir);
    return { workDir };
}
async function main() {
    const args = parseCliArgs();
    if (args.help) {
        printHelp();
        return;
    }
    const backendRoot = findBackendRoot();
    const defaultTsx = path.join(backendRoot, 'test_project2', 'src', 'components', 'Card.tsx');
    const defaultCss = path.join(backendRoot, 'test_project2', 'src', 'styles', 'card.css');
    const tsxInput = args.tsx ? path.resolve(args.tsx) : defaultTsx;
    const cssInput = args.css ? path.resolve(args.css) : defaultCss;
    const fileInput = args.file ? path.resolve(args.file) : tsxInput;
    ensureFileExists(tsxInput, '--tsx');
    ensureFileExists(cssInput, '--css');
    ensureFileExists(fileInput, '--file');
    const { workDir } = createWorkDir(args, backendRoot);
    // eslint-disable-next-line no-console
    console.log('workDir:', workDir);
    // eslint-disable-next-line no-console
    console.log('inPlace:', args.inPlace);
    const tsxPath = args.inPlace ? tsxInput : copyToWorkDir(tsxInput, workDir);
    const cssPath = args.inPlace ? cssInput : copyToWorkDir(cssInput, workDir);
    const filePath = args.inPlace ? fileInput : copyToWorkDir(fileInput, workDir);
    // ---------------- createTsxComponent ----------------
    {
        const createDir = args.createDir
            ? args.inPlace
                ? path.resolve(args.createDir)
                : path.join(workDir, path.basename(args.createDir))
            : path.join(workDir, 'components');
        ensureDirExists(createDir);
        const created = (0, createFile_1.createTsxComponent)(createDir, 'CodexWidget');
        (0, strict_1.default)(fs.existsSync(created.path), 'createTsxComponent: файл не создан');
        (0, strict_1.default)(created.line > 0 && created.column >= 0, 'createTsxComponent: неверные координаты');
        // eslint-disable-next-line no-console
        console.log('OK createTsxComponent ->', created.path);
        // ---------------- insertTextToFile (на созданном файле) ----------------
        const marker = '<div data-codex-smoke="1" />\n';
        (0, add_1.insertTextToFile)(created.path, marker, created.line, created.column);
        const createdText = fs.readFileSync(created.path, 'utf8');
        (0, strict_1.default)(createdText.includes('data-codex-smoke="1"'), 'insertTextToFile: вставка в созданный файл не сработала');
        // eslint-disable-next-line no-console
        console.log('OK insertTextToFile (created file)');
    }
    // ---------------- insertTextToFile + removeFragmentFromFile (по пути до файла) ----------------
    {
        const original = fs.readFileSync(filePath, 'utf8');
        const lines = original.split(/\r?\n/);
        const marker = '/* CODEGEN_SMOKE_INSERT */';
        const insertLine = lines.length + 1;
        const insertColumn = 0;
        const pos = (0, add_1.insertTextToFile)(filePath, marker, insertLine, insertColumn);
        strict_1.default.equal(pos.insertLine, insertLine);
        strict_1.default.equal(pos.insertColumn, insertColumn);
        const afterInsert = fs.readFileSync(filePath, 'utf8');
        (0, strict_1.default)(afterInsert.includes(marker), 'insertTextToFile: маркер не найден после вставки');
        // eslint-disable-next-line no-console
        console.log('OK insertTextToFile (target file)');
        const removed = (0, delete_1.removeFragmentFromFile)(filePath, insertLine, 0, insertLine, marker.length);
        strict_1.default.equal(removed.removedCode, marker, 'removeFragmentFromFile: удалённый код не совпал с маркером');
        strict_1.default.equal(removed.insertLine, insertLine);
        strict_1.default.equal(removed.insertColumn, 0);
        const afterRemove = fs.readFileSync(filePath, 'utf8');
        strict_1.default.equal(afterRemove.includes(marker), false, 'removeFragmentFromFile: маркер остался в файле');
        // eslint-disable-next-line no-console
        console.log('OK removeFragmentFromFile');
    }
    // ---------------- updateBlockPropInFile ----------------
    {
        const attrName = 'data-codex-smoke';
        const loc1 = parseFirstJsxOpeningLoc(tsxPath, args.jsxTag);
        const dummy1 = buildDummyBlockForUpdate(tsxPath, loc1);
        (0, editParams_1.updateBlockPropInFile)(dummy1, attrName, 'codex');
        const v1 = parseFirstJsxAttrValue(tsxPath, attrName);
        strict_1.default.equal(v1, 'codex', 'updateBlockPropInFile: не добавился атрибут или неверное значение');
        // eslint-disable-next-line no-console
        console.log('OK updateBlockPropInFile (add attr)');
        // Обновляем значение (пересчитываем координаты заново)
        const loc2 = parseFirstJsxOpeningLoc(tsxPath, args.jsxTag);
        const dummy2 = buildDummyBlockForUpdate(tsxPath, loc2);
        (0, editParams_1.updateBlockPropInFile)(dummy2, attrName, 'codex2');
        const v2 = parseFirstJsxAttrValue(tsxPath, attrName);
        strict_1.default.equal(v2, 'codex2', 'updateBlockPropInFile: не обновилось значение атрибута');
        // eslint-disable-next-line no-console
        console.log('OK updateBlockPropInFile (update attr)');
    }
    // ---------------- updateCssPropertyInFile ----------------
    {
        const beforeBlocks = parseCssBlocks(cssPath);
        const target = pickCssClassBlock(beforeBlocks, args.cssClass);
        const propName = '--codex-smoke';
        (0, updateCss_1.updateCssPropertyInFile)(target, propName, '1');
        (0, updateCss_1.updateCssPropertyInFile)(target, propName, '2'); // повторный вызов тем же блоком (координаты могли устареть)
        const afterBlocks = parseCssBlocks(cssPath);
        const className = args.cssClass ?? target.name;
        const afterTarget = pickCssClassBlock(afterBlocks, className);
        strict_1.default.match(afterTarget.sourceCode, /--codex-smoke:\s*2\s*;/, 'updateCssPropertyInFile: свойство не появилось/не обновилось');
        // eslint-disable-next-line no-console
        console.log('OK updateCssPropertyInFile');
    }
    // eslint-disable-next-line no-console
    console.log('\nDONE: все smoke-тесты прошли');
    // eslint-disable-next-line no-console
    console.log('Результаты/копии файлов:', workDir);
}
main().catch(err => {
    // eslint-disable-next-line no-console
    console.error('FAILED:', err);
    process.exitCode = 1;
});
