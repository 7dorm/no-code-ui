const fs = require('fs');

const path = './src/features/editor/hooks/useHistory.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  `type UseHistoryParams = {
  filePath: string;
};`,
  `type UseHistoryParams = {
  filePath: string;
  applyBlockPatchRef?: React.MutableRefObject<any>;
  stageInsertBlockRef?: React.MutableRefObject<any>;
  stageDeleteBlockRef?: React.MutableRefObject<any>;
  stageReparentBlockRef?: React.MutableRefObject<any>;
  stageSetTextRef?: React.MutableRefObject<any>;
};`
);

code = code.replace(
  `export function useHistory({ filePath }: UseHistoryParams) {`,
  `export function useHistory({ filePath, applyBlockPatchRef, stageInsertBlockRef, stageDeleteBlockRef, stageReparentBlockRef, stageSetTextRef }: UseHistoryParams) {`
);

code = code.replace(
  /case 'patch': \{[\s\S]*?break;\n      \}/,
  `case 'patch': {
        let patchToApply: Record<string, any>;
        if (operation.previousValue) {
          patchToApply = operation.previousValue;
        } else {
          patchToApply = {};
          for (const key in operation.patch) {
            patchToApply[key] = null;
          }
        }
        if (applyBlockPatchRef?.current) {
          void applyBlockPatchRef.current(operation.blockId, patchToApply, false, true);
        }
        break;
      }`
);

code = code.replace(
  /case 'insert': \{\n\s+updateStagedOps\(\(prev\) => prev.filter\(\(op\) => op.blockId !== operation.blockId\)\);\n\s+sendIframeCommand\(\{ type: MRPAK_CMD.DELETE, id: operation.blockId \}\);\n\s+break;\n\s+\}/,
  `case 'insert': {
        if (stageDeleteBlockRef?.current) {
          stageDeleteBlockRef.current(operation.blockId, true);
        }
        break;
      }`
);

code = code.replace(
  /case 'delete': \{\n\s+updateStagedOps\(\(prev: StagedOp\[\]\) => \[\n\s+\.\.\.prev,\n\s+\{\n\s+type: 'insert',\n\s+targetId: operation.parentId,\n\s+mode: 'child',\n\s+snippet: operation.snippet,\n\s+blockId: operation.blockId,\n\s+fileType,\n\s+filePath,\n\s+\},\n\s+\]\);\n\s+sendIframeCommand\(\{\n\s+type: MRPAK_CMD.INSERT,\n\s+targetId: operation.parentId,\n\s+mode: 'child',\n\s+html: operation.snippet,\n\s+\}\);\n\s+break;\n\s+\}/,
  `case 'delete': {
        if (stageInsertBlockRef?.current) {
          stageInsertBlockRef.current({
            targetId: operation.parentId,
            mode: 'child',
            snippet: operation.snippet,
            skipIframeInsert: false,
            isUndoRedo: true
          });
        }
        break;
      }`
);

code = code.replace(
  /case 'setText': \{\n\s+updateStagedOps\(\(prev\) => prev.filter\(\(op\) => !\(op.type === 'setText' && op.blockId === operation.blockId\)\)\);\n\s+sendIframeCommand\(\{\n\s+type: MRPAK_CMD.SET_TEXT,\n\s+id: operation.blockId,\n\s+text: operation.previousText \|\| '',\n\s+\}\);\n\s+break;\n\s+\}/,
  `case 'setText': {
        if (stageSetTextRef?.current) {
          stageSetTextRef.current({
            blockId: operation.blockId,
            text: operation.previousText || '',
            isUndoRedo: true
          });
        }
        break;
      }`
);

code = code.replace(
  /case 'reparent': \{\n\s+updateStagedOps\(\(prev\) => prev.filter\(\(op\) => !\(op.type === 'reparent' && op.blockId === operation.blockId\)\)\);\n\s+sendIframeCommand\(\{\n\s+type: MRPAK_CMD.REPARENT,\n\s+sourceId: operation.blockId,\n\s+targetParentId: operation.oldParentId,\n\s+\}\);\n\s+break;\n\s+\}/,
  `case 'reparent': {
        if (stageReparentBlockRef?.current) {
          stageReparentBlockRef.current({
            sourceId: operation.blockId,
            targetParentId: operation.oldParentId,
            isUndoRedo: true
          });
        }
        break;
      }`
);

// Do the same for redo stack

code = code.replace(
  /case 'patch': \{\n\s+updateStagedPatches\(\(prev\) => \(\{\n\s+\.\.\.prev,\n\s+\[operation.blockId\]: \{ \.\.\.\(prev\[operation.blockId\] \|\| \{\}\), \.\.\.operation.patch \},\n\s+\}\)\);\n\s+sendIframeCommand\(\{\n\s+type: MRPAK_CMD.SET_STYLE,\n\s+id: operation.blockId,\n\s+patch: operation.patch,\n\s+fileType,\n\s+\}\);\n\s+break;\n\s+\}/,
  `case 'patch': {
        if (applyBlockPatchRef?.current) {
          void applyBlockPatchRef.current(operation.blockId, operation.patch, false, true);
        }
        break;
      }`
);

code = code.replace(
  /case 'insert': \{\n\s+updateStagedOps\(\(prev: StagedOp\[\]\) => \[\n\s+\.\.\.prev,\n\s+\{\n\s+type: 'insert',\n\s+targetId: operation.targetId,\n\s+mode: operation.mode,\n\s+snippet: operation.snippet,\n\s+blockId: operation.blockId,\n\s+fileType,\n\s+filePath,\n\s+\},\n\s+\]\);\n\s+sendIframeCommand\(\{\n\s+type: MRPAK_CMD.INSERT,\n\s+targetId: operation.targetId,\n\s+mode: operation.mode,\n\s+html: operation.snippet,\n\s+\}\);\n\s+break;\n\s+\}/,
  `case 'insert': {
        if (stageInsertBlockRef?.current) {
          stageInsertBlockRef.current({
            targetId: operation.targetId,
            mode: operation.mode,
            snippet: operation.snippet,
            skipIframeInsert: false,
            isUndoRedo: true
          });
        }
        break;
      }`
);

code = code.replace(
  /case 'delete': \{\n\s+updateStagedOps\(\(prev: StagedOp\[\]\) => \[\n\s+\.\.\.prev,\n\s+\{\n\s+type: 'delete',\n\s+blockId: operation.blockId,\n\s+fileType,\n\s+filePath,\n\s+\},\n\s+\]\);\n\s+sendIframeCommand\(\{ type: MRPAK_CMD.DELETE, id: operation.blockId \}\);\n\s+break;\n\s+\}/,
  `case 'delete': {
        if (stageDeleteBlockRef?.current) {
          stageDeleteBlockRef.current(operation.blockId, true);
        }
        break;
      }`
);

code = code.replace(
  /case 'setText': \{\n\s+updateStagedOps\(\(prev: StagedOp\[\]\) => \[\n\s+\.\.\.prev,\n\s+\{\n\s+type: 'setText',\n\s+blockId: operation.blockId,\n\s+text: operation.text,\n\s+fileType,\n\s+filePath,\n\s+\},\n\s+\]\);\n\s+sendIframeCommand\(\{\n\s+type: MRPAK_CMD.SET_TEXT,\n\s+id: operation.blockId,\n\s+text: operation.text,\n\s+\}\);\n\s+break;\n\s+\}/,
  `case 'setText': {
        if (stageSetTextRef?.current) {
          stageSetTextRef.current({
            blockId: operation.blockId,
            text: operation.text,
            isUndoRedo: true
          });
        }
        break;
      }`
);

code = code.replace(
  /case 'reparent': \{\n\s+updateStagedOps\(\(prev: StagedOp\[\]\) => \[\n\s+\.\.\.prev,\n\s+\{\n\s+type: 'reparent',\n\s+blockId: operation.blockId,\n\s+oldParentId: operation.oldParentId,\n\s+newParentId: operation.newParentId,\n\s+sourceId: operation.blockId,\n\s+targetParentId: operation.newParentId,\n\s+targetBeforeId: operation.targetBeforeId \|\| null,\n\s+fileType: operation.fileType,\n\s+filePath: operation.filePath,\n\s+\},\n\s+\]\);\n\s+if \(\!operation.targetBeforeId\) \{\n\s+sendIframeCommand\(\{\n\s+type: MRPAK_CMD.REPARENT,\n\s+sourceId: operation.blockId,\n\s+targetParentId: operation.newParentId,\n\s+\}\);\n\s+\}\n\s+break;\n\s+\}/,
  `case 'reparent': {
        if (stageReparentBlockRef?.current) {
          stageReparentBlockRef.current({
            sourceId: operation.blockId,
            targetParentId: operation.newParentId,
            targetBeforeId: operation.targetBeforeId,
            isUndoRedo: true
          });
        }
        break;
      }`
);

fs.writeFileSync(path, code, 'utf8');

