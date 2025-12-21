import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * Компонент табов для переключения между режимами просмотра
 */
export function ViewModeTabs({ viewMode, onModeChange, enableEditor = false }) {
  return (
    <View style={styles.tabsContainer}>
      <TouchableOpacity
        style={[styles.tab, viewMode === 'preview' && styles.tabActive]}
        onPress={() => onModeChange('preview')}
      >
        <Text style={[styles.tabText, viewMode === 'preview' && styles.tabTextActive]}>
          Превью
        </Text>
      </TouchableOpacity>
      {enableEditor && (
        <TouchableOpacity
          style={[styles.tab, viewMode === 'edit' && styles.tabActive]}
          onPress={() => onModeChange('edit')}
        >
          <Text style={[styles.tabText, viewMode === 'edit' && styles.tabTextActive]}>
            Редактор
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.tab, viewMode === 'code' && styles.tabActive]}
        onPress={() => onModeChange('code')}
      >
        <Text style={[styles.tabText, viewMode === 'code' && styles.tabTextActive]}>
          Код
        </Text>
      </TouchableOpacity>
      {enableEditor && (
        <TouchableOpacity
          style={[styles.tab, viewMode === 'split' && styles.tabActive]}
          onPress={() => onModeChange('split')}
        >
          <Text style={[styles.tabText, viewMode === 'split' && styles.tabTextActive]}>
            Split
          </Text>
        </TouchableOpacity>
      )}
      {enableEditor && (
        <TouchableOpacity
          style={[styles.tab, viewMode === 'changes' && styles.tabActive]}
          onPress={() => onModeChange('changes')}
        >
          <Text style={[styles.tabText, viewMode === 'changes' && styles.tabTextActive]}>
            Изменения
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#667eea',
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});

