export type ElementKind = 'div'|'button'|'img'|'a'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'|'box'|'text'|'card';

export type ElementData = {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  props?: Record<string, any>;
};

// Типы для отслеживания изменений блоков
export type BlockChangeAction = 'move' | 'resize' | 'update' | 'delete' | 'create';

export type BlockChanges = {
  position?: { x: number; y: number };
  dimensions?: { w: number; h: number };
  style?: Record<string, any>;
  props?: Record<string, any>;
  deleted?: boolean;
};

export type BlockInteractionResult = {
  elementId: string;
  action: BlockChangeAction;
  changes: BlockChanges;
};
