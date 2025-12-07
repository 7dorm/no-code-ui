// src/engine/mutators/moveBlock.ts
import { Node, SyntaxKind } from 'ts-morph';
import { VisualBlock } from '../types';
import { findJsxNodeById } from '../parsers/utils';

export async function moveBlock(
  projectBlocks: Map<string, VisualBlock>,
  blockId: string,
  newParentId: string,
  index?: number
): Promise<void> {
  const block = projectBlocks.get(blockId);
  const newParent = projectBlocks.get(newParentId);
  if (!block || !newParent || block.filePath !== newParent.filePath) {
    throw new Error('Cannot move block: invalid block or different file');
  }

  // Только для JSX/HTML-элементов
  if (!block.parentId || !['element', 'html-element'].includes(block.type)) return;

  const sourceFile = block.filePath;
  const sf = block.filePath.includes('.html')
    ? require('fs').readFileSync(sourceFile, 'utf-8')
    : projectBlocks.get(block.parentId!)!.filePath; // у родителя тот же файл

  // Пока реализуем только для .tsx/.jsx (самое важное)
  if (!sourceFile.endsWith('.tsx') && !sourceFile.endsWith('.jsx')) {
    console.warn('moveBlock: HTML пока не поддерживается');
    return;
  }

  const project = (global as any)._tsMorphProject || require('ts-morph').Project;
  const source = project.getSourceFile(sourceFile);
  if (!source) throw new Error('Source file not found');

  // Находим JSX-узел по ID (сохраняем в metadata при парсинге)
  const jsxNode = findJsxNodeById(source, blockId);
  if (!jsxNode) throw new Error('JSX node not found');

  const parentNode = findJsxNodeById(source, newParentId);
  if (!parentNode) throw new Error('New parent not found');

  const children = parentNode.getChildrenOfKind(SyntaxKind.JsxElement);
  const fragmentChildren = parentNode.getChildrenOfKind(SyntaxKind.JsxFragment);

  const targetArray = children.length > 0 ? children : fragmentChildren.length > 0 ? fragmentChildren[0].getChildren() : parentNode.getChildren();

  // Удаляем из старого места
  jsxNode.remove();

  // Вставляем в новое
  if (typeof index === 'number' && index < targetArray.length) {
    targetArray[index].insertSiblingBefore(jsxNode);
  } else {
    parentNode.addChild(jsxNode);
  }

  // Обновляем связи в памяти
  const oldParent = projectBlocks.get(block.parentId)!;
  oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== blockId);
  block.parentId = newParentId;
  newParent.childrenIds.splice(index ?? newParent.childrenIds.length, 0, blockId);

  await source.save();
}