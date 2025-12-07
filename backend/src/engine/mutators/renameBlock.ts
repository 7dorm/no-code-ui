// src/engine/mutators/renameBlock.ts
import { Node } from 'ts-morph';
import { VisualBlock } from '../types';

export async function renameBlock(
  projectBlocks: Map<string, VisualBlock>,
  blockId: string,
  newName: string
): Promise<void> {
  const block = projectBlocks.get(blockId);
  if (!block || block.type !== 'component') return;

  const sourceFile = block.filePath;
  if (!sourceFile.match(/\.(tsx|jsx|ts|js)$/)) return;

  const project = (global as any)._tsMorphProject || require('ts-morph').Project;
  const source = project.getSourceFile(sourceFile);
  if (!source) return;

  // Находим объявление компонента
  const componentNode = source.getFunction(block.name) || source.getVariableDeclaration(block.name);
  if (!componentNode) return;

  // Переименовываем
  componentNode.rename(newName);

  // Обновляем все импорты/экспорты автоматически (ts-morph делает это сам!)
  block.name = newName;

  await source.save();
}