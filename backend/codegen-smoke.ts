import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseArgs } from 'node:util';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

import { updateBlockPropInFile } from './src/engine/Files/editParams';
import { updateCssPropertyInFile } from './src/engine/Files/updateCss';
import { createTsxComponent } from './src/engine/Files/createFile';
import { insertTextToFile } from './src/engine/Files/add';
import { removeFragmentFromFile } from './src/engine/Files/delete';
import { CssParser } from './src/engine/parsers/CssParser';
import type { VisualBlock } from './src/engine/types';

type Args = {
  tsx?: string;
  css?: string;
  file?: string;
  out?: string;
  createDir?: string;
  cssClass?: string;
  jsxTag?: string;
  inPlace: boolean;
  keep: boolean;
  help: boolean;
};

function printHelp(): void {
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

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function findBackendRoot(): string {
  const direct = path.resolve(__dirname);
  if (fs.existsSync(path.join(direct, 'test_project'))) return direct;

  const parent = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(parent, 'test_project'))) return parent;

  return direct;
}

function ensureFileExists(filePath: string, label: string): void {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`${label}: файл не найден: ${abs}`);
  }
}

function ensureDirExists(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyToWorkDir(srcPath: string, workDir: string): string {
  const absSrc = path.resolve(srcPath);
  const dest = path.join(workDir, path.basename(absSrc));
  fs.copyFileSync(absSrc, dest);
  return dest;
}

function parseFirstJsxOpeningLoc(
  filePath: string,
  jsxTag?: string
): { startLine: number; startCol: number } {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = parse(source, {
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

  let found: { startLine: number; startCol: number } | null = null;

  traverse(ast, {
    JSXOpeningElement(p) {
      if (found) return;
      const node = p.node;
      if (!node.loc) return;

      let tagName: string | null = null;
      if (t.isJSXIdentifier(node.name)) tagName = node.name.name;
      else if (t.isJSXMemberExpression(node.name)) {
        let obj: any = node.name.object;
        while (t.isJSXMemberExpression(obj)) obj = obj.object;
        if (t.isJSXIdentifier(obj)) tagName = obj.name;
      }

      if (jsxTag && tagName !== jsxTag) return;

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

function parseFirstJsxAttrValue(
  filePath: string,
  attrName: string
): string | null {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = parse(source, {
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

  let value: string | null = null;

  traverse(ast, {
    JSXOpeningElement(p) {
      if (value !== null) return;
      for (const attr of p.node.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        if (!t.isJSXIdentifier(attr.name)) continue;
        if (attr.name.name !== attrName) continue;

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
          if (t.isStringLiteral(expr)) value = expr.value;
          else if (t.isNumericLiteral(expr)) value = String(expr.value);
          else if (t.isBooleanLiteral(expr)) value = String(expr.value);
          else {
            try {
              value = '<expression>';
            } catch {
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

function parseCssBlocks(filePath: string): VisualBlock[] {
  const blocks = new Map<string, VisualBlock>();
  const relPath = path.basename(filePath);
  new CssParser(filePath, relPath, blocks).parse(filePath);
  return [...blocks.values()];
}

function pickCssClassBlock(blocks: VisualBlock[], className?: string): VisualBlock {
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
    const ai = typeof a.metadata?.ruleStartIndex === 'number' ? a.metadata.ruleStartIndex : a.startLine * 1_000_000 + a.startCol;
    const bi = typeof b.metadata?.ruleStartIndex === 'number' ? b.metadata.ruleStartIndex : b.startLine * 1_000_000 + b.startCol;
    return ai - bi;
  });

  return sorted[sorted.length - 1];
}

function buildDummyBlockForUpdate(
  filePath: string,
  loc: { startLine: number; startCol: number }
): VisualBlock {
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

function parseCliArgs(): Args {
  const { values } = parseArgs({
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
    createDir: (values as any)['create-dir'],
    cssClass: (values as any)['css-class'],
    jsxTag: (values as any)['jsx-tag'],
    inPlace: Boolean((values as any)['in-place']),
    keep: Boolean(values.keep),
    help: Boolean(values.help),
  };
}

function createWorkDir(args: Args, backendRoot: string): { workDir: string; tempDir?: string } {
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
    const created = createTsxComponent(createDir, 'CodexWidget');
    assert(fs.existsSync(created.path), 'createTsxComponent: файл не создан');
    assert(created.line > 0 && created.column >= 0, 'createTsxComponent: неверные координаты');

    // eslint-disable-next-line no-console
    console.log('OK createTsxComponent ->', created.path);

    // ---------------- insertTextToFile (на созданном файле) ----------------
    const marker = '<div data-codex-smoke="1" />\n';
    insertTextToFile(created.path, marker, created.line, created.column);
    const createdText = fs.readFileSync(created.path, 'utf8');
    assert(createdText.includes('data-codex-smoke="1"'), 'insertTextToFile: вставка в созданный файл не сработала');
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
    const pos = insertTextToFile(filePath, marker, insertLine, insertColumn);
    assert.equal(pos.insertLine, insertLine);
    assert.equal(pos.insertColumn, insertColumn);

    const afterInsert = fs.readFileSync(filePath, 'utf8');
    assert(afterInsert.includes(marker), 'insertTextToFile: маркер не найден после вставки');
    // eslint-disable-next-line no-console
    console.log('OK insertTextToFile (target file)');

    const removed = removeFragmentFromFile(filePath, insertLine, 0, insertLine, marker.length);
    assert.equal(removed.removedCode, marker, 'removeFragmentFromFile: удалённый код не совпал с маркером');
    assert.equal(removed.insertLine, insertLine);
    assert.equal(removed.insertColumn, 0);

    const afterRemove = fs.readFileSync(filePath, 'utf8');
    assert.equal(afterRemove.includes(marker), false, 'removeFragmentFromFile: маркер остался в файле');
    // eslint-disable-next-line no-console
    console.log('OK removeFragmentFromFile');
  }

  // ---------------- updateBlockPropInFile ----------------
  {
    const attrName = 'data-codex-smoke';

    const loc1 = parseFirstJsxOpeningLoc(tsxPath, args.jsxTag);
    const dummy1 = buildDummyBlockForUpdate(tsxPath, loc1);
    updateBlockPropInFile(dummy1, attrName, 'codex');

    const v1 = parseFirstJsxAttrValue(tsxPath, attrName);
    assert.equal(v1, 'codex', 'updateBlockPropInFile: не добавился атрибут или неверное значение');
    // eslint-disable-next-line no-console
    console.log('OK updateBlockPropInFile (add attr)');

    // Обновляем значение (пересчитываем координаты заново)
    const loc2 = parseFirstJsxOpeningLoc(tsxPath, args.jsxTag);
    const dummy2 = buildDummyBlockForUpdate(tsxPath, loc2);
    updateBlockPropInFile(dummy2, attrName, 'codex2');

    const v2 = parseFirstJsxAttrValue(tsxPath, attrName);
    assert.equal(v2, 'codex2', 'updateBlockPropInFile: не обновилось значение атрибута');
    // eslint-disable-next-line no-console
    console.log('OK updateBlockPropInFile (update attr)');
  }

  // ---------------- updateCssPropertyInFile ----------------
  {
    const beforeBlocks = parseCssBlocks(cssPath);
    const target = pickCssClassBlock(beforeBlocks, args.cssClass);

    const propName = '--codex-smoke';
    updateCssPropertyInFile(target, propName, '1');
    updateCssPropertyInFile(target, propName, '2'); // повторный вызов тем же блоком (координаты могли устареть)

    const afterBlocks = parseCssBlocks(cssPath);
    const className = args.cssClass ?? target.name;
    const afterTarget = pickCssClassBlock(afterBlocks, className);

    assert.match(
      afterTarget.sourceCode,
      /--codex-smoke:\s*2\s*;/,
      'updateCssPropertyInFile: свойство не появилось/не обновилось'
    );
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

