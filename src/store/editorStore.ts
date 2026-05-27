import { create } from 'zustand';
import type {
  BlockMap,
  LayersTree,
  LayerNames,
  HistoryOperation,
  StylePatch,
  StagedOp,
  StagedComponentImport,
  StyleLibraryEntry,
  LivePosition,
  ComponentVariables
} from './editorTypes';

interface EditorState {
  // Global View Modes
  viewMode: 'preview' | 'split' | 'changes';
  setViewMode: (mode: 'preview' | 'split' | 'changes') => void;
  showSplitSidebar: boolean;
  setShowSplitSidebar: (show: boolean) => void;
  showSplitPreview: boolean;
  setShowSplitPreview: (show: boolean) => void;
  showSplitCode: boolean;
  setShowSplitCode: (show: boolean) => void;
  
  // Canvas Configuration
  canvasDevice: 'desktop' | 'mobile';
  setCanvasDevice: (device: 'desktop' | 'mobile') => void;
  canvasWidth: number;
  setCanvasWidth: (width: number) => void;
  canvasHeight: number;
  setCanvasHeight: (height: number) => void;
  aggressivePreviewMode: boolean;
  setAggressivePreviewMode: (aggressive: boolean) => void;

  // File and Editor Status
  fileContent: string | null;
  setFileContent: (content: string | null) => void;
  fileType: string | null;
  setFileType: (type: string | null) => void;
  isModified: boolean;
  setIsModified: (modified: boolean) => void;
  hasStagedChanges: boolean;
  setHasStagedChanges: (hasChanges: boolean) => void;

  // Selected Nodes
  selectedBlock: { id: string; meta?: any } | null;
  setSelectedBlock: (block: { id: string; meta?: any } | null) => void;
  selectedBlockIds: string[];
  setSelectedBlockIds: (ids: string[]) => void;

  // Ast Data
  blockMap: BlockMap;
  setBlockMap: (map: BlockMap) => void;
  layersTree: LayersTree | null;
  setLayersTree: (tree: LayersTree | null) => void;
  layerNames: LayerNames;
  setLayerNames: (names: LayerNames) => void;

  // Real-time Editing
  stagedPatches: Record<string, StylePatch>;
  setStagedPatches: (patches: Record<string, StylePatch>) => void;
  updateStagedPatches: (updater: ((prev: Record<string, StylePatch>) => Record<string, StylePatch>) | Record<string, StylePatch>) => void;
  skipPreviewGeneration: boolean;
  setSkipPreviewGeneration: (skip: boolean) => void;

  // UI interaction data
  livePosition: LivePosition;
  setLivePosition: (pos: LivePosition) => void;

  // Project configuration
  projectRoot: string | null;
  setProjectRoot: (root: string | null) => void;

  // Real-time operations and sync
  iframeCommand: any;
  sendIframeCommand: (cmd: any) => void;
  stagedOps: StagedOp[];
  setStagedOps: (ops: StagedOp[]) => void;
  updateStagedOps: (updater: ((prev: StagedOp[]) => StagedOp[]) | StagedOp[]) => void;
  stagedComponentImports: StagedComponentImport[];
  setStagedComponentImports: (imports: StagedComponentImport[]) => void;
  updateStagedComponentImports: (updater: ((prev: StagedComponentImport[]) => StagedComponentImport[]) | StagedComponentImport[]) => void;
  
  // Snapshots for comparison
  styleSnapshots: Record<string, { inlineStyle: string; computedStyle?: any }>;
  setStyleSnapshots: (snapshots: Record<string, { inlineStyle: string; computedStyle?: any }>) => void;
  textSnapshots: Record<string, string>;
  setTextSnapshots: (snapshots: Record<string, string>) => void;

  // Dependency mapping
  externalStylesMap: Record<string, { path: string; type: string }>;
  setExternalStylesMap: (map: Record<string, { path: string; type: string }>) => void;
  externalDropTargetState: { source: string; sourceId: string | null; targetId: string | null } | null;
  setExternalDropTargetState: (state: { source: string; sourceId: string | null; targetId: string | null } | null) => void;

  // Logging and History
  changesLog: Array<{ ts: number; filePath: string; blockId: any; patch: any }>;
  setChangesLog: (log: Array<{ ts: number; filePath: string; blockId: any; patch: any }>) => void;
  undoStack: HistoryOperation[];
  setUndoStack: (stack: HistoryOperation[]) => void;
  redoStack: HistoryOperation[];
  setRedoStack: (stack: HistoryOperation[]) => void;

  // AST and Previews
  editorHTML: string;
  setEditorHTML: (html: string) => void;
  blockMapForFile: BlockMap;
  setBlockMapForFile: (map: BlockMap) => void;

