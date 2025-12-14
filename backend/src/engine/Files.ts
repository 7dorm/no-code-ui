import { VisualBlock } from "./types";

function isDeletable(block: VisualBlock): boolean {
  return block.type !== 'component';
}

function getParentComponent(
  blocks: Record<string, VisualBlock>,
  startId: string
): VisualBlock | null {
  let current = blocks[startId];
  while (current?.parentId) {
    const parent = blocks[current.parentId];
    if (!parent) break;
    if (parent.type === 'component') return parent;
    current = parent;
  }
  return null;
}

function collectSubtree(
  blocks: Record<string, VisualBlock>,
  rootId: string
): Set<string> {
  const result = new Set<string>();

  function dfs(id: string) {
    const block = blocks[id];
    if (!block) return;

    result.add(id);
    for (const childId of block.childrenIds) {
      dfs(childId);
    }
  }

  dfs(rootId);
  return result;
}

export function removeBlockAndCleanup(
  blocks: Record<string, VisualBlock>,
  rootId: string
): {
  removedBlockIds: string[];
  cleanedImports: Record<string, string[]>;
} {
  const subtree = collectSubtree(blocks, rootId);

  const rootBlock = blocks[rootId];
  if (!rootBlock) {
    throw new Error(`Block ${rootId} not found`);
  }

  const parentComponent = getParentComponent(blocks, rootId);
  if (!parentComponent) {
    throw new Error(`Parent component not found for ${rootId}`);
  }

  // 1️⃣ Найти компоненты, используемые в поддереве
  const usedComponents = new Set<string>();

  for (const id of subtree) {
    const block = blocks[id];
    if (!block) continue;

    for (const usedId of block.uses ?? []) {
      const usedBlock = blocks[usedId];
      if (usedBlock?.type === 'component') {
        usedComponents.add(usedId);
      }
    }
  }

  // 2️⃣ Определить, какие компоненты используются ТОЛЬКО в поддереве
  const removableImports = new Set<string>();

  for (const compId of usedComponents) {
    const comp = blocks[compId];
    if (!comp) continue;

    const usedOutside = comp.usedIn?.some(
      usageId => !subtree.has(usageId)
    );

    if (!usedOutside) {
      removableImports.add(comp.name);
    }
  }

  // 3️⃣ Почистить импорты в родительском компоненте
  const cleanedImports: Record<string, string[]> = {};

  if (parentComponent.imports) {
    const before = [...parentComponent.imports];

    parentComponent.imports = parentComponent.imports.filter(imp => {
      const [, , localName] = imp.split('|');
      return !removableImports.has(localName);
    });

    cleanedImports[parentComponent.id] = before.filter(
      imp => !parentComponent.imports!.includes(imp)
    );
  }

  // 4️⃣ Удалить блоки (кроме компонентов)
  const removedBlockIds: string[] = [];

  for (const id of subtree) {
    const block = blocks[id];
    if (!block) continue;

    if (isDeletable(block)) {
      delete blocks[id];
      removedBlockIds.push(id);
    }
  }

  // 5️⃣ Почистить childrenIds у оставшихся блоков
  for (const block of Object.values(blocks)) {
    block.childrenIds = block.childrenIds.filter(
      id => !removedBlockIds.includes(id)
    );
  }

  return {
    removedBlockIds,
    cleanedImports,
  };
}
