import { VisualBlock } from "../types";

interface AddComponentChildParams {
  blocks: Record<string, VisualBlock>;

  parentElementId: string;     // JSX-элемент (div, fragment и т.д.)
  componentId: string;         // вставляемая компонента
  index?: number;              // позиция в childrenIds
}

function findParentComponent(
  blocks: Record<string, VisualBlock>,
  startId: string
): VisualBlock | null {
  let current = blocks[startId];

  while (current) {
    if (current.type === 'component') return current;
    if (!current.parentId) return null;
    current = blocks[current.parentId];
  }

  return null;
}

function hasImport(
  component: VisualBlock,
  localName: string
): boolean {
  return (
    component.imports?.some(imp => {
      const [, , name] = imp.split('|');
      return name === localName;
    }) ?? false
  );
}

export function addComponentAsChild({
  blocks,
  parentElementId,
  componentId,
  index,
}: AddComponentChildParams): void {
  const parentElement = blocks[parentElementId];
  const component = blocks[componentId];

  if (!parentElement) {
    throw new Error(`Parent element ${parentElementId} not found`);
  }

  if (!component || component.type !== 'component') {
    throw new Error(`Block ${componentId} is not a component`);
  }

  // 1️⃣ Вставляем в childrenIds
  parentElement.childrenIds ??= [];

  if (
    typeof index === 'number' &&
    index >= 0 &&
    index <= parentElement.childrenIds.length
  ) {
    parentElement.childrenIds.splice(index, 0, componentId);
  } else {
    parentElement.childrenIds.push(componentId);
  }

  // 2️⃣ Обновляем uses / usedIn
  parentElement.uses ??= [];
  component.usedIn ??= [];

  if (!parentElement.uses.includes(componentId)) {
    parentElement.uses.push(componentId);
  }

  if (!component.usedIn.includes(parentElementId)) {
    component.usedIn.push(parentElementId);
  }

  // 3️⃣ Находим родительскую компоненту
  const parentComponent = findParentComponent(blocks, parentElementId);

  if (!parentComponent) {
    throw new Error(
      `Parent component not found for element ${parentElementId}`
    );
  }

  parentComponent.imports ??= [];

  // 4️⃣ Добавляем импорт, если его нет
  if (!hasImport(parentComponent, component.name)) {
    const importPath = component.filePath
      .replace(parentComponent.filePath.replace(/\\/g, '/'), '')
      .replace(/\.tsx$/, '');

    parentComponent.imports.push(
      `${importPath}|default|${component.name}`
    );
  }
}
