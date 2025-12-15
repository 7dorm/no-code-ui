// src/engine/types.ts
export type BlockType =
  | 'component'
  | 'component-instance'
  | 'element'
  | 'html-root'
  | 'html-element'
  | 'function'
  | 'variable'
  | 'css-class';

export interface PropValue {
  type: 'string' | 'expression' | 'number' | 'boolean' | 'component';
  value: string;
}

export interface ComponentUsage {
  usageId: string;
  filePath: string;
  relPath: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  parentId?: string;
  props?: Record<string, PropValue>;
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

  // For component-instance blocks: points to component definition block id
  refId?: string;

  // For component definition blocks: where it's used (instances)
  usages?: ComponentUsage[];

  // Только для JSX-узлов, опционально
  astNode?: any;
}

export interface ProjectTree {
  blocks: Record<string, VisualBlock>;
  roots: string[];
}
