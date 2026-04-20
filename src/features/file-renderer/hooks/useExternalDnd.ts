import { useEffect, useRef } from 'react';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';
import type { ExternalComponentDragPayload, ExternalFileDragPayload } from '../types';
import { getRelativeAssetImportPath, getRelativeImportPath } from '../utils';

type UseExternalDndParams = {
  viewMode: 'preview' | 'split' | 'changes';
  fileType: string | null;
  filePath: string;
  externalComponentDrag?: ExternalComponentDragPayload | null;
  externalFileDrag?: ExternalFileDragPayload | null;
  sendIframeCommand: (cmd: any) => void;
};

export function useExternalDnd({
  viewMode,
  fileType,
  filePath,
  externalComponentDrag,
  externalFileDrag,
  sendIframeCommand,
}: UseExternalDndParams) {
  const externalComponentDragActiveRef = useRef<boolean>(false);
  const externalFileDragActiveRef = useRef<boolean>(false);

  useEffect(() => {
    const canUseCanvasDrag = viewMode === 'split' && (fileType === 'react' || fileType === 'react-native');
    if (!canUseCanvasDrag) {
      if (externalComponentDragActiveRef.current) {
        sendIframeCommand({ type: MRPAK_CMD.END_DRAG });
        externalComponentDragActiveRef.current = false;
      }
      return;
    }

    if (!externalComponentDrag) {
      if (externalComponentDragActiveRef.current) {
        if (!externalFileDrag) {
          sendIframeCommand({ type: MRPAK_CMD.END_DRAG });
        }
        externalComponentDragActiveRef.current = false;
      }
      return;
    }

    const componentName = String(externalComponentDrag.componentName || '').trim();
    const sourceFilePath = String(externalComponentDrag.sourceFilePath || '').trim();
    if (!componentName || !sourceFilePath) return;

    const importPath = getRelativeImportPath(filePath, sourceFilePath);
    sendIframeCommand({
      type: MRPAK_CMD.START_DRAG,
      source: 'component',
      componentName,
      sourceFilePath,
      importKind: externalComponentDrag.importKind === 'named' ? 'named' : 'default',
      importPath,
      hasProps: Boolean(externalComponentDrag.hasProps),
      propsCount: Number(externalComponentDrag.propsCount || 0),
      supportsStyleOnlyArg: Boolean(externalComponentDrag.supportsStyleOnlyArg),
    });
    externalComponentDragActiveRef.current = true;
  }, [externalComponentDrag, externalFileDrag, filePath, fileType, sendIframeCommand, viewMode]);

  useEffect(() => {
    const canUseCanvasDrag = viewMode === 'split' && (fileType === 'react' || fileType === 'react-native');
    if (!canUseCanvasDrag) {
      if (externalFileDragActiveRef.current) {
        sendIframeCommand({ type: MRPAK_CMD.END_DRAG });
        externalFileDragActiveRef.current = false;
      }
      return;
    }

    if (!externalFileDrag) {
      if (externalFileDragActiveRef.current) {
        if (!externalComponentDrag) {
          sendIframeCommand({ type: MRPAK_CMD.END_DRAG });
        }
        externalFileDragActiveRef.current = false;
      }
      return;
    }

    const sourceFilePath = String(externalFileDrag.sourceFilePath || '').trim();
    if (!sourceFilePath) return;

    const importPath = getRelativeAssetImportPath(filePath, sourceFilePath);
    sendIframeCommand({
      type: MRPAK_CMD.START_DRAG,
      source: 'file',
      filePath: sourceFilePath,
      importPath,
      assetKind: externalFileDrag.kind || 'image',
    });
    externalFileDragActiveRef.current = true;
  }, [externalComponentDrag, externalFileDrag, filePath, fileType, sendIframeCommand, viewMode]);
}

