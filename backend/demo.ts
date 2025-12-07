// demo.ts
import { VisualEngine } from './src/engine/Engine';
import * as path from 'path';
import * as fs from 'fs';
const PROJECT_PATH = path.resolve(__dirname, '../test_project'); 

async function main() {
  console.log('Парсим проект:', PROJECT_PATH);
  const engine = new VisualEngine(PROJECT_PATH);

  try {
    const tree = await engine.loadProject();

    console.log(`Успешно! Найдено блоков: ${Object.keys(tree.blocks).length}`);
    console.log(`Корневых компонентов: ${tree.roots.length}`);

    // --- основной вывод ---
    const safeOutput = {
      stats: {
        totalBlocks: Object.keys(tree.blocks).length,
        roots: tree.roots.length,
        filesProcessed: Array.from(new Set(Object.values(tree.blocks).map(b => b.filePath))).length,
      },
      roots: tree.roots.map(id => ({
        id,
        name: tree.blocks[id].name,
        type: tree.blocks[id].type,
        file: tree.blocks[id].filePath,
      })),
      blocks: tree.blocks,
    };

    const outputPath = path.resolve(__dirname, 'project-structure.json');
    fs.writeFileSync(outputPath, JSON.stringify(safeOutput, null, 2), 'utf-8');
    console.log(`\nСтруктура блоков сохранена в:\n   ${outputPath}`);

    // --- CSS-блоки отдельно ---
    const cssOutput = {
      stats: {
        totalCssBlocks: engine.cssStyles.size,
        filesProcessed: Array.from(new Set(Array.from(engine.cssStyles.values()).map(b => b.filePath))).length,
      },
      blocks: Object.fromEntries(engine.cssStyles),
    };
    const cssOutputPath = path.resolve(__dirname, 'project-css.json');
    fs.writeFileSync(cssOutputPath, JSON.stringify(cssOutput, null, 2), 'utf-8');
    console.log(`Структура CSS блоков сохранена в:\n   ${cssOutputPath}`);

    console.log('\nПервые 10 корневых элементов:');
    safeOutput.roots.slice(0, 10).forEach((r: any) => {
      console.log(`  • ${r.name} → ${r.file}`);
    });

  } catch (err) {
    console.error('Критическая ошибка:', err);
  }
}


main();