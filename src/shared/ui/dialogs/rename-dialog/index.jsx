import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * Диалог переименования файла/папки
 */
export function RenameDialog({ visible, onClose, onRename, itemName, itemPath }) {
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (visible) {
      setNewName(itemName || '');
    }
  }, [visible, itemName]);

  if (!visible) return null;

  const handleRename = () => {
    if (!newName.trim()) return;
    if (newName === itemName) {
      onClose();
      return;
    }
    onRename(newName.trim());
    setNewName('');
    onClose();
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.title}>Переименовать</Text>
        <Text style={styles.path}>Путь: {itemPath}</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Новое имя:</Text>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="новое-имя"
            style={{
              width: '100%',
              height: '36px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              paddingLeft: '12px',
              paddingRight: '12px',
              color: '#ffffff',
              fontSize: '14px',
              fontFamily: 'monospace',
              outline: 'none',
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') onClose();
            }}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Отмена</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleRename}
          >
            <Text style={[styles.buttonText, styles.buttonPrimaryText]}>Переименовать</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
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
    fontSize: 12,
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 8,
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
  buttonPrimary: {
    backgroundColor: '#667eea',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPrimaryText: {
    color: '#ffffff',
  },
});

