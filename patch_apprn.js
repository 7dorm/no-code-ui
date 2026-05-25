const fs = require('fs');
const path = './src/AppRN.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  `    canvasWidth, setCanvasWidth,
    canvasHeight, setCanvasHeight
  } = useEditorStore();`,
  `    canvasWidth, setCanvasWidth,
    canvasHeight, setCanvasHeight,
    undoStack, redoStack
  } = useEditorStore();`
);

code = code.replace(
  `              <TouchableOpacity
                style={[styles.modeButton, viewMode === 'changes' && styles.modeButtonActive]}
                onPress={() => setViewMode('changes')}
              >
                <Text style={[styles.modeButtonText, viewMode === 'changes' && styles.modeButtonTextActive]}>Изменения</Text>
              </TouchableOpacity>`,
  `              <TouchableOpacity
                style={[styles.modeButton, viewMode === 'changes' && styles.modeButtonActive]}
                onPress={() => setViewMode('changes')}
              >
                <Text style={[styles.modeButtonText, viewMode === 'changes' && styles.modeButtonTextActive]}>Изменения</Text>
              </TouchableOpacity>
              <View style={styles.splitButtons}>
                <TouchableOpacity
                  style={[styles.modeButton, undoStack.length === 0 && { opacity: 0.5 }]}
                  disabled={undoStack.length === 0}
                  onPress={() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true }))}
                >
                  <Text style={styles.modeButtonText}>↩</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeButton, redoStack.length === 0 && { opacity: 0.5 }]}
                  disabled={redoStack.length === 0}
                  onPress={() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true, shiftKey: true }))}
                >
                  <Text style={styles.modeButtonText}>↪</Text>
                </TouchableOpacity>
              </View>`
);

fs.writeFileSync(path, code, 'utf8');
