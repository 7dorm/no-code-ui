// src/engine/mutators/deleteBlock.ts
import { Node } from 'ts-morph';
import { VisualBlock } from '../types';
import { findJsxNodeById } from '../parsers/utils';

export async function deleteBlock(
  projectBlocks: Map<string, VisualBlock>,
  blockId: string
): Promise<void> {
  const block = projectBlocks.get(blockId);
  if (!block || !block.parentId) return;

  if (block.usedIn.length > 0) {
    console.warn(`Block ${block.name} используется в ${block.usedIn.length} местах. Удаление отменено.`);
    return;
  }

  const sourceFile = block.filePath;
  if (!sourceFile.match(/\.(tsx|jsx)$/)) return;

  const project = (global as any)._tsMorphProject || require('ts-morph').Project;
  const source = project.getSourceFile(sourceFile);
  if (!source) return;

  const jsxNode = findJsxNodeById(source, blockId);
  if (!jsxNode) return;

  jsxNode.remove();

  // Удаляем связи
  const parent = projectBlocks.get(block.parentId)!;
  parent.childrenIds = parent.childrenIds.filter(id => id !== blockId);
  projectBlocks.delete(blockId);

  await source.save();
}