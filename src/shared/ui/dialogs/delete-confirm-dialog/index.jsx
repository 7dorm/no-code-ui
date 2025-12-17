import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * Диалог подтверждения удаления файла/папки
 */
export function DeleteConfirmDialog({ visible, onClose, onConfirm, itemName, isDirectory }) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.title}>Удалить {isDirectory ? 'папку' : 'файл'}?</Text>
        <Text style={styles.path}>
          {isDirectory ? 'Папка' : 'Файл'}: {itemName}
        </Text>
        <Text style={styles.warning}>
          {isDirectory 
            ? 'Вся папка и её содержимое будут удалены. Это действие нельзя отменить.' 
            : 'Это действие нельзя отменить.'}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Отмена</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={onConfirm}
          >
            <Text style={[styles.buttonText, styles.buttonDangerText]}>Удалить</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 24,
    minWidth: 400,
    maxWidth: 500,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  path: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  warning: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDangerText: {
    color: '#ffffff',
  },
});

