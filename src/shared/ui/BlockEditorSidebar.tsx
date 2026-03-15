import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

export function BlockEditorSidebar({
  styles,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedBlock,
  layersTree,
  renderTreeNode,
  setInsertMode,
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
  onSetText,
  lastSetTextTimeRef,

  TextField,

  bg,
  setBg,
  color,
  setColor,

  canApply,
  handleApply,
}) {
  return (
    <View style={styles.sidebar}>
      <ScrollView
        style={styles.sidebarScroll}
        contentContainerStyle={styles.sidebarScrollContent}
      >

        {/* Undo/Redo */}
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
            <Text style={styles.undoRedoBtnText}>
              ↷ Повторить (Ctrl+Shift+Z)
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sidebarTitle}>Блок</Text>

        <Text style={styles.sidebarMeta}>
          {selectedBlock?.id ? selectedBlock.id : "Ничего не выбрано"}
        </Text>

        {/* ====== СЛОИ ====== */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Слои</Text>

          {layersTree?.rootIds?.length ? (
            <div style={{ maxHeight: 240, overflow: "auto" }}>
              {layersTree.rootIds.map((rid: any) =>
                renderTreeNode(rid, 0)
              )}
            </div>
          ) : (
            <Text style={styles.hint}>Дерево слоёв загружается…</Text>
          )}

          {/* операции со слоями */}

          <View style={styles.layerOpsRow}>
            <TouchableOpacity
              style={[
                styles.layerOpBtn,
                !selectedBlock?.id && styles.layerOpBtnDisabled,
              ]}
              disabled={!selectedBlock?.id}
              onPress={() => {
                if (!selectedBlock?.id) return
                setInsertMode("child")
              }}
            >
              <Text style={styles.layerOpBtnText}>+ child</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.layerOpBtn,
                !selectedBlock?.id && styles.layerOpBtnDisabled,
              ]}
              disabled={!selectedBlock?.id}
              onPress={() => {
                if (!selectedBlock?.id) return
                setInsertMode("sibling")
              }}
            >
              <Text style={styles.layerOpBtnText}>+ sibling</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.layerOpBtnDanger,
                !selectedBlock?.id && styles.layerOpBtnDisabled,
              ]}
              disabled={!selectedBlock?.id}
              onPress={() => {
                if (!selectedBlock?.id) return

                const now = Date.now()
                if (now - lastDeleteTimeRef.current < 300) return

                lastDeleteTimeRef.current = now

                onDeleteBlock && onDeleteBlock(selectedBlock.id)
              }}
            >
              <Text style={styles.layerOpBtnText}>Удалить</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ====== ПОЗИЦИЯ ====== */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Позиция/Размер</Text>

          <NumberField
            label="left"
            value={
              livePosition?.left ?? left
            }
            onChange={handleLeftChange}
          />

          <NumberField
            label="top"
            value={
              livePosition?.top ?? top
            }
            onChange={handleTopChange}
          />

          <NumberField
            label="width"
            value={
              livePosition?.width ?? width
            }
            onChange={handleWidthChange}
          />

          <NumberField
            label="height"
            value={
              livePosition?.height ?? height
            }
            onChange={handleHeightChange}
          />
        </View>

        {/* ===== ТЕКСТ ===== */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Текст</Text>

          <TextField
            label="text"
            value={textValue}
            onChange={setTextValue}
            placeholder="Текст блока"
          />

          <TouchableOpacity
            style={[
              styles.layerOpBtn,
              !canApply && styles.layerOpBtnDisabled,
            ]}
            disabled={!canApply}
            onPress={() => {
              if (!canApply) return

              const now = Date.now()
              if (now - lastSetTextTimeRef.current < 300) return

              lastSetTextTimeRef.current = now

              onSetText &&
                onSetText({
                  blockId: selectedBlock.id,
                  text: textValue,
                })
            }}
          >
            <Text style={styles.layerOpBtnText}>Stage текст</Text>
          </TouchableOpacity>
        </View>

        {/* ===== ЦВЕТ ===== */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Цвета</Text>

          <TextField
            label="bg"
            value={bg}
            onChange={setBg}
            placeholder="#ffffff"
          />

          <TextField
            label="color"
            value={color}
            onChange={setColor}
            placeholder="#000000"
          />
        </View>

        {/* APPLY */}

        <TouchableOpacity
          style={[
            styles.applyBtn,
            !canApply && styles.applyBtnDisabled,
          ]}
          onPress={handleApply}
          disabled={!canApply}
        >
          <Text style={styles.applyBtnText}>
            Применить в файлы
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Подсказка: кликните по элементу в превью, чтобы выбрать блок.
        </Text>

      </ScrollView>
    </View>
  )
}
