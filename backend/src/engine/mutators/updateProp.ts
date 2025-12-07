// src/engine/mutators/updateProp.ts
import { JsxAttribute, Node } from 'ts-morph';
import { VisualBlock } from '../types';
import { findJsxNodeById } from '../parsers/utils';

export async function updateProp(
  projectBlocks: Map<string, VisualBlock>,
  blockId: string,
  propName: string,
  newValue: string
): Promise<void> {
  const block = projectBlocks.get(blockId);
  if (!block || !['element', 'html-element'].includes(block.type)) return;

  const sourceFile = block.filePath;
  if (!sourceFile.match(/\.(tsx|jsx)$/)) return;

  const project = (global as any)._tsMorphProject || require('ts-morph').Project;
  const source = project.getSourceFile(sourceFile);
  if (!source) return;

  const jsxNode = findJsxNodeById(source, blockId);
  if (!jsxNode) return;

  let attr = jsxNode.getAttribute(propName);
  if (!attr) {
    jsxNode.addAttribute({
      name: propName,
      initializer: `"${newValue}"`,
    });
  } else if (Node.isJsxAttribute(attr)) {
    const initializer = attr.getInitializer();
    if (initializer) {
      initializer.replaceWithText(`"${newValue}"`);
    } else {
      attr.setInitializer(`"${newValue}"`);
    }
  }

  // Обновляем в памяти
  if (block.props?.[propName]) {
    block.props[propName].value = newValue;
  }

  await source.save();
}