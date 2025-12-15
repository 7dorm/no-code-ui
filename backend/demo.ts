// demo.ts
import { VisualEngine } from './src/engine/Engine';
import * as path from 'path';
import * as fs from 'fs';

type DemoProject = {
  name: string;
  rootPath: string;
};

function findBackendRoot(): string {
  // Если запускаем TS напрямую из `backend/`, то `test_project` лежит рядом с demo.ts.
  // Если запускаем скомпилированный JS из `backend/dist` или `backend/.tmp-*/`,
  // то `test_project` лежит на директорию выше.
  const direct = path.resolve(__dirname);
  if (fs.existsSync(path.join(direct, 'test_project'))) return direct;

  const parent = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(parent, 'test_project'))) return parent;

  return direct;
}

function resolveProjectArg(arg: string, backendRoot: string): DemoProject {
  const normalized = arg.trim();
  const name = normalized.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'project';

  const wellKnown = new Map<string, string>([
    ['test_project', path.join(backendRoot, 'test_project')],
    ['test_project1', path.join(backendRoot, 'test_project1')],
    ['test_project2', path.join(backendRoot, 'test_project2')],
  ]);

  const knownPath = wellKnown.get(normalized);
  if (knownPath) return { name: normalized, rootPath: knownPath };

  const abs =
    path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
  return { name, rootPath: abs };
}

async function parseAndWrite(project: DemoProject, outDir: string) {
  const start = Date.now();
  console.log(`\n=== ${project.name} ===`);
  console.log('Проект:', project.rootPath);

  const engine = new VisualEngine(project.rootPath);
  const tree = await engine.loadProject();

  const ms = Date.now() - start;
  const totalBlocks = Object.keys(tree.blocks).length;
  const filesProcessed = new Set(Object.values(tree.blocks).map(b => b.filePath)).size;
  const cssFilesProcessed = new Set(Array.from(engine.cssStyles.values()).map(b => b.filePath))
    .size;

  console.log(`Успешно! time=${ms}ms blocks=${totalBlocks} roots=${tree.roots.length}`);
  console.log(`filesProcessed=${filesProcessed} cssBlocks=${engine.cssStyles.size} cssFiles=${cssFilesProcessed}`);

  const structureOutput = {
    stats: {
      totalBlocks,
      roots: tree.roots.length,
      filesProcessed,
      timeMs: ms,
    },
    roots: tree.roots.map(id => ({
      id,
      name: tree.blocks[id]?.name,
      type: tree.blocks[id]?.type,
      file: tree.blocks[id]?.filePath,
    })),
    blocks: tree.blocks,
  };

  const cssOutput = {
    stats: {
      totalCssBlocks: engine.cssStyles.size,
      filesProcessed: cssFilesProcessed,
    },
    blocks: Object.fromEntries(engine.cssStyles),
  };

  fs.mkdirSync(outDir, { recursive: true });
  const structurePath = path.join(outDir, `${project.name}-structure.json`);
  const cssPath = path.join(outDir, `${project.name}-css.json`);

  fs.writeFileSync(structurePath, JSON.stringify(structureOutput, null, 2), 'utf-8');
  fs.writeFileSync(cssPath, JSON.stringify(cssOutput, null, 2), 'utf-8');

  console.log('JSON сохранены:');
  console.log(' -', structurePath);
  console.log(' -', cssPath);

  console.log('Первые 10 roots:');
  structureOutput.roots.slice(0, 10).forEach(r => {
    console.log(`  • ${r.name} → ${r.file}`);
  });
}

async function main() {
  const backendRoot = findBackendRoot();
  const outDir = path.join(backendRoot, 'demo-output');

  const args = process.argv.slice(2).filter(a => a.trim().length > 0);
  const projects: DemoProject[] =
    args.length > 0
      ? args.map(a => resolveProjectArg(a, backendRoot))
      : [
          { name: 'test_project', rootPath: path.join(backendRoot, 'test_project') },
          { name: 'test_project1', rootPath: path.join(backendRoot, 'test_project1') },
          { name: 'test_project2', rootPath: path.join(backendRoot, 'test_project2') },
        ];

  console.log('Backend root:', backendRoot);
  console.log('Output dir:', outDir);

  for (const project of projects) {
    try {
      await parseAndWrite(project, outDir);
    } catch (err) {
      console.error(`\n[${project.name}] Критическая ошибка:`, err);
    }
  }
}

main();
