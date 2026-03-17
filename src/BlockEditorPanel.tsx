import React, { memo, useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import WebView from './WebView';
import {
  buildPatchFromKv,
  buildPatchFromText,
  toHtmlStyleAttr,
  toReactStyleObjectText,
} from './blockEditor/styleUtils';
import { normalizeStyleKey, parseStyleText, parseValueForReactLike } from './blockEditor/styleUtils';
import { NumberField } from './shared/ui/fields/number-field';
import { TextField } from './shared/ui/fields/text-field';
import { ReactFramework } from './frameworks/ReactFramework';
import { HtmlFramework } from './frameworks/HtmlFramework';

// Стили для HTML input элементов (используется в нескольких местах)
const htmlInputStyle = {
  width: '100%',
  height: '32px',
  borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(0,0,0,0.25)',
  color: '#ffffff',
  paddingLeft: '10px',
  paddingRight: '10px',
  outline: 'none',
};

export type BlockEditorPanelProps = {
  fileType: 'html' | 'react' | 'react-native';
  html: string;
  selectedBlock: any;
  onMessage: (msg: any) => void;
  onApplyPatch: (blockId: any, patch: any) => void;
  onStagePatch: (blockId: any, patch: any, isIntermediate?: boolean) => void;
  styleSnapshot: any;
  textSnapshot: any;
  layersTree: any;
  layerNames: any;
  onRenameLayer: (id: string, name: string) => void;
  outgoingMessage: any;
  onSendCommand: (cmd: any) => void;
  onInsertBlock: ({ targetId, mode, snippet }: {
    targetId: any;
    mode: any;
    snippet: any;
  }) => void;
  onDeleteBlock: (id: string) => void;
  onReparentBlock: ({ sourceId, targetParentId, targetBeforeId }: {
    sourceId: any;
    targetParentId: any;
    targetBeforeId?: any;
  }) => void;
  onSetText: ({ blockId, text }: {
    blockId: any;
    text: any;
  }) => void;
  framework: HtmlFramework | ReactFramework | null;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  livePosition: { left: number | null; top: number | null; width: number | null; height: number | null } | null;
  selectedBlockIds?: string[];
  onExtractSelection?: () => void;
  onOpenFile?: (path: string) => void;
};

type BlockEditorSidebarControllerProps = Omit<BlockEditorPanelProps, 'html' | 'onMessage' | 'outgoingMessage'>;

export function useBlockEditorSidebarController({
  fileType,
  selectedBlock,
  onApplyPatch,
  onStagePatch,
  styleSnapshot,
  textSnapshot,
  layersTree,
  layerNames,
  onRenameLayer,
  onSendCommand,
  onInsertBlock,
  onDeleteBlock,
  onReparentBlock,
  onSetText,
  framework,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  livePosition,
  selectedBlockIds = [],
  onExtractSelection,
  onOpenFile,
}: BlockEditorSidebarControllerProps) {
  const [left, setLeft] = useState<number | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [leftMode, setLeftMode] = useState<'value' | 'auto'>('value');
  const [topMode, setTopMode] = useState<'value' | 'auto'>('value');
  const [widthMode, setWidthMode] = useState<'value' | 'auto' | 'min-content' | 'max-content' | 'fit-content'>('value');
  const [heightMode, setHeightMode] = useState<'value' | 'auto'>('value');

  // Обработчики для отправки патчей позиционирования
  const handleLeftChange = (value: number | null) => {
    console.log('[handleLeftChange] Called with:', { value, selectedBlockId: selectedBlock?.id, typeofValue: typeof value });
    setLeft(value);
    setLeftMode('value');
    if (selectedBlock?.id && value !== null && value !== undefined && !isNaN(value)) {
      const moveKeys = getMovePatchKeys(moveMode);
      const patch: any = { [moveKeys.x]: formatMoveValue(value) };
      patch.position = moveMode === 'grid8' ? 'absolute' : moveMode;
      if (moveMode === 'relative') {
        patch.left = '';
      }
      console.log('[handleLeftChange] Sending patch:', { blockId: selectedBlock.id, patch });
      onApplyPatch(selectedBlock.id, patch);
    } else {
      console.log('[handleLeftChange] Not sending patch:', { selectedBlockId: selectedBlock?.id, value, isValid: value !== null && value !== undefined && !isNaN(value) });
    }
  };

  const handleTopChange = (value: number | null) => {
    setTop(value);
    setTopMode('value');
    if (selectedBlock?.id && value !== null) {
      const moveKeys = getMovePatchKeys(moveMode);
      const patch: any = { [moveKeys.y]: formatMoveValue(value) };
      patch.position = moveMode === 'grid8' ? 'absolute' : moveMode;
      if (moveMode === 'relative') {
        patch.top = '';
      }
      onApplyPatch(selectedBlock.id, patch);
    }
  };

  const handleWidthChange = (value: number | null) => {
    setWidth(value);
    setWidthMode('value');
    if (selectedBlock?.id && value !== null) {
      onApplyPatch(selectedBlock.id, { 
        width: toDimensionValue(value),
      });
    }
  };

  const handleHeightChange = (value: number | null) => {
    setHeight(value);
    setHeightMode('value');
    if (selectedBlock?.id && value !== null) {
      onApplyPatch(selectedBlock.id, { 
        height: toDimensionValue(value),
      });
    }
  };

  const handleLeftModeChange = (mode: 'value' | 'auto') => {
    setLeftMode(mode);
    if (mode === 'value') return;
    setLeft(null);
    const patch = getSpecialModePatch('left', mode);
    if (patch) onApplyPatch(selectedBlock.id, patch);
  };

  const handleTopModeChange = (mode: 'value' | 'auto') => {
    setTopMode(mode);
    if (mode === 'value') return;
    setTop(null);
    const patch = getSpecialModePatch('top', mode);
    if (patch) onApplyPatch(selectedBlock.id, patch);
  };

  const handleWidthModeChange = (mode: 'value' | 'auto' | 'min-content' | 'max-content' | 'fit-content') => {
    setWidthMode(mode);
    if (mode === 'value') return;
    setWidth(null);
    const patch = getSpecialModePatch('width', mode);
    if (patch) onApplyPatch(selectedBlock.id, patch);
  };

  const handleHeightModeChange = (mode: 'value' | 'auto') => {
    setHeightMode(mode);
    if (mode === 'value') return;
    setHeight(null);
    const patch = getSpecialModePatch('height', mode);
    if (patch) onApplyPatch(selectedBlock.id, patch);
  };

  // Обработчик для изменения moveMode
  const handleMoveModeChange = (newMoveMode: string) => {
    console.log('[handleMoveModeChange] Called with:', { newMoveMode, oldMoveMode: moveMode, selectedBlockId: selectedBlock?.id });
    setMoveMode(newMoveMode);
    if (newMoveMode === 'grid8') {
      setMoveUnit('px');
    }
    if (newMoveMode === 'relative') {
      setLeftMode('value');
      setTopMode('value');
    }
    
    if (selectedBlock?.id) {
      const patch: any = { position: newMoveMode === 'grid8' ? 'absolute' : newMoveMode };
      console.log('[handleMoveModeChange] Sending patch:', { blockId: selectedBlock.id, patch });
      onApplyPatch(selectedBlock.id, patch);
    } else {
      console.log('[handleMoveModeChange] Not sending patch:', { selectedBlockId: selectedBlock?.id, newMoveMode });
    }
  };
  const [bg, setBg] = useState('');
  const [color, setColor] = useState('');
  const [editingLayerId, setEditingLayerId] = useState(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [styleMode, setStyleMode] = useState('kv'); // 'kv' | 'text'
  const [styleRows, setStyleRows] = useState([{ key: '', value: '' }]);
  const [styleText, setStyleText] = useState('');
  const [baselineMap, setBaselineMap] = useState<Record<string, string | number | boolean>>({}); // normalizedKey -> normalizedValue
  const [textValue, setTextValue] = useState('');
  const [reparentMode, setReparentMode] = useState(false);
  const [reparentTargetId, setReparentTargetId] = useState(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [treeDropHint, setTreeDropHint] = useState<{ targetId: string; zone: 'before' | 'inside' | 'after' } | null>(null);
  const [moveMode, setMoveMode] = useState('relative'); // absolute | relative | grid8
  const [moveUnit, setMoveUnit] = useState<'px' | '%'>('px');
  const [isMoveModeInitialized, setIsMoveModeInitialized] = useState(false);

  const getMovePatchKeys = (mode: string) => {
    if (mode === 'relative') {
      return { x: 'marginLeft', y: 'marginTop' } as const;
    }
    return { x: 'left', y: 'top' } as const;
  };

  const formatMoveValue = (value: number) => {
    if (moveUnit === '%') return `${value}%`;
    return fileType === 'html' ? `${value}px` : value;
  };
  const supportsCssSpecialValues = fileType !== 'react-native';
  const canUseAutoOffsets = supportsCssSpecialValues && moveMode !== 'relative';
  const toDimensionValue = (value: number) => (fileType === 'html' ? `${value}px` : value);

  const getSpecialModePatch = (field: 'left' | 'top' | 'width' | 'height', mode: string) => {
    if (!selectedBlock?.id) return null;
    const patch: any = {};
    if (field === 'left' || field === 'top') {
      if (!canUseAutoOffsets) return null;
      patch.position = moveMode === 'grid8' ? 'absolute' : moveMode;
      patch[field] = mode === 'auto' ? 'auto' : '';
      return patch;
    }
    if (!supportsCssSpecialValues) return null;
    patch[field] = mode === 'value' ? '' : mode;
    return patch;
  };

  const handleMoveUnitChange = (newMoveUnit: 'px' | '%') => {
    if (moveMode === 'grid8' && newMoveUnit === '%') return;
    setMoveUnit(newMoveUnit);
    if (!selectedBlock?.id) return;
    const moveKeys = getMovePatchKeys(moveMode);
    const patch: any = { position: moveMode === 'grid8' ? 'absolute' : moveMode };
    if (left !== null && Number.isFinite(left)) {
      patch[moveKeys.x] = newMoveUnit === '%' ? `${left}%` : (fileType === 'html' ? `${left}px` : left);
    }
    if (top !== null && Number.isFinite(top)) {
      patch[moveKeys.y] = newMoveUnit === '%' ? `${top}%` : (fileType === 'html' ? `${top}px` : top);
    }
    if (moveMode === 'relative') {
      patch.left = '';
      patch.top = '';
    }
    onApplyPatch(selectedBlock.id, patch);
  };

  const handlePositionPreset = (horizontal: 'left' | 'center' | 'right', vertical: 'top' | 'center' | 'bottom') => {
    if (!selectedBlock?.id || !onSendCommand) return;
    onSendCommand({
      type: 'MRPAK_CMD_ALIGN',
      id: selectedBlock.id,
      horizontal,
      vertical,
    });
  };

  useEffect(() => {
    // При выборе блока сбрасываем форму (MVP: не пытаемся читать текущие стили)
    setLeft(null);
    setTop(null);
    setWidth(null);
    setHeight(null);
    setLeftMode('value');
    setTopMode('value');
    setWidthMode('value');
    setHeightMode('value');
    setBg('');
    setColor('');
    setStyleRows([{ key: '', value: '' }]);
    setStyleText('');
    // Baseline: берём только inline style (computed используем только для просмотра).
    const inline = String(styleSnapshot?.inlineStyle || '');
    if (inline) {
      setStyleMode('text');
      setStyleText(inline);
    }
    // Строим baseline map в нормализованном виде
    const raw = parseStyleText(inline);
    const getRawStyleValue = (...keys: string[]) => {
      for (const key of keys) {
        if (raw[key] !== undefined) return String(raw[key]).trim();
      }
      return '';
    };
    const norm: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(raw)) {
      const nk = normalizeStyleKey({ fileType, key: k });
      if (!nk) continue;
      if (fileType === 'html') {
        norm[nk] = String(v).trim();
      } else {
        norm[nk] = parseValueForReactLike(v)!;
      }
    }
    setBaselineMap(norm);
    // Инициализируем числовые поля позиции/размера из computedStyle, если оно есть
    const cs = styleSnapshot?.computedStyle as any | null;
    const parseNumeric = (v: any): number | null => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    let leftValFromComputed = null;
    let topValFromComputed = null;
    let marginLeftValFromComputed = null;
    let marginTopValFromComputed = null;
    if (cs) {
      leftValFromComputed = parseNumeric(cs.left);
      topValFromComputed = parseNumeric(cs.top);
      marginLeftValFromComputed = parseNumeric(cs.marginLeft);
      marginTopValFromComputed = parseNumeric(cs.marginTop);
      const widthVal = parseNumeric(cs.width);
      const heightVal = parseNumeric(cs.height);
      if (widthVal !== null) setWidth(widthVal);
      if (heightVal !== null) setHeight(heightVal);
    }
    // Читаем moveMode из data-атрибута элемента или из computedStyle.position
    let elementMoveMode: 'absolute' | 'relative' | 'grid8' = 'relative'; // значение по умолчанию
    if (selectedBlock?.id) {
      // В React-режиме нужно искать в DOM через data-no-code-ui-id
      const element = document.querySelector(`[data-no-code-ui-id="${selectedBlock.id}"]`) ||
                      document.querySelector(`[data-mrpak-id="${selectedBlock.id}"]`);
      if (element) {
        const savedMoveMode = element.getAttribute('data-move-mode');
        if (savedMoveMode && ['absolute', 'relative', 'grid8'].includes(savedMoveMode as any)) {
          elementMoveMode = savedMoveMode as 'absolute' | 'relative' | 'grid8';
        }
        const savedMoveUnit = element.getAttribute('data-move-unit');
        if (savedMoveUnit === 'px' || savedMoveUnit === '%') {
          setMoveUnit(savedMoveUnit);
        } else {
          const moveKeys = getMovePatchKeys(elementMoveMode);
          const inlineLeft = (element.style as any)?.[moveKeys.x] || '';
          const inlineTop = (element.style as any)?.[moveKeys.y] || '';
          setMoveUnit(
            String(inlineLeft).includes('%') || String(inlineTop).includes('%') ? '%' : 'px'
          );
        }

        const moveKeys = getMovePatchKeys(elementMoveMode);
        const inlineLeftNumeric = parseNumeric((element.style as any)?.[moveKeys.x]);
        const inlineTopNumeric = parseNumeric((element.style as any)?.[moveKeys.y]);
        const computedX = elementMoveMode === 'relative' ? marginLeftValFromComputed : leftValFromComputed;
        const computedY = elementMoveMode === 'relative' ? marginTopValFromComputed : topValFromComputed;
        if (String((element.style as any)?.[moveKeys.x] || '').includes('%') && inlineLeftNumeric !== null) {
          setLeft(inlineLeftNumeric);
        } else if (computedX !== null) {
          setLeft(computedX);
        }
        if (String((element.style as any)?.[moveKeys.y] || '').includes('%') && inlineTopNumeric !== null) {
          setTop(inlineTopNumeric);
        } else if (computedY !== null) {
          setTop(computedY);
        }
      } else {
        if (leftValFromComputed !== null) setLeft(leftValFromComputed);
        if (topValFromComputed !== null) setTop(topValFromComputed);
      }
    }
    if (!selectedBlock?.id) {
      if (leftValFromComputed !== null) setLeft(leftValFromComputed);
      if (topValFromComputed !== null) setTop(topValFromComputed);
    }
    // Если data-атрибут не задан, пробуем взять position из computedStyle
    const computedPosition = cs?.position;
    if (computedPosition && typeof computedPosition === 'string') {
      if (computedPosition === 'relative') {
        elementMoveMode = 'relative';
      } else if (computedPosition === 'absolute' || computedPosition === 'fixed') {
        elementMoveMode = 'absolute';
      }
    }
    setMoveMode(elementMoveMode);
    if (elementMoveMode === 'grid8') {
      setMoveUnit('px');
    }
    setIsMoveModeInitialized(true);
    const currentXRaw = elementMoveMode === 'relative'
      ? getRawStyleValue('margin-left', 'marginLeft')
      : getRawStyleValue('left');
    const currentYRaw = elementMoveMode === 'relative'
      ? getRawStyleValue('margin-top', 'marginTop')
      : getRawStyleValue('top');
    const widthRaw = getRawStyleValue('width');
    const heightRaw = getRawStyleValue('height');
    setLeftMode(currentXRaw === 'auto' && canUseAutoOffsets ? 'auto' : 'value');
    setTopMode(currentYRaw === 'auto' && canUseAutoOffsets ? 'auto' : 'value');
    setWidthMode(
      widthRaw === 'auto' || widthRaw === 'min-content' || widthRaw === 'max-content' || widthRaw === 'fit-content'
        ? (widthRaw as any)
        : 'value'
    );
    setHeightMode(heightRaw === 'auto' ? 'auto' : 'value');
    // Текст: приоритет у textSnapshot (приходит отдельным сообщением), fallback на styleSnapshot.textContent
    const initialText =
      (typeof textSnapshot === 'string' ? textSnapshot : styleSnapshot?.textContent) || '';
    setTextValue(initialText);
    setReparentMode(false);
    setReparentTargetId(null);
  }, [selectedBlock?.id, textSnapshot, canUseAutoOffsets]);
  useEffect(() => {
    if (!onSendCommand) return;
    onSendCommand({ type: 'MRPAK_CMD_SET_MOVE_MODE', mode: moveMode, unit: moveUnit, grid: 8 });
  }, [moveMode, moveUnit, onSendCommand]);

  // Отдельный useEffect только для локальных data-атрибутов iframe.
  useEffect(() => {
    if (!selectedBlock?.id || !isMoveModeInitialized) return;
    
    const element = document.querySelector(`[data-no-code-ui-id="${selectedBlock.id}"]`) ||
                    document.querySelector(`[data-mrpak-id="${selectedBlock.id}"]`);
    if (element) {
      element.setAttribute('data-move-mode', moveMode);
      element.setAttribute('data-move-unit', moveMode === 'grid8' ? 'px' : moveUnit);
    }
  }, [moveMode, moveUnit, selectedBlock?.id, isMoveModeInitialized]);

  const canApply = !!selectedBlock?.id;

  const patch = useMemo(() => {
    const p: Record<string, any> = {};

    const setPx = (key: any, val: any) => {
      if (val == null || !Number.isFinite(val)) return;
      if (key === 'left' || key === 'top') {
        p[key] = formatMoveValue(val);
        return;
      }
      if (fileType === 'html') p[key] = `${val}px`;
      else p[key] = val; // React/RN: число = px
    };

    const moveKeys = getMovePatchKeys(moveMode);
    if (leftMode === 'value') setPx(moveKeys.x, left);
    else if (canUseAutoOffsets) p[moveKeys.x] = 'auto';
    if (topMode === 'value') setPx(moveKeys.y, top);
    else if (canUseAutoOffsets) p[moveKeys.y] = 'auto';
    if (widthMode === 'value') setPx('width', width);
    else if (supportsCssSpecialValues) p.width = widthMode;
    if (heightMode === 'value') setPx('height', height);
    else if (supportsCssSpecialValues) p.height = heightMode;

    if (bg) {
      // В HTML ожидаем lower/kebab, но background-color тоже ок как backgroundColor? -> используем background-color
      if (fileType === 'html') p['background-color'] = bg;
      else p.backgroundColor = bg;
    }
    if (color) {
      if (fileType === 'html') p.color = color;
      else p.color = color;
    }

    if (leftMode !== 'value' || topMode !== 'value' || left != null || top != null) {
      p.position = moveMode === 'grid8' ? 'absolute' : moveMode;
      if (moveMode === 'relative') {
        p.left = '';
        p.top = '';
      }
    }

    return p;
  }, [fileType, left, top, width, height, bg, color, moveMode, moveUnit, leftMode, topMode, widthMode, heightMode, canUseAutoOffsets, supportsCssSpecialValues]);

  const handleApply = () => {
    if (!canApply) return;
    const fullPatch = { ...patch, ...diffAgainstBaseline(buildCurrentStylePatch()) };
    if (Object.keys(fullPatch).length === 0) return;

    if (onStagePatch) {
      onStagePatch(selectedBlock.id, fullPatch);
    }

    if (onSendCommand) {
      onSendCommand({
        type: 'MRPAK_CMD_SET_STYLE',
        id: selectedBlock.id,
        patch: fullPatch,
        fileType,
      });
    }

    onApplyPatch(selectedBlock.id, fullPatch);
  };

  const buildCurrentStylePatch = () => {
    if (styleMode === 'text') {
      return buildPatchFromText({ fileType, text: styleText });
    }
    return buildPatchFromKv({ fileType, rows: styleRows });
  };

  const diffAgainstBaseline = (patchObj: Record<string, any>) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(patchObj || {})) {
      if (!k) continue;
      const base = baselineMap ? baselineMap[k] : undefined;
      // сравнение строк/чисел/булевых
      if (base === undefined) {
        out[k] = v;
        continue;
      }
      if (typeof base === 'number' && typeof v === 'number') {
        if (base !== v) out[k] = v;
        continue;
      }
      if (typeof base === 'boolean' && typeof v === 'boolean') {
        if (base !== v) out[k] = v;
        continue;
      }
      if (base === null && v === null) continue;
      // строковое сравнение
      const bs = String(base).trim();
      const vs = String(v).trim();
      if (bs !== vs) out[k] = v;
    }
    return out;
  };

  const stageLocalStyles = () => {
    if (!canApply) return;
    
    // Защита от двойного клика (debounce 300ms)
    const now = Date.now();
    if (now - lastStageTimeRef.current < 300) {
      return;
    }
    lastStageTimeRef.current = now;
    
    const stylePatch = diffAgainstBaseline(buildCurrentStylePatch());
    // Stage для записи
    if (onStagePatch) {
      onStagePatch(selectedBlock.id, stylePatch);
    }
    // Локально применяем в iframe (без записи)
    if (onSendCommand) {
      onSendCommand({ type: 'MRPAK_CMD_SET_STYLE', id: selectedBlock.id, patch: stylePatch, fileType });
    }
  };

  const [insertMode, setInsertMode] = useState<string | null>(null); // 'child'|'sibling'|null
  const [insertTag, setInsertTag] = useState(fileType === 'react-native' ? 'View' : 'div');
  const [insertText, setInsertText] = useState('Новый блок');
  const [insertStyleMode, setInsertStyleMode] = useState('kv');
  const [insertStyleRows, setInsertStyleRows] = useState([{ key: '', value: '' }]);
  const [insertStyleText, setInsertStyleText] = useState('');
  
  // Защита от двойного клика
  const lastInsertTimeRef = useRef(0);
  const lastDeleteTimeRef = useRef(0);
  const lastStageTimeRef = useRef(0);
  const lastSetTextTimeRef = useRef(0);
  const styles = blockEditorPanelStyles;

  const buildInsertSnippet = () => {
    const patch =
      insertStyleMode === 'text'
        ? buildPatchFromText({ fileType, text: insertStyleText })
        : buildPatchFromKv({ fileType, rows: insertStyleRows });

    // Используем framework.buildInsertSnippet, если framework доступен
    if (framework && typeof framework.buildInsertSnippet === 'function') {
      return framework.buildInsertSnippet({
        tag: insertTag || (fileType === 'react-native' ? 'View' : 'div'),
        text: insertText || 'Новый блок',
        stylePatch: patch,
      });
    }

    // Fallback для случаев, когда framework еще не создан
    if (fileType === 'html') {
      const styleAttr = toHtmlStyleAttr(patch);
      const attrs = styleAttr ? ` style="${styleAttr}"` : '';
      const tag = insertTag || 'div';
      const body = insertText || '';
      
      // Для plain HTML используем inline onclick, чтобы не требовать внешних функций
      const isButton = tag.toLowerCase() === 'button';
      const onClickAttr = isButton
        ? ` onclick="(function(ev){try{ev&&ev.preventDefault&&ev.preventDefault();console.log('Button clicked');}catch(e){}})(event)"`
        : '';
      
      return `<${tag}${attrs}${onClickAttr}>${body}</${tag}>`;
    }

    // react / react-native
    const styleObj = toReactStyleObjectText(patch);
    const styleAttr = styleObj ? ` style={{${styleObj}}}` : '';
    
    if (fileType === 'react-native') {
      if (insertTag === 'Text') {
        return `<Text${styleAttr}>${insertText || 'Новый текст'}</Text>`;
      }
      
      // TouchableOpacity: вшиваем inline onPress, чтобы не создавать лишних обработчиков в коде
      const isButton = insertTag === 'TouchableOpacity';
      const onPressAttr = isButton
        ? ` onPress={() => { try { console.log('Button pressed'); } catch(e) {} }}`
        : '';
      
      // View/TouchableOpacity: вложим Text для читаемости
      return `<${insertTag}${styleAttr}${onPressAttr}><Text>${insertText || 'Новый блок'}</Text></${insertTag}>`;
    }

    // react web
    const isButton = insertTag === 'button';
    const onClickAttr = isButton
      ? ` onClick={(e) => { try { e?.preventDefault?.(); console.log('Button clicked'); } catch(_) {} }}`
      : '';
    
    return `<${insertTag}${styleAttr}${onClickAttr}>${insertText || 'Новый блок'}</${insertTag}>`;
  };

  const handleDeleteSelected = () => {
    if (!selectedBlock?.id) return;
    const now = Date.now();
    if (now - lastDeleteTimeRef.current < 300) return;
    lastDeleteTimeRef.current = now;
    onDeleteBlock && onDeleteBlock(selectedBlock.id);
  };

  const handleConfirmInsert = () => {
    console.log('[BlockEditorPanel] 🔵 Кнопка "Добавить" нажата');
    if (!selectedBlock?.id || !insertMode) {
      console.warn('[BlockEditorPanel] selectedBlock.id или insertMode отсутствует');
      return;
    }

    const now = Date.now();
    if (now - lastInsertTimeRef.current < 300) {
      console.warn('[BlockEditorPanel] ❌ ДУБЛИРОВАНИЕ КЛИКА предотвращено!', {
        timeDiff: now - lastInsertTimeRef.current
      });
      return;
    }

    lastInsertTimeRef.current = now;
    const snippet = buildInsertSnippet();
    console.log('[BlockEditorPanel] Сниппет сгенерирован:', snippet);
    onInsertBlock && onInsertBlock({ targetId: selectedBlock.id, mode: insertMode, snippet });
    setInsertMode(null);
  };

  const handleStageText = () => {
    if (!canApply || !selectedBlock?.id) return;
    const now = Date.now();
    if (now - lastSetTextTimeRef.current < 300) return;
    lastSetTextTimeRef.current = now;
    onSetText && onSetText({ blockId: selectedBlock.id, text: textValue });
  };

  const handleApplyReparent = () => {
    if (!selectedBlock?.id || !reparentTargetId) return;
    onReparentBlock && onReparentBlock({ sourceId: selectedBlock.id, targetParentId: reparentTargetId });
    setReparentMode(false);
    setReparentTargetId(null);
  };

  const handleToggleReparentMode = () => {
    setReparentMode((value) => !value);
    setReparentTargetId(null);
  };

  // ВАЖНО: стабилизируем source объект, иначе WebView пересоздаёт iframe на каждый ререндер
  // (например, при клике по блоку и обновлении selectedBlock).
  const shortId = (id: any) => {
    const s = String(id || '');
    return s.length > 28 ? s.slice(0, 28) + '…' : s;
  };

  const isDescendantNode = (possibleParentId: string, possibleChildId: string) => {
    const nodes = layersTree?.nodes || {};
    const firstLevel = Array.isArray(nodes?.[possibleParentId]?.childIds)
      ? nodes[possibleParentId].childIds
      : [];
    const stack = firstLevel.map((id: any) => String(id));
    const visited = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      if (current === possibleChildId) return true;
      visited.add(current);
      const childIds = nodes?.[current]?.childIds;
      if (Array.isArray(childIds) && childIds.length) {
        stack.push(...childIds.map((id: any) => String(id)));
      }
    }
    return false;
  };

  const calculateDropZone = (event: any): 'before' | 'inside' | 'after' => {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (!rect) return 'inside';
    const y = event?.clientY ?? event?.nativeEvent?.clientY ?? rect.top + rect.height / 2;
    const ratio = (y - rect.top) / Math.max(rect.height, 1);
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'inside';
  };

  const commitTreeReparent = (sourceIdRaw: any, targetIdRaw: any, zone: 'before' | 'inside' | 'after') => {
    const sourceId = String(sourceIdRaw || '');
    const targetId = String(targetIdRaw || '');
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (isDescendantNode(sourceId, targetId)) return;

    const nodes = layersTree?.nodes || {};
    const targetNode = nodes[targetId];
    if (!targetNode) return;

    if (zone === 'inside') {
      onReparentBlock && onReparentBlock({ sourceId, targetParentId: targetId });
      return;
    }

    const targetParentId = targetNode.parentId ? String(targetNode.parentId) : '';
    if (!targetParentId || sourceId === targetParentId) return;

    const siblings: string[] = Array.isArray(nodes?.[targetParentId]?.childIds)
      ? nodes[targetParentId].childIds.map((id: any) => String(id))
      : [];
    const targetIndex = siblings.indexOf(targetId);
    if (targetIndex < 0) return;

    let targetBeforeId: string | null = targetId;
    if (zone === 'after') {
      targetBeforeId = siblings[targetIndex + 1] || null;
    }
    if (targetBeforeId === sourceId) return;

    onReparentBlock && onReparentBlock({ sourceId, targetParentId, targetBeforeId });
  };

  const renderTreeNode = (id: any, depth = 0) => {
    if (!layersTree?.nodes?.[id]) return null;
    const node = layersTree.nodes[id];
    const isSelected = selectedBlock?.id === id;
    const isDrop = reparentMode && reparentTargetId === id;
    const customName = (layerNames && layerNames[id]) ? String(layerNames[id]).trim() : '';
    const title = customName || `${(node.tagName || '').toLowerCase()} · ${shortId(id)}`;

    const displayTitle = node?.isIsolatedComponent
      ? (customName || `${node?.componentName || node?.tagName || node?.sourceBasename || 'component'}`)
      : title;
    const dragHighlightStyle = treeDropHint?.targetId === String(id)
      ? (
        treeDropHint.zone === 'inside'
          ? { boxShadow: 'inset 0 0 0 1px rgba(34,197,94,0.95)', backgroundColor: 'rgba(34,197,94,0.16)' }
          : treeDropHint.zone === 'before'
            ? { boxShadow: 'inset 0 2px 0 rgba(59,130,246,0.95)' }
            : { boxShadow: 'inset 0 -2px 0 rgba(59,130,246,0.95)' }
      )
      : null;

    return (
      <View key={id} style={{ marginLeft: depth * 10, marginBottom: 6 }}>
        <div
          draggable={true}
          onDragStart={(event: any) => {
            const sourceId = String(id);
            setDragSourceId(sourceId);
            setTreeDropHint(null);
            try {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', sourceId);
            } catch (_) {}
          }}
          onDragOver={(event: any) => {
            if (!dragSourceId || dragSourceId === String(id)) return;
            if (isDescendantNode(dragSourceId, String(id))) return;
            const zone = calculateDropZone(event);
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setTreeDropHint({ targetId: String(id), zone });
          }}
          onDrop={(event: any) => {
            event.preventDefault();
            const sourceId = dragSourceId || event?.dataTransfer?.getData?.('text/plain');
            const zone = treeDropHint?.targetId === String(id) ? treeDropHint.zone : calculateDropZone(event);
            if (!sourceId) return;
            commitTreeReparent(sourceId, id, zone);
            setTreeDropHint(null);
            setDragSourceId(null);
          }}
          onDragEnd={() => {
            setTreeDropHint(null);
            setDragSourceId(null);
          }}
        >
        <TouchableOpacity
          style={[
            blockEditorPanelStyles.layerRow,
            isSelected && blockEditorPanelStyles.layerRowSelected,
            isDrop && blockEditorPanelStyles.layerRowDropTarget,
            dragHighlightStyle as any,
          ]}
          onPress={(event: any) => {
            const nativeEvent = event?.nativeEvent || event;
            if ((nativeEvent?.ctrlKey || nativeEvent?.metaKey) && node?.sourceFilePath && onOpenFile) {
              onOpenFile(node.sourceFilePath);
              return;
            }
            if (reparentMode) {
              setReparentTargetId(id);
            } else if (onSendCommand) {
              onSendCommand({ type: 'MRPAK_CMD_SELECT', id });
            }
          }}
        >
          <Text style={blockEditorPanelStyles.layerRowText} numberOfLines={1}>{displayTitle}</Text>
          {reparentMode && (
            <Text style={blockEditorPanelStyles.reparentMark}>
              {reparentTargetId === id ? '✓' : ''}
            </Text>
          )}
          <TouchableOpacity
            style={blockEditorPanelStyles.layerEditBtn}
            onPress={() => {
              setEditingLayerId(id);
              setEditingLayerName(customName || '');
            }}
          >
            <Text style={styles.layerEditBtnText}>✎</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        </div>

        {editingLayerId === id && (
          <View style={blockEditorPanelStyles.layerEditBox}>
            <input
              style={htmlInputStyle}
              type="text"
              value={editingLayerName}
              placeholder="Имя слоя"
              onChange={(e) => setEditingLayerName(e.target.value)}
            />
            <View style={blockEditorPanelStyles.layerEditActions}>
              <TouchableOpacity
                style={styles.layerSaveBtn}
                onPress={() => {
                  if (onRenameLayer) onRenameLayer(id, editingLayerName);
                  setEditingLayerId(null);
                }}
              >
                <Text style={styles.layerSaveBtnText}>Сохранить</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.layerCancelBtn}
                onPress={() => setEditingLayerId(null)}
              >
                <Text style={styles.layerCancelBtnText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!node?.isIsolatedComponent && Array.isArray(node.childIds) && node.childIds.length > 0 && (
          <View style={{ marginTop: 6 }}>
            {node.childIds.map((cid: any) => renderTreeNode(cid, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  return {
    styles: blockEditorPanelStyles,
    canUndo,
    canRedo,
    selectedBlockIds,
    onExtractSelection,
    onOpenFile,
    onUndo,
    onRedo,
    selectedBlock,
    layersTree,
    renderTreeNode,
    fileType,
    setInsertMode,
    insertMode,
    insertTag,
    setInsertTag,
    insertText,
    setInsertText,
    insertStyleMode,
    setInsertStyleMode,
    insertStyleRows,
    setInsertStyleRows,
    insertStyleText,
    setInsertStyleText,
    handleDeleteSelected,
    handleConfirmInsert,
    reparentMode,
    setReparentMode,
    reparentTargetId,
    setReparentTargetId,
    handleToggleReparentMode,
    handleApplyReparent,
    livePosition,
    left,
    top,
    width,
    height,
    leftMode,
    topMode,
    widthMode,
    heightMode,
    handleLeftChange,
    handleTopChange,
    handleWidthChange,
    handleHeightChange,
    handleLeftModeChange,
    handleTopModeChange,
    handleWidthModeChange,
    handleHeightModeChange,
    NumberField,
    textValue,
    setTextValue,
    handleStageText,
    TextField,
    moveMode,
    handleMoveModeChange,
    moveUnit,
    handleMoveUnitChange,
    handlePositionPreset,
    onSendCommand,
    styleMode,
    setStyleMode,
    styleRows,
    setStyleRows,
    styleText,
    setStyleText,
    stageLocalStyles,
    styleSnapshot,
    bg,
    setBg,
    color,
    setColor,
    canApply,
    handleApply,
  };
}

function BlockEditorPanelComponent({
  fileType,
  html,
  onMessage,
  outgoingMessage,
}: Pick<BlockEditorPanelProps, 'fileType' | 'html' | 'onMessage' | 'outgoingMessage'>) {
  const webSource = useMemo(() => ({ html }), [html]);
  const webViewKey = useMemo(
    () => `block-editor-webview-${fileType}-${html ? html.length : 0}`,
    [fileType, html]
  );

  return (
    <View style={blockEditorPanelStyles.preview}>
      <WebView
        key={webViewKey}
        source={webSource}
        style={blockEditorPanelStyles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        allowExternalScripts={true}
        onMessage={onMessage}
        outgoingMessage={outgoingMessage}
      />
    </View>
  );
}

const BlockEditorPanel = memo(
  BlockEditorPanelComponent,
  (prevProps, nextProps) =>
    prevProps.fileType === nextProps.fileType &&
    prevProps.html === nextProps.html &&
    prevProps.onMessage === nextProps.onMessage &&
    prevProps.outgoingMessage === nextProps.outgoingMessage
);

export default BlockEditorPanel;

export const blockEditorPanelStyles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    minHeight: 600,
    backgroundColor: '#ffffff',
  },
  sidebar: {
    width: 320,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.1)',
    padding: 12,
    backgroundColor: '#0f172a',
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarScrollContent: {
    paddingBottom: 60,
  },
  sidebarTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  sidebarMeta: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginBottom: 12,
  },
  section: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  stylesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stylesTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 2,
  },
  stylesTab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  stylesTabActive: {
    backgroundColor: '#667eea',
  },
  stylesTabText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  stylesActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  layerRowSelected: {
    backgroundColor: 'rgba(102,126,234,0.25)',
  },
  layerRowDropTarget: {
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.65)',
  },
  layerRowText: {
    flex: 1,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  layerEditBtn: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  layerEditBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  layerEditBox: {
    marginTop: 8,
  },
  layerEditActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  layerSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  layerSaveBtnText: {
    color: '#0b1220',
    fontWeight: '800',
    fontSize: 12,
  },
  layerCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  layerCancelBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  layerOpsRow: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  layerOpBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginRight: 8,
    marginBottom: 8,
  },
  layerOpBtnDanger: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.85)',
    marginRight: 8,
    marginBottom: 8,
  },
  layerOpBtnDisabled: {
    opacity: 0.4,
  },
  layerOpBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  insertBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  insertTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  insertLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 6,
  },
  insertActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  reparentBox: {
    marginTop: 10,
  },
  reparentMark: {
    width: 16,
    textAlign: 'center',
    color: '#22c55e',
    fontWeight: '900',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    width: 70,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginRight: 8,
  },
  applyBtn: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#667eea',
    alignItems: 'center',
  },
  applyBtnDisabled: {
    backgroundColor: 'rgba(102,126,234,0.3)',
  },
  applyBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  hint: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 16,
  },
  preview: {
    flex: 1,
    backgroundColor: '#ffffff',
    minHeight: 0,
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 0,
    backgroundColor: '#ffffff',
  },
  undoRedoContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  undoRedoBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(102, 126, 234, 0.8)',
    alignItems: 'center',
  },
  undoRedoBtnDisabled: {
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
    opacity: 0.5,
  },
  undoRedoBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
