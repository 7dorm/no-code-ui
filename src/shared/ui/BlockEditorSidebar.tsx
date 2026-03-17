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
    selectedBlockIds,
    onExtractSelection,
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
    onSetText,
    lastSetTextTimeRef,
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

  const [sidebarTab, setSidebarTab] = React.useState<'inspector' | 'library'>('inspector');
  const [libraryDragTag, setLibraryDragTag] = React.useState<string | null>(null);
  const supportsCssSpecialValues = fileType !== 'react-native';
  const positionModeOptions =
    supportsCssSpecialValues && moveMode !== 'relative'
      ? [
          { value: 'value', label: 'Value' },
          { value: 'auto', label: 'Auto' },
        ]
      : null;
  const widthModeOptions = supportsCssSpecialValues
    ? [
        { value: 'value', label: 'Value' },
        { value: 'auto', label: 'Auto' },
        { value: 'min-content', label: 'Min' },
        { value: 'max-content', label: 'Max' },
        { value: 'fit-content', label: 'Fit' },
      ]
    : null;
  const heightModeOptions = supportsCssSpecialValues
    ? [
        { value: 'value', label: 'Value' },
        { value: 'auto', label: 'Auto' },
      ]
    : null;
  const blockLibraryItems =
    fileType === 'react-native'
      ? ['View', 'Text', 'TouchableOpacity', 'Image', 'ScrollView']
      : ['div', 'span', 'button', 'section', 'img'];

  const startLibraryDrag = (tag: string) => {
    if (!onSendCommand) return;
    setLibraryDragTag(tag);
    onSendCommand({ type: 'MRPAK_CMD_START_DRAG', source: 'library', tag });
  };

  React.useEffect(() => {
    if (!libraryDragTag || !onSendCommand || typeof window === 'undefined') return;
    const finish = () => {
      onSendCommand({ type: 'MRPAK_CMD_END_DRAG', source: 'library', tag: libraryDragTag });
      setLibraryDragTag(null);
    };
    window.addEventListener('mouseup', finish, true);
    window.addEventListener('touchend', finish, true);
    window.addEventListener('blur', finish, true);
    return () => {
      window.removeEventListener('mouseup', finish, true);
      window.removeEventListener('touchend', finish, true);
      window.removeEventListener('blur', finish, true);
    };
  }, [libraryDragTag, onSendCommand]);

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

        <View style={styles.stylesTabs}>
          <TouchableOpacity
            style={[styles.stylesTab, sidebarTab === 'inspector' && styles.stylesTabActive]}
            onPress={() => setSidebarTab('inspector')}
          >
            <Text style={styles.stylesTabText}>Inspector</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stylesTab, sidebarTab === 'library' && styles.stylesTabActive]}
            onPress={() => setSidebarTab('library')}
          >
            <Text style={styles.stylesTabText}>Library</Text>
          </TouchableOpacity>
        </View>

        {sidebarTab === 'inspector' ? (
          <>
        <Text style={styles.sidebarTitle}>Блок</Text>
        <Text style={styles.sidebarMeta}>
          {selectedBlock?.id ? selectedBlock.id : 'Ничего не выбрано'}
        </Text>

        <Text style={styles.hint}>
          Выбрано: {Array.isArray(selectedBlockIds) && selectedBlockIds.length > 0 ? selectedBlockIds.length : (selectedBlock?.id ? 1 : 0)}. Мультивыбор sibling: Ctrl+Shift+Click.
        </Text>
        <View style={styles.stylesActionsRow}>
          <TouchableOpacity
            style={[
              styles.layerSaveBtn,
              (!selectedBlock?.id && (!Array.isArray(selectedBlockIds) || selectedBlockIds.length === 0)) && styles.layerOpBtnDisabled,
            ]}
            disabled={!selectedBlock?.id && (!Array.isArray(selectedBlockIds) || selectedBlockIds.length === 0)}
            onPress={() => onExtractSelection?.()}
          >
            <Text style={styles.layerSaveBtnText}>Extract to file</Text>
          </TouchableOpacity>
        </View>

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
              <Text style={styles.insertLabel}>Единицы</Text>
              <select
                style={{ ...htmlInputStyle, height: '36px', marginBottom: '10px' }}
                value={moveMode === 'grid8' ? 'px' : (moveUnit || 'px')}
                onChange={(e) => handleMoveUnitChange?.(e.target.value as 'px' | '%')}
                disabled={moveMode === 'grid8'}
              >
                <option value="px">Pixels</option>
                <option value="%">Percent</option>
              </select>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginBottom: '10px' }}>
                {moveMode === 'absolute' && 'Позиционирование относительно родителя с точными координатами'}
                {moveMode === 'relative' && 'Позиционирование относительно текущей позиции элемента'}
                {moveMode === 'grid8' && 'Позиционирование с привязкой к сетке 8px для точного выравнивания'}
              </Text>
            </>
          )}

          <Text style={styles.insertLabel}>Позиционные пресеты</Text>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '6px',
              marginBottom: '12px',
            }}
          >
            {[
              { h: 'left', v: 'top', label: '↖' },
              { h: 'center', v: 'top', label: '↑' },
              { h: 'right', v: 'top', label: '↗' },
              { h: 'left', v: 'center', label: '←' },
              { h: 'center', v: 'center', label: '•' },
              { h: 'right', v: 'center', label: '→' },
              { h: 'left', v: 'bottom', label: '↙' },
              { h: 'center', v: 'bottom', label: '↓' },
              { h: 'right', v: 'bottom', label: '↘' },
            ].map((preset) => (
              <button
                key={preset.label}
                style={{
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  cursor: selectedBlock?.id ? 'pointer' : 'not-allowed',
                  opacity: selectedBlock?.id ? 1 : 0.45,
                  fontSize: '15px',
                  fontWeight: 700,
                }}
                disabled={!selectedBlock?.id}
                onClick={() =>
                  handlePositionPreset?.(
                    preset.h as 'left' | 'center' | 'right',
                    preset.v as 'top' | 'center' | 'bottom'
                  )
                }
              >
                {preset.label}
              </button>
            ))}
          </div>

          <NumberField
            label="left"
            value={leftMode === 'value' ? (livePosition?.left ?? left) : null}
            onChange={handleLeftChange}
            mode={leftMode}
            modeOptions={positionModeOptions}
            onModeChange={handleLeftModeChange}
          />
          <NumberField
            label="top"
            value={topMode === 'value' ? (livePosition?.top ?? top) : null}
            onChange={handleTopChange}
            mode={topMode}
            modeOptions={positionModeOptions}
            onModeChange={handleTopModeChange}
          />
          <NumberField
            label="width"
            value={widthMode === 'value' ? (livePosition?.width ?? width) : null}
            onChange={handleWidthChange}
            mode={widthMode}
            modeOptions={widthModeOptions}
            onModeChange={handleWidthModeChange}
          />
          <NumberField
            label="height"
            value={heightMode === 'value' ? (livePosition?.height ?? height) : null}
            onChange={handleHeightChange}
            mode={heightMode}
            modeOptions={heightModeOptions}
            onModeChange={handleHeightModeChange}
          />

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
          </>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Block Library</Text>
            <Text style={styles.hint}>Каталог блоков (заглушка, функционал добавим далее).</Text>
            {blockLibraryItems.map((item) => (
              <View key={`library-${item}`} style={{ marginBottom: '8px', opacity: 0.75 }}>
                <TouchableOpacity
                  style={styles.layerOpBtn}
                  onPressIn={() => startLibraryDrag(item)}
                >
                  <Text style={styles.layerOpBtnText}>+ {item}</Text>
                </TouchableOpacity>
              </View>
            ))}
            {libraryDragTag ? (
              <Text style={styles.hint}>Перетащите на холст. Колесико: смена target-родителя.</Text>
            ) : (
              <Text style={styles.hint}>Зажмите элемент и наведите на холст для вставки в child.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
