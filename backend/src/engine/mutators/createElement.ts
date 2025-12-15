import { VisualBlock, BlockType } from '../types';
import { generateId } from '../parsers/utils';
import { insertBlockIntoTree } from './addElement';

interface CreateAndInsertBlockParams {
  blocks: Record<string, VisualBlock>;
  cssBlocks?: Record<string, VisualBlock>;

  type: BlockType;
  name: string;

  absPath: string;
  relPath: string;

  parentId: string;
  index?: number;

  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}


export function createAndInsertBlock({
  blocks,
  cssBlocks,
  type,
  name,
  absPath,
  relPath,
  parentId,
  index,
  startLine,
  startCol,
  endLine,
  endCol,
}: CreateAndInsertBlockParams): VisualBlock {
  const id = generateId(relPath, type, name);

  const newBlock: VisualBlock = {
    id,
    type,
    name,
    filePath: absPath.replace(/\\/g, '/'),
    relPath: relPath,
    sourceCode: '',
    startLine,
    startCol,
    endLine,
    endCol,

    parentId,
    childrenIds: [],

    uses: [],
    usedIn: [],
  };

  insertBlockIntoTree({
    blocks,
    cssBlocks,
    parentId,
    block: newBlock,
    index,
    startLine,
    startCol,
    endLine,
    endCol,
  });

  return newBlock;
}
