import { VisualBlock } from "../types";

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
    if (block.type !== "component")
    for (const childId of block.childrenIds) {
      dfs(childId);
    }
  }

  dfs(rootId);
  return result;
}

function getParentImportedComponentNames(
  parentComponent: VisualBlock
): Set<string> {
  return new Set(
    (parentComponent.imports ?? [])
      .map(imp => imp.split('|')[2])
      .filter(Boolean)
  );
}

function traverseParentExcludingSubtree(
  blocks: Record<string, VisualBlock>,
  rootId: string,
  excluded: Set<string>,
  onComponent: (componentName: string) => void
) {
  function dfs(id: string) {
    if (excluded.has(id)) return;

    const block = blocks[id];
    if (!block) return;

    if (block.type === 'component') {
      onComponent(block.name);
    }

    for (const childId of block.childrenIds) {
      dfs(childId);
    }
  }

  dfs(rootId);
}


export function removeBlockAndCleanup(
  blocks: Record<string, VisualBlock>,
  rootId: string,
  cssBlocks?: Record<string, VisualBlock>
): {
  removedBlocks: VisualBlock[];
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

  // 1️⃣ Найти импорты компонентов, используемые в поддереве
  const removableImports = new Set<string>();
  const parentImportedNames = getParentImportedComponentNames(parentComponent);

  for (const id of subtree) {
    const block = blocks[id];
    if (!block) continue;

    if (block.type === 'component-instance' && parentImportedNames.has(block.name)) {
      removableImports.add(block.name);
    }
  }

  // 2️⃣ Оставить только те импорты, которые больше нигде в этом файле не используются
  for (const block of Object.values(blocks)) {
    if (!block) continue;
    if (subtree.has(block.id)) continue;
    if (block.type !== 'component-instance') continue;
    if (block.filePath !== parentComponent.filePath) continue;
    removableImports.delete(block.name);
  }

  // 3️⃣ Почистить импорты в родительском компоненте
  const cleanedImports: Record<string, string[]> = {};

  if (parentComponent.imports) {
    const before = [...parentComponent.imports];

    const nextImports = parentComponent.imports.filter(imp => {
      const [, , localName] = imp.split('|');
      return !removableImports.has(localName);
    });
    parentComponent.imports.length = 0;
    parentComponent.imports.push(...nextImports);

    cleanedImports[parentComponent.id] = before.filter(
      imp => !parentComponent.imports!.includes(imp)
    );
  }

  // 4️⃣ Удаляем связи usedIn/usages у компонентов для удаляемых instance-блоков
  for (const id of subtree) {
    const block = blocks[id];
    if (!block) continue;
    if (block.type !== 'component-instance' || !block.refId) continue;

    const target = blocks[block.refId];
    if (!target || target.type !== 'component') continue;

    target.usedIn = (target.usedIn ?? []).filter(usedId => usedId !== block.id);
    target.usages = (target.usages ?? []).filter(u => u.usageId !== block.id);
  }

  // 4️⃣.5 Почистить связи uses/usedIn с CSS-блоками (если переданы)
  if (cssBlocks) {
    for (const id of subtree) {
      const block = blocks[id];
      if (!block?.uses?.length) continue;
      for (const usedId of block.uses) {
        const cssBlock = cssBlocks[usedId];
        if (!cssBlock || cssBlock.type !== 'css-class') continue;
        cssBlock.usedIn = (cssBlock.usedIn ?? []).filter(usedInId => usedInId !== id);
      }
    }
  }

  // 5️⃣ Удалить блоки (кроме компонентов)
  const removedBlocks: VisualBlock[] = [];

  for (const id of subtree) {
    const block = blocks[id];
    if (!block) continue;

    if (isDeletable(block)) {
      delete blocks[id];
      removedBlocks.push(block);
    }
  }

  // 6️⃣ Почистить childrenIds у оставшихся блоков
  const removedIds = new Set(removedBlocks.map(b => b.id));
  for (const block of Object.values(blocks)) {
    if (!block?.childrenIds?.length) continue;
    block.childrenIds = block.childrenIds.filter(id => !removedIds.has(id));
  }

  return {
    removedBlocks,
    cleanedImports,
  };
}
