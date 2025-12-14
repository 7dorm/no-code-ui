// demo.ts
import { VisualEngine } from './src/engine/Engine';
import {removeBlockFromDisk} from './src/engine/Files/delete'
import * as path from 'path';
import * as fs from 'fs';
import { removeBlockAndCleanup } from './src/engine/mutators/deleteBlock';
import { insertTextToFile } from './src/engine/Files/add';
const PROJECT_PATH = path.resolve(__dirname, '../test_project'); 
console.log(PROJECT_PATH)
async function main() {
  console.log('Парсим проект:', PROJECT_PATH);
  const engine = new VisualEngine(PROJECT_PATH);

  try {
    const tree = await engine.loadProject();

    console.log(`Успешно! Найдено блоков: ${Object.keys(tree.blocks).length}`);
    console.log(`Корневых компонентов: ${tree.roots.length}`);

    //removeBlockAndCleanup(tree.blocks, "src_components_Card_tsx__element__div_14")
    insertTextToFile('./test_project/src/components/Card.tsx', "\n<Header />", 15, 9)

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