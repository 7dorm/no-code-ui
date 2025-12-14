// src/engine/types.ts
export type BlockType =
  | 'component'
  | 'element'
  | 'html-root'
  | 'html-element'
  | 'function'
  | 'variable'
  | 'css-class';

export interface PropValue {
  type: 'string' | 'expression' | 'number' | 'boolean';
  value: string;
}

export interface VisualBlock {
  id: string;
  type: BlockType;
  name: string;
  filePath: string;
  relPath: string;
  sourceCode: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;

  parentId?: string;
  childrenIds: string[];

  props?: Record<string, PropValue>;
  args?: Record<string, string>;
  uses: string[];
  usedIn: string[];

  imports?: string[]

  isExported?: boolean;
  metadata?: Record<string, any>;

  // Только для JSX-узлов, опционально
  astNode?: any;
}

export interface ProjectTree {
  blocks: Record<string, VisualBlock>;
  roots: string[];
}