  // Variables and Mocks
  variableSnapshots: Record<string, ComponentVariables>;
  setVariableSnapshots: (snapshots: Record<string, ComponentVariables>) => void;
  mockVariables: Record<string, Record<string, any>>;
  setMockVariables: (mocks: Record<string, Record<string, any>>) => void;
  updateMockVariables: (updater: ((prev: Record<string, Record<string, any>>) => Record<string, Record<string, any>>) | Record<string, Record<string, any>>) => void;
  variablesRenderVersion: number;
  forceRenderVariables: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // View Modes
  viewMode: 'preview',
  setViewMode: (mode) => set({ viewMode: mode }),
  showSplitSidebar: true,
  setShowSplitSidebar: (show) => set({ showSplitSidebar: show }),
  showSplitPreview: true,
  setShowSplitPreview: (show) => set({ showSplitPreview: show }),
  showSplitCode: true,
  setShowSplitCode: (show) => set({ showSplitCode: show }),

  // Canvas Configuration
  canvasDevice: 'desktop',
  setCanvasDevice: (device) => set({ canvasDevice: device }),
  canvasWidth: 1280,
  setCanvasWidth: (width) => set({ canvasWidth: width }),
  canvasHeight: 800,
  setCanvasHeight: (height) => set({ canvasHeight: height }),
  aggressivePreviewMode: false,
  setAggressivePreviewMode: (aggressive) => set({ aggressivePreviewMode: aggressive }),

  // File and Editor Status
  fileContent: null,
  setFileContent: (content) => set({ fileContent: content }),
  fileType: null,
  setFileType: (type) => set({ fileType: type }),
  isModified: false,
  setIsModified: (modified) => set({ isModified: modified }),
  hasStagedChanges: false,
  setHasStagedChanges: (hasChanges) => set({ hasStagedChanges: hasChanges }),

  // Selected Nodes
  selectedBlock: null,
  setSelectedBlock: (block) => set({ selectedBlock: block }),
  selectedBlockIds: [],
  setSelectedBlockIds: (ids) => set({ selectedBlockIds: ids }),

  // Ast Data
  blockMap: {},
  setBlockMap: (map) => set({ blockMap: map }),
  layersTree: null,
  setLayersTree: (tree) => set({ layersTree: tree }),
  layerNames: {},
  setLayerNames: (names) => set({ layerNames: names }),

  // Real-time Editing
  stagedPatches: {},
  setStagedPatches: (patches) => set({ stagedPatches: patches }),
  updateStagedPatches: (updater) => set((state) => ({
    stagedPatches: typeof updater === 'function' ? updater(state.stagedPatches) : updater,
  })),
  skipPreviewGeneration: false,
  setSkipPreviewGeneration: (skip) => set({ skipPreviewGeneration: skip }),

  // UI interaction data
  livePosition: { left: null, top: null, width: null, height: null },
  setLivePosition: (pos) => set({ livePosition: pos }),

  // Project configuration
  projectRoot: null,
  setProjectRoot: (root) => set({ projectRoot: root }),

  // Real-time operations and sync
  iframeCommand: null,
  sendIframeCommand: (cmd) => set({ iframeCommand: cmd ? { ...cmd, ts: Date.now() } : null }),
  stagedOps: [],
  setStagedOps: (ops) => set({ stagedOps: ops }),
  updateStagedOps: (updater) => set((state) => ({
    stagedOps: typeof updater === 'function' ? updater(state.stagedOps) : updater
  })),
  stagedComponentImports: [],
  setStagedComponentImports: (imports) => set({ stagedComponentImports: imports }),
  updateStagedComponentImports: (updater) => set((state) => ({
    stagedComponentImports: typeof updater === 'function' ? updater(state.stagedComponentImports) : updater
  })),

  // Snapshots for comparison
  styleSnapshots: {},
  setStyleSnapshots: (snapshots) => set({ styleSnapshots: snapshots }),
  textSnapshots: {},
  setTextSnapshots: (snapshots) => set({ textSnapshots: snapshots }),

  // Dependency mapping
  externalStylesMap: {},
  setExternalStylesMap: (map) => set({ externalStylesMap: map }),
  externalDropTargetState: null,
  setExternalDropTargetState: (state) => set({ externalDropTargetState: state }),

  // Logging and History
  changesLog: [],
  setChangesLog: (log) => set((state) => ({ changesLog: typeof log === 'function' ? log(state.changesLog) : log })),
  undoStack: [],
  setUndoStack: (stack) => set((state) => ({ undoStack: typeof stack === 'function' ? stack(state.undoStack) : stack })),
  redoStack: [],
  setRedoStack: (stack) => set((state) => ({ redoStack: typeof stack === 'function' ? stack(state.redoStack) : stack })),

  // AST and Previews
  editorHTML: '',
  setEditorHTML: (html) => set({ editorHTML: html }),
  blockMapForFile: {},
  setBlockMapForFile: (map) => set({ blockMapForFile: map }),

  // Variables and Mocks
  variableSnapshots: {},
  setVariableSnapshots: (snapshots) => set({ variableSnapshots: snapshots }),
  mockVariables: {},
  setMockVariables: (mocks) => set({ mockVariables: mocks }),
  updateMockVariables: (updater) => set((state) => ({
    mockVariables: typeof updater === 'function' ? updater(state.mockVariables) : updater
  })),
  variablesRenderVersion: 0,
  forceRenderVariables: () => set((state) => ({ variablesRenderVersion: state.variablesRenderVersion + 1 })),
}));
