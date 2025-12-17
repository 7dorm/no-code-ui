import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * Диалог создания нового файла
 */
export function CreateFileDialog({ visible, onClose, onCreate, parentPath }) {
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('jsx');

  if (!visible) return null;

  const handleCreate = () => {
    if (!fileName.trim()) return;
    const fullName = fileName.includes('.') ? fileName : `${fileName}.${fileType}`;
    onCreate(fullName);
    setFileName('');
    setFileType('jsx');
    onClose();
  };

  const fileTemplates = {
    jsx: `import React from 'react';

function ${fileName || 'Component'}() {
  return (
    <div>
      <h1>Новый компонент</h1>
    </div>
  );
}

export default ${fileName || 'Component'};`,
    js: `// Новый JavaScript файл`,
    html: `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Новая страница</title>
</head>
<body>
    <h1>Новая HTML страница</h1>
</body>
</html>`,
    css: `/* Новый CSS файл */`,
    json: `{
  "name": "new-file"
}`,
    md: `# Новый документ`,
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.title}>Создать новый файл</Text>
        <Text style={styles.path}>В папке: {parentPath}</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Имя файла:</Text>
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="my-component"
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
          <Text style={styles.label}>Тип файла:</Text>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
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
            <option value="jsx">JSX</option>
            <option value="js">JavaScript</option>
            <option value="tsx">TSX</option>
            <option value="ts">TypeScript</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
            <option value="md">Markdown</option>
          </select>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Отмена</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleCreate}
          >
            <Text style={[styles.buttonText, styles.buttonPrimaryText]}>Создать</Text>
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
    fontSize: 12,
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  inputGroup: {
    marginBottom: 16,
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

