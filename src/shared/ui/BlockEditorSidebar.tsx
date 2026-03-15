import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

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

export function BlockEditorSidebar(props) {
  const {
    styles,
    canUndo,
    canRedo,
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
    onDeleteBlock,
    lastDeleteTimeRef,
    livePosition,
    left,
    top,
    width,
    height,
    handleLeftChange,
    handleTopChange,
    handleWidthChange,
    handleHeightChange,
    NumberField,
    textValue,
    setTextValue,
    handleStageText,
    onSetText,
    lastSetTextTimeRef,
    TextField,
    moveMode,
    handleMoveModeChange,
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
  } = props;

  const handleDeletePress = () => {
    if (typeof handleDeleteSelected === 'function') {
      handleDeleteSelected();
      return;
    }

    if (!selectedBlock?.id || !onDeleteBlock || !lastDeleteTimeRef) return;
    const now = Date.now();
    if (now - lastDeleteTimeRef.current < 300) return;
    lastDeleteTimeRef.current = now;
    onDeleteBlock(selectedBlock.id);
  };

  const handleStageTextPress = () => {
    if (typeof handleStageText === 'function') {
      handleStageText();
      return;
    }

    if (!canApply || !selectedBlock?.id || !onSetText || !lastSetTextTimeRef) return;
    const now = Date.now();
    if (now - lastSetTextTimeRef.current < 300) return;
    lastSetTextTimeRef.current = now;
    onSetText({ blockId: selectedBlock.id, text: textValue });
  };

  return (
    <View style={styles.sidebar}>
      <ScrollView
        style={styles.sidebarScroll}
        contentContainerStyle={styles.sidebarScrollContent}
      >
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
              {layersTree.rootIds.map((rid: any) => renderTreeNode(rid, 0))}
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
              onPress={handleDeletePress}
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
              </View>

              <View style={styles.reparentBox}>
                <TouchableOpacity
                  style={styles.layerOpBtn}
                  onPress={() => {
                    if (typeof handleToggleReparentMode === 'function') {
                      handleToggleReparentMode();
                      return;
                    }
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
                    if (typeof handleApplyReparent === 'function') {
                      handleApplyReparent();
                    }
                  }}
                >
                  <Text style={styles.layerSaveBtnText}>Перенести в выбранного</Text>
                </TouchableOpacity>
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
                          const value = e.target.value;
                          setInsertStyleRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, key: value } : r))
                          );
                        }}
                      />
                      <input
                        style={htmlInputStyle}
                        type="text"
                        placeholder="value"
                        value={row.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          setInsertStyleRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, value } : r))
                          );
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
                <TouchableOpacity style={styles.layerSaveBtn} onPress={handleConfirmInsert}>
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

          {typeof handleMoveModeChange === 'function' && (
            <>
              <Text style={styles.insertLabel}>Режим перемещения</Text>
              <select
                style={{ ...htmlInputStyle, height: '36px', marginBottom: '10px' }}
                value={moveMode || 'absolute'}
                onChange={(e) => handleMoveModeChange(e.target.value)}
              >
                <option value="absolute">AbsoluteToParent</option>
                <option value="relative">Relative</option>
                <option value="grid8">GridSnap(8)</option>
              </select>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginBottom: '10px' }}>
                {moveMode === 'absolute' && 'Позиционирование относительно родителя с точными координатами'}
                {moveMode === 'relative' && 'Позиционирование относительно текущей позиции элемента'}
                {moveMode === 'grid8' && 'Позиционирование с привязкой к сетке 8px для точного выравнивания'}
              </Text>
            </>
          )}

          <NumberField label="left" value={livePosition?.left ?? left} onChange={handleLeftChange} />
          <NumberField label="top" value={livePosition?.top ?? top} onChange={handleTopChange} />
          <NumberField label="width" value={livePosition?.width ?? width} onChange={handleWidthChange} />
          <NumberField label="height" value={livePosition?.height ?? height} onChange={handleHeightChange} />

          {livePosition && (
            livePosition.left !== null ||
            livePosition.top !== null ||
            livePosition.width !== null ||
            livePosition.height !== null
          ) && (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginTop: '6px', fontStyle: 'italic' }}>
              ● Обновляется в реальном времени
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Текст</Text>
          <TextField
            label="text"
            value={textValue}
            onChange={setTextValue}
            placeholder="Текст блока"
          />

          <View style={styles.stylesActionsRow}>
            <TouchableOpacity
              style={[styles.layerOpBtn, !canApply && styles.layerOpBtnDisabled]}
              disabled={!canApply}
              onPress={handleStageTextPress}
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
                      const value = e.target.value;
                      setStyleRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, key: value } : r))
                      );
                    }}
                  />
                  <input
                    style={htmlInputStyle}
                    type="text"
                    placeholder="value"
                    value={row.value}
                    onChange={(e) => {
                      const value = e.target.value;
                      setStyleRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, value } : r))
                      );
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
  );
}
