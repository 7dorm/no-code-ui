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
            console.log('💾 [Monaco] Editor mounted, filePath:', filePath);
            
            if (editorRef) {
              editorRef.current = editor;
              console.log('💾 [Monaco] editorRef установлен');
            }
            
            editor.updateOptions({ readOnly: false });
            
            setTimeout(() => {
              try {
                editor.focus();
              } catch (e) {
                // Игнорируем ошибки фокусировки
              }
            }, 100);
            
            // Обработчик Ctrl+S / Cmd+S для сохранения
            const saveCommand = editor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, 
              () => {
                console.log('💾 [Monaco] Ctrl+S нажата в редакторе');
                if (onSave && typeof onSave === 'function') {
                  try {
                    const currentValue = editor.getValue();
                    console.log('💾 [Monaco] Получено значение из редактора, длина:', currentValue?.length);
                    console.log('💾 [Monaco] Вызываю onSave...');
                    onSave(currentValue);
                    
                    // Показываем визуальное подтверждение в редакторе
                    const model = editor.getModel();
                    if (model) {
                      const lineCount = model.getLineCount();
                      const decorations = editor.deltaDecorations([], [
                        {
                          range: new monaco.Range(1, 1, Math.min(lineCount, 3), 1),
                          options: {
                            isWholeLine: true,
                            className: 'monaco-save-flash',
                          }
                        }
                      ]);
                      
                      // Убираем декорацию через 300ms
                      setTimeout(() => {
                        editor.deltaDecorations(decorations, []);
                      }, 300);
                    }
                    
                    console.log('💾 [Monaco] Сохранение завершено');
                  } catch (e) {
                    console.error('💾 [Monaco] Ошибка при сохранении:', e);
                  }
                } else {
                  console.warn('💾 [Monaco] onSave не определен или не является функцией');
                }
              }
            );
            
            console.log('💾 [Monaco] Команда сохранения добавлена, ID:', saveCommand);
            
            // Добавляем глобальный обработчик для предотвращения стандартного поведения браузера
            // НО НЕ stopPropagation, чтобы событие дошло до глобального обработчика
            const handleKeyDown = (e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault(); // Предотвращаем диалог сохранения браузера
                // НЕ вызываем e.stopPropagation() чтобы событие пошло дальше
                console.log('💾 [Monaco DOM] Перехвачен Ctrl+S (preventDefault, без stopPropagation)');
              }
            };
            
            // Добавляем обработчик на DOM элемент редактора
            const domNode = editor.getDomNode();
            if (domNode) {
              domNode.addEventListener('keydown', handleKeyDown, false); // Фаза bubbling
              console.log('💾 [Monaco] Обработчик keydown добавлен на DOM элемент');
            } else {
              console.warn('💾 [Monaco] DOM node не найден');
            }
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

