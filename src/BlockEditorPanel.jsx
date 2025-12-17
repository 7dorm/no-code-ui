import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
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

export default function BlockEditorPanel({
  fileType,
  html,
  selectedBlock,
  onMessage,
  onApplyPatch,
  onStagePatch,
  styleSnapshot,
  textSnapshot,
  layersTree,
  layerNames,
  onRenameLayer,
  outgoingMessage,
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
}) {
  const [left, setLeft] = useState(null);
  const [top, setTop] = useState(null);
  const [width, setWidth] = useState(null);
  const [height, setHeight] = useState(null);
  const [bg, setBg] = useState('');
  const [color, setColor] = useState('');
  const [editingLayerId, setEditingLayerId] = useState(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [styleMode, setStyleMode] = useState('kv'); // 'kv' | 'text'
  const [styleRows, setStyleRows] = useState([{ key: '', value: '' }]);
  const [styleText, setStyleText] = useState('');
  const [baselineMap, setBaselineMap] = useState({}); // normalizedKey -> normalizedValue
  const [textValue, setTextValue] = useState('');
  const [reparentMode, setReparentMode] = useState(false);
  const [reparentTargetId, setReparentTargetId] = useState(null);
  const [moveMode, setMoveMode] = useState('absolute'); // absolute | relative | grid8

  useEffect(() => {
    // При выборе блока сбрасываем форму (MVP: не пытаемся читать текущие стили)
    setLeft(null);
    setTop(null);
    setWidth(null);
    setHeight(null);
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
    const norm = {};
    for (const [k, v] of Object.entries(raw)) {
      const nk = normalizeStyleKey({ fileType, key: k });
      if (!nk) continue;
      if (fileType === 'html') {
        norm[nk] = String(v).trim();
      } else {
        norm[nk] = parseValueForReactLike(v);
      }
    }
    setBaselineMap(norm);
    setTextValue(styleSnapshot?.textContent || '');
    setReparentMode(false);
    setReparentTargetId(null);
  }, [selectedBlock?.id]);
  useEffect(() => {
    if (!onSendCommand) return;
    onSendCommand({ type: 'MRPAK_CMD_SET_MOVE_MODE', mode: moveMode, grid: 8 });
  }, [moveMode, onSendCommand]);

  const canApply = !!selectedBlock?.id;

  const patch = useMemo(() => {
    const p = {};

    const setPx = (key, val) => {
      if (val == null || !Number.isFinite(val)) return;
      if (fileType === 'html') p[key] = `${val}px`;
      else p[key] = val; // React/RN: число = px
    };

    setPx('left', left);
    setPx('top', top);
    setPx('width', width);
    setPx('height', height);

    if (bg) {
      // В HTML ожидаем lower/kebab, но background-color тоже ок как backgroundColor? -> используем background-color
      if (fileType === 'html') p['background-color'] = bg;
      else p.backgroundColor = bg;
    }
    if (color) {
      if (fileType === 'html') p.color = color;
      else p.color = color;
    }

    // Если пользователь задал left/top — делаем absolute (чтобы движение было видно)
    if ((left != null || top != null) && (fileType === 'react' || fileType === 'react-native')) {
      p.position = 'absolute';
    }
    if ((left != null || top != null) && fileType === 'html') {
      p.position = 'absolute';
    }

    return p;
  }, [fileType, left, top, width, height, bg, color]);

  const handleApply = () => {
    if (!canApply) return;
    onApplyPatch(selectedBlock.id, { ...patch, ...diffAgainstBaseline(buildCurrentStylePatch()) });
  };

  const buildCurrentStylePatch = () => {
    if (styleMode === 'text') {
      return buildPatchFromText({ fileType, text: styleText });
    }
    return buildPatchFromKv({ fileType, rows: styleRows });
  };

  const diffAgainstBaseline = (patchObj) => {
    const out = {};
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

  const [insertMode, setInsertMode] = useState(null); // 'child'|'sibling'|null
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

  // ВАЖНО: стабилизируем source объект, иначе WebView пересоздаёт iframe на каждый ререндер
  // (например, при клике по блоку и обновлении selectedBlock).
  const webSource = useMemo(() => ({ html }), [html]);
  const webViewKey = useMemo(
    () => `block-editor-webview-${fileType}-${html ? html.length : 0}`,
    [fileType, html]
  );

  const shortId = (id) => {
    const s = String(id || '');
    return s.length > 28 ? s.slice(0, 28) + '…' : s;
  };

  const renderTreeNode = (id, depth = 0) => {
    if (!layersTree?.nodes?.[id]) return null;
    const node = layersTree.nodes[id];
    const isSelected = selectedBlock?.id === id;
    const isDrop = reparentMode && reparentTargetId === id;
    const customName = (layerNames && layerNames[id]) ? String(layerNames[id]).trim() : '';
    const title = customName || `${(node.tagName || '').toLowerCase()} · ${shortId(id)}`;

    return (
      <View key={id} style={{ marginLeft: depth * 10, marginBottom: 6 }}>
        <TouchableOpacity
          style={[
            styles.layerRow,
            isSelected && styles.layerRowSelected,
            isDrop && styles.layerRowDropTarget,
          ]}
          onPress={() => {
            if (reparentMode) {
              setReparentTargetId(id);
            } else if (onSendCommand) {
              onSendCommand({ type: 'MRPAK_CMD_SELECT', id });
            }
          }}
        >
          <Text style={styles.layerRowText} numberOfLines={1}>{title}</Text>
          {reparentMode && (
            <Text style={styles.reparentMark}>
              {reparentTargetId === id ? '✓' : ''}
            </Text>
          )}
          <TouchableOpacity
            style={styles.layerEditBtn}
            onPress={() => {
              setEditingLayerId(id);
              setEditingLayerName(customName || '');
            }}
          >
            <Text style={styles.layerEditBtnText}>✎</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {editingLayerId === id && (
          <View style={styles.layerEditBox}>
            <input
              style={htmlInputStyle}
              type="text"
              value={editingLayerName}
              placeholder="Имя слоя"
              onChange={(e) => setEditingLayerName(e.target.value)}
            />
            <View style={styles.layerEditActions}>
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

        {Array.isArray(node.childIds) && node.childIds.length > 0 && (
          <View style={{ marginTop: 6 }}>
            {node.childIds.map((cid) => renderTreeNode(cid, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <ScrollView style={styles.sidebarScroll} contentContainerStyle={styles.sidebarScrollContent}>
        
        {/* Кнопки Undo/Redo */}
        <View style={styles.undoRedoContainer}>
          <TouchableOpacity
            style={[styles.undoRedoBtn, !canUndo && styles.undoRedoBtnDisabled]}
            onPress={onUndo}
            disabled={!canUndo}
          >
            <Text style={styles.undoRedoBtnText}>↶ Отменить (Ctrl+Z)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.undoRedoBtn, !canRedo && styles.undoRedoBtnDisabled]}
            onPress={onRedo}
            disabled={!canRedo}
          >
            <Text style={styles.undoRedoBtnText}>↷ Повторить (Ctrl+Shift+Z)</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.sidebarTitle}>Блок</Text>
        <Text style={styles.sidebarMeta}>
          {selectedBlock?.id ? selectedBlock.id : 'Ничего не выбрано'}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Слои</Text>
          {layersTree?.rootIds?.length ? (
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {layersTree.rootIds.map((rid) => renderTreeNode(rid, 0))}
            </div>
          ) : (
            <Text style={styles.hint}>Дерево слоёв загружается…</Text>
          )}

          <View style={styles.layerOpsRow}>
            <TouchableOpacity
              style={[styles.layerOpBtn, !selectedBlock?.id && styles.layerOpBtnDisabled]}
              disabled={!selectedBlock?.id}
              onPress={() => {
                if (!selectedBlock?.id) return;
                setInsertMode('child');
              }}
            >
              <Text style={styles.layerOpBtnText}>+ child</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.layerOpBtn, !selectedBlock?.id && styles.layerOpBtnDisabled]}
              disabled={!selectedBlock?.id}
              onPress={() => {
                if (!selectedBlock?.id) return;
                setInsertMode('sibling');
              }}
            >
              <Text style={styles.layerOpBtnText}>+ sibling</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.layerOpBtnDanger, !selectedBlock?.id && styles.layerOpBtnDisabled]}
              disabled={!selectedBlock?.id}
              onPress={() => {
                if (!selectedBlock?.id) return;
                
                // Защита от двойного клика (debounce 300ms)
                const now = Date.now();
                if (now - lastDeleteTimeRef.current < 300) {
                  return;
                }
                lastDeleteTimeRef.current = now;
                
                onDeleteBlock && onDeleteBlock(selectedBlock.id);
              }}
            >
              <Text style={styles.layerOpBtnText}>Удалить</Text>
            </TouchableOpacity>
          </View>

          {insertMode && (
            <View style={styles.insertBox}>
              <Text style={styles.insertTitle}>Добавить блок ({insertMode})</Text>

              <Text style={styles.insertLabel}>Тип</Text>
              <select
                style={{ ...htmlInputStyle, height: '36px' }}
                value={insertTag}
                onChange={(e) => setInsertTag(e.target.value)}
              >
                {fileType === 'react-native' ? (
                  <>
                    <option value="View">View</option>
                    <option value="Text">Text</option>
                    <option value="TouchableOpacity">TouchableOpacity</option>
                  </>
                ) : fileType === 'react' ? (
                  <>
                    <option value="div">div</option>
                    <option value="span">span</option>
                    <option value="button">button</option>
                    <option value="section">section</option>
                  </>
                ) : (
                  <>
                    <option value="div">div</option>
                    <option value="span">span</option>
                    <option value="button">button</option>
                    <option value="section">section</option>
                  </>
                )}
              </select>

              <Text style={styles.insertLabel}>Текст</Text>
              <input
                style={htmlInputStyle}
                type="text"
                value={insertText}
                onChange={(e) => setInsertText(e.target.value)}
              />

              <View style={styles.stylesHeaderRow}>
                <Text style={styles.insertLabel}>Стили</Text>
                <View style={styles.stylesTabs}>
                  <TouchableOpacity
                    style={[styles.stylesTab, insertStyleMode === 'kv' && styles.stylesTabActive]}
                    onPress={() => setInsertStyleMode('kv')}
                  >
                    <Text style={styles.stylesTabText}>KV</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.stylesTab, insertStyleMode === 'text' && styles.stylesTabActive]}
                    onPress={() => setInsertStyleMode('text')}
                  >
                    <Text style={styles.stylesTabText}>Text</Text>
                  </TouchableOpacity>
                </View>

          <View style={styles.reparentBox}>
            <TouchableOpacity
              style={styles.layerOpBtn}
              onPress={() => {
                setReparentMode((v) => !v);
                setReparentTargetId(null);
              }}
            >
              <Text style={styles.layerOpBtnText}>
                {reparentMode ? 'Отмена переноса' : 'Перенести: выбрать родителя'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.layerSaveBtn,
                (!selectedBlock?.id || !reparentTargetId) && styles.layerOpBtnDisabled,
              ]}
              disabled={!selectedBlock?.id || !reparentTargetId}
              onPress={() => {
                if (!selectedBlock?.id || !reparentTargetId) return;
                onReparentBlock && onReparentBlock({ sourceId: selectedBlock.id, targetParentId: reparentTargetId });
                setReparentMode(false);
                setReparentTargetId(null);
              }}
            >
              <Text style={styles.layerSaveBtnText}>Перенести в выбранного</Text>
            </TouchableOpacity>
          </View>
              </View>

              {insertStyleMode === 'kv' ? (
                <div style={{ maxHeight: 120, overflow: 'auto' }}>
                  {insertStyleRows.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        style={htmlInputStyle}
                        type="text"
                        placeholder={fileType === 'html' ? 'prop-kebab' : 'propCamel'}
                        value={row.key}
                        onChange={(e) => {
                          const v = e.target.value;
                          setInsertStyleRows((prev) => prev.map((r, i) => (i === idx ? { ...r, key: v } : r)));
                        }}
                      />
                      <input
                        style={htmlInputStyle}
                        type="text"
                        placeholder="value"
                        value={row.value}
                        onChange={(e) => {
                          const v = e.target.value;
                          setInsertStyleRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: v } : r)));
                        }}
                      />
                      <button
                        style={{
                          height: '32px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          padding: '0 10px',
                          cursor: 'pointer',
                        }}
                        onClick={() => setInsertStyleRows((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <textarea
                  style={{
                    width: '100%',
                    minHeight: '110px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.25)',
                    color: '#fff',
                    padding: '10px',
                    outline: 'none',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                  }}
                  placeholder={'color: red;\nwidth: 120px;'}
                  value={insertStyleText}
                  onChange={(e) => setInsertStyleText(e.target.value)}
                />
              )}

              <View style={styles.insertActionsRow}>
                <TouchableOpacity
                  style={styles.layerOpBtn}
                  onPress={() => setInsertStyleRows((prev) => [...prev, { key: '', value: '' }])}
                >
                  <Text style={styles.layerOpBtnText}>+ стиль</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.layerSaveBtn}
                  onPress={() => {
                    console.log('[BlockEditorPanel] 🔵 Кнопка "Добавить" нажата');
                    
                    if (!selectedBlock?.id) {
                      console.warn('[BlockEditorPanel] selectedBlock.id отсутствует');
                      return;
                    }
                    
                    // Защита от двойного клика (debounce 300ms)
                    const now = Date.now();
                    if (now - lastInsertTimeRef.current < 300) {
                      console.warn('[BlockEditorPanel] ❌ ДУБЛИРОВАНИЕ КЛИКА предотвращено!', {
                        timeDiff: now - lastInsertTimeRef.current
                      });
                      return;
                    }
                    lastInsertTimeRef.current = now;
                    
                    console.log('[BlockEditorPanel] ✅ Генерирую сниппет...');
                    const snippet = buildInsertSnippet();
                    console.log('[BlockEditorPanel] Сниппет сгенерирован:', snippet);
                    console.log('[BlockEditorPanel] Вызываю onInsertBlock...', { 
                      targetId: selectedBlock.id, 
                      mode: insertMode 
                    });
                    onInsertBlock && onInsertBlock({ targetId: selectedBlock.id, mode: insertMode, snippet });
                    setInsertMode(null);
                  }}
                >
                  <Text style={styles.layerSaveBtnText}>Добавить</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.layerCancelBtn} onPress={() => setInsertMode(null)}>
                  <Text style={styles.layerCancelBtnText}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Позиция/Размер</Text>
          <Text style={styles.insertLabel}>Режим перемещения</Text>
          <select
            style={{ ...htmlInputStyle, height: '36px', marginBottom: '10px' }}
            value={moveMode}
            onChange={(e) => setMoveMode(e.target.value)}
          >
            <option value="absolute">AbsoluteToParent</option>
            <option value="relative">Relative</option>
            <option value="grid8">GridSnap(8)</option>
          </select>
          <NumberField label="left" value={left} onChange={setLeft} />
          <NumberField label="top" value={top} onChange={setTop} />
          <NumberField label="width" value={width} onChange={setWidth} />
          <NumberField label="height" value={height} onChange={setHeight} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Текст</Text>
          <TextField label="text" value={textValue} onChange={setTextValue} placeholder="Текст блока" />
          <View style={styles.stylesActionsRow}>
            <TouchableOpacity
              style={[styles.layerOpBtn, !canApply && styles.layerOpBtnDisabled]}
              disabled={!canApply}
              onPress={() => {
                if (!canApply) return;
                
                // Защита от двойного клика (debounce 300ms)
                const now = Date.now();
                if (now - lastSetTextTimeRef.current < 300) {
                  return;
                }
                lastSetTextTimeRef.current = now;
                
                if (onSetText) {
                  onSetText({ blockId: selectedBlock.id, text: textValue });
                }
              }}
            >
              <Text style={styles.layerOpBtnText}>Stage текст</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.stylesHeaderRow}>
            <Text style={styles.sectionTitle}>Стили</Text>
            <View style={styles.stylesTabs}>
              <TouchableOpacity
                style={[styles.stylesTab, styleMode === 'kv' && styles.stylesTabActive]}
                onPress={() => setStyleMode('kv')}
              >
                <Text style={styles.stylesTabText}>KV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stylesTab, styleMode === 'text' && styles.stylesTabActive]}
                onPress={() => setStyleMode('text')}
              >
                <Text style={styles.stylesTabText}>Text</Text>
              </TouchableOpacity>
            </View>
          </View>

          {styleMode === 'kv' ? (
            <div style={{ maxHeight: 180, overflow: 'auto' }}>
              {styleRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    style={htmlInputStyle}
                    type="text"
                    placeholder={fileType === 'html' ? 'prop-kebab' : 'propCamel'}
                    value={row.key}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStyleRows((prev) => prev.map((r, i) => (i === idx ? { ...r, key: v } : r)));
                    }}
                  />
                  <input
                    style={htmlInputStyle}
                    type="text"
                    placeholder="value"
                    value={row.value}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStyleRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: v } : r)));
                    }}
                  />
                  <button
                    style={{
                      height: '32px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      padding: '0 10px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setStyleRows((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <textarea
              style={{
                width: '100%',
                minHeight: '160px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.25)',
                color: '#fff',
                padding: '10px',
                outline: 'none',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
              placeholder={'color: red;\nwidth: 120px;'}
              value={styleText}
              onChange={(e) => setStyleText(e.target.value)}
            />
          )}

          <View style={styles.stylesActionsRow}>
            <TouchableOpacity
              style={[styles.layerOpBtn, !canApply && styles.layerOpBtnDisabled]}
              disabled={!canApply}
              onPress={() => setStyleRows((prev) => [...prev, { key: '', value: '' }])}
            >
              <Text style={styles.layerOpBtnText}>+ стиль</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.layerOpBtn, !canApply && styles.layerOpBtnDisabled]}
              disabled={!canApply}
              onPress={stageLocalStyles}
            >
              <Text style={styles.layerOpBtnText}>Stage (локально)</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            HTML: kebab-case и px; React/RN: camelCase, числа можно без px.
          </Text>

          {styleSnapshot?.computedStyle && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px', marginBottom: '6px' }}>
                computed (для справки)
              </div>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  padding: '10px',
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: '11px',
                  lineHeight: '14px',
                  maxHeight: '120px',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(styleSnapshot.computedStyle, null, 2)}
              </pre>
            </div>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Цвета</Text>
          <TextField label="bg" value={bg} onChange={setBg} placeholder="#ffffff" />
          <TextField label="color" value={color} onChange={setColor} placeholder="#000000" />
        </View>

        <TouchableOpacity
          style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
          onPress={handleApply}
          disabled={!canApply}
        >
          <Text style={styles.applyBtnText}>Применить в файлы</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Подсказка: кликните по элементу в превью, чтобы выбрать блок.
        </Text>
        </ScrollView>
      </View>

      <View style={styles.preview}>
        <WebView
          key={webViewKey}
          source={webSource}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          allowExternalScripts={true}
          onMessage={onMessage}
          outgoingMessage={outgoingMessage}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
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
  },
  webview: {
    flex: 1,
    width: '100%',
    minHeight: 600,
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


