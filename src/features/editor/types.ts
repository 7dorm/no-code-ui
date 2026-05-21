export type StylePatch = Record<string, any>;

export type PatchHistoryOperation = {
  type: 'patch';
  blockId: string;
  patch: StylePatch;
  previousValue?: StylePatch | null;
};

export type InsertHistoryOperation = {
  type: 'insert';
  blockId: string;
  targetId: string;
  mode: 'child' | 'before' | 'after';
  snippet: string;
  fileType: string | null;
  filePath: string;
};

export type DeleteHistoryOperation = {
  type: 'delete';
  blockId: string;
  parentId: string;
  snippet: string;
  fileType: string | null;
  filePath: string;
};

export type DeleteOperationDedup = {
  blockId: string;
  timestamp: number;
};

export type SetTextHistoryOperation = {
  type: 'setText';
  blockId: string;
  text: string;
  previousText?: string | null;
};

export type StagedOpInsert = {
  type: 'insert';
  targetId: string;
  mode: 'child' | 'before' | 'after';
  snippet: string;
  blockId: string;
  fileType: string | null;
  filePath: string;
};

export type StagedOpDelete = {
  type: 'delete';
  blockId: string;
  fileType: string | null;
  filePath: string;
};

export type StagedOpSetText = {
  type: 'setText';
  blockId: string;
  text: string;
  fileType: string | null;
  filePath: string;
};

export type StagedOpReparent = {
  type: 'reparent';
  blockId?: string;
  oldParentId?: string;
  newParentId?: string;
  sourceId?: string;
  targetParentId?: string;
  targetBeforeId?: string | null;
  fileType: string | null;
  filePath: string;
};

export type ReparentHistoryOperation = StagedOpReparent;

export type HistoryOperation =
  | PatchHistoryOperation
  | InsertHistoryOperation
  | DeleteHistoryOperation
  | StagedOpReparent
  | SetTextHistoryOperation;

export type StagedOp = StagedOpInsert | StagedOpDelete | StagedOpSetText | StagedOpReparent;

export type BlockMap = Record<string, any>;

export type LayersTree = {
  nodes: Record<string, any>;
  rootIds: string[];
};

export type LayerNames = Record<string, string>;

export type LivePosition = {
  left: number | null;
  top: number | null;
  width: number | null;
  height: number | null;
};

export type ExternalComponentDragPayload = {
  sourceFilePath: string;
  componentName: string;
  importKind: 'default' | 'named';
  hasProps: boolean;
  propsCount: number;
  supportsStyleOnlyArg?: boolean;
};

export type ExternalFileDragPayload = {
  sourceFilePath: string;
  kind: 'image';
};

export type StagedComponentImport = {
  localName: string;
  importPath: string;
  importKind: 'default' | 'named';
};

export type StyleLibraryEntry = {
  id: string;
  name: string;
  path: string;
  sourceFileName: string;
  className: string;
  cssText: string;
  stylePatch: Record<string, any>;
};

export type StyleTemplate = {
  id: string;
  fileName: string;
  title: string;
  cssText: string;
};
