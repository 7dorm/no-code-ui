import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * Диалог создания нового проекта
 */
export function CreateProjectDialog({ visible, onClose, onCreate }) {
  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState('react');

  if (!visible) return null;

  const handleCreate = () => {
    if (!projectName.trim()) return;
    onCreate(projectName.trim(), projectType);
    setProjectName('');
    setProjectType('react');
    onClose();
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.title}>🚀 Создать новый проект</Text>
        <Text style={styles.description}>
          Будет создана папка с базовой структурой проекта
        </Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Название проекта:</Text>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="my-awesome-project"
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
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') onClose();
            }}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Тип проекта:</Text>
          <select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
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
          >
            <option value="react">React (JSX)</option>
            <option value="react-native">React Native</option>
            <option value="html">HTML</option>
          </select>
        </View>

        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>Будет создано:</Text>
          <Text style={styles.previewText}>📁 {projectName || 'my-project'}/</Text>
          <Text style={styles.previewText}>  └─ 📄 App.{projectType === 'html' ? 'html' : 'jsx'}</Text>
          {projectType === 'react' && (
            <Text style={styles.previewText}>  └─ 📄 index.html</Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Отмена</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleCreate}
            disabled={!projectName.trim()}
          >
            <Text style={[styles.buttonText, styles.buttonPrimaryText]}>
              Создать проект
            </Text>
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
    zIndex: 10000,
  },
  dialog: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 24,
    minWidth: 500,
    maxWidth: 600,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.3)',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  previewBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    padding: 12,
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  previewTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  previewText: {
    color: '#667eea',
    fontSize: 13,
    fontFamily: 'monospace',
    marginBottom: 4,
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

