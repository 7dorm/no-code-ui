import React from 'react';
import { View, StyleSheet } from 'react-native';
import Editor from '@monaco-editor/react';

/**
 * Обертка для Monaco Editor, совместимая с React Native Web
 */
export function MonacoEditorWrapper({ value, language, onChange, filePath, onSave, editorRef }) {
  const handleChange = (newValue) => {
    if (onChange && typeof onChange === 'function') {
      onChange(newValue || '');
    }
  };

  return (
    <View style={styles.editorContainer}>
      <div style={{ width: '100%', height: '100%', minHeight: '600px' }}>
        <Editor
          height="100%"
          language={language}
          value={value || ''}
          theme="vs-dark"
          onChange={handleChange}
          onMount={(editor, monaco) => {
            if (editorRef) {
              editorRef.current = editor;
            }
            editor.updateOptions({ readOnly: false });
            
            setTimeout(() => {
              try {
                editor.focus();
              } catch (e) {
                // Игнорируем ошибки фокусировки
              }
            }, 100);
            
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
              if (onSave) {
                const currentValue = editor.getValue();
                onSave(currentValue);
              }
            });
          }}
          options={{
            readOnly: false,
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            undoRedo: 'full',
            selectOnLineNumbers: true,
            roundedSelection: true,
            cursorStyle: 'line',
            domReadOnly: false,
            contextmenu: true,
          }}
        />
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  editorContainer: {
    flex: 1,
    width: '100%',
    minHeight: 600,
  },
});

