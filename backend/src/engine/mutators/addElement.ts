import { VisualBlock } from "../types";

export interface InsertBlockParams {
  blocks: Record<string, VisualBlock>;
  cssBlocks?: Record<string, VisualBlock>;
  parentId: string;
  block: VisualBlock;
  index?: number; // если нет — в конец
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export function insertBlockIntoTree({
  blocks,
  parentId,
  block,
  index,
  startLine,
  startCol,
  endLine,
  endCol,
}: InsertBlockParams): void {
  const parent = blocks[parentId];

  if (!parent) {
    throw new Error(`Parent block ${parentId} not found`);
  }

  if (!parent.childrenIds) {
    parent.childrenIds = [];
  }

  // 1️⃣ Проставляем инициализацию координат
  block.startLine = startLine;
  block.startCol = startCol;
  block.endLine = endLine;
  block.endCol = endCol;

  // 2️⃣ Проставляем родителя
  block.parentId = parentId;

  // 3️⃣ Добавляем блок в глобальную карту
  blocks[block.id] = block;

  // 4️⃣ Вставляем в childrenIds родителя
  if (
    typeof index === 'number' &&
    index >= 0 &&
    index <= parent.childrenIds.length
  ) {
    parent.childrenIds.splice(index, 0, block.id);
  } else {
    parent.childrenIds.push(block.id);
  }
}
