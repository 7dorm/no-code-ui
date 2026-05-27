import React from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { useEditorStore } from '../../../store/editorStore';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';

export function VariablesPanel() {
  const { 
    variableSnapshots, 
    mockVariables, 
    updateMockVariables, 
    forceRenderVariables,
    blockMapForFile,
    selectedBlock,
    setSelectedBlockIds
  } = useEditorStore();

  
  const handleUpdateMock = (componentName: string, varName: string, value: any) => {
    updateMockVariables((prev) => ({
      ...prev,
      [componentName]: {
        ...(prev[componentName] || {}),
        [varName]: value
      }
    }));
    // Send message to iframe to update mocks
    const state = useEditorStore.getState();
    const mergedMocks: Record<string, Record<string, any>> = {};
    for (const [comp, vars] of Object.entries(state.mockVariables || {})) {
      if (!mergedMocks[comp]) mergedMocks[comp] = {};
      for (const [varName, value] of Object.entries(vars)) {
        mergedMocks[comp][varName] = value;
      }
    }
    
    state.sendIframeCommand({
      type: 'MRPAK_CMD_UPDATE_MOCKS',
      mocks: mergedMocks,
    });
    // Force WebView to reload with injected variables
    forceRenderVariables();
  };

  const handleSelectVariable = (componentName: string, varName: string) => {
    const ids: string[] = [];
    if (blockMapForFile) {
      for (const [id, block] of Object.entries(blockMapForFile)) {
        if (block.componentName === componentName && typeof block.snippet === 'string' && block.snippet.includes(varName)) {
          ids.push(id);
        }
      }
    }
    setSelectedBlockIds(ids);
  };

  const selectedBlockSnippet = selectedBlock?.id ? blockMapForFile?.[selectedBlock.id]?.snippet || '' : '';
  const selectedBlockComponentName = selectedBlock?.id ? blockMapForFile?.[selectedBlock.id]?.componentName || '' : '';

  if (Object.keys(variableSnapshots).length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Variables</Text>
        <Text style={styles.emptyText}>No variables found. Make a snapshot in Preview mode first.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Variables Control</Text>
      <ScrollView style={styles.scroll}>
        {Object.entries(variableSnapshots).map(([componentName, vars]) => (
          <View key={componentName} style={styles.componentSection}>
            <Text style={styles.componentTitle}>{componentName}</Text>
            {Object.entries(vars).map(([varName, varData]) => {
              const mockValue = mockVariables[componentName]?.[varName];
              const displayValue = mockValue !== undefined ? mockValue : varData.value;
              
              // Only editable if it's a primitive type that we can easily stringify/parse
              const isPrimitive = varData.type === 'string' || varData.type === 'number' || varData.type === 'boolean';
              const readOnly = !isPrimitive;

              const isUsedBySelectedBlock = selectedBlockComponentName === componentName && typeof selectedBlockSnippet === 'string' && selectedBlockSnippet.includes(varName);

              return (
                <View key={varName} style={[styles.variableRow, isUsedBySelectedBlock && styles.variableRowHighlighted]}>
                  <TouchableOpacity onPress={() => handleSelectVariable(componentName, varName)} style={styles.variableHeader}>
                    <Text style={[styles.variableName, isUsedBySelectedBlock && styles.variableNameHighlighted]}>{varName}</Text>
                    <Text style={styles.variableType}>{varData.type} {varData.isState ? '(State)' : ''}</Text>
                  </TouchableOpacity>
                  {varData.type === 'boolean' ? (
                    <TouchableOpacity 
                      style={[styles.booleanToggle, displayValue ? styles.booleanToggleTrue : styles.booleanToggleFalse]}
                      onPress={() => handleUpdateMock(componentName, varName, !displayValue)}
                    >
                      <Text style={styles.booleanToggleText}>{displayValue ? 'TRUE' : 'FALSE'}</Text>
                    </TouchableOpacity>
                  ) : isPrimitive ? (
                    <TextInput
                      style={styles.input}
                      value={String(displayValue)}
                      onChangeText={(text) => {
                        let parsedValue: any = text;
                        if (varData.type === 'number') {
                           if (text === '' || text === '-') {
                              parsedValue = text; // allow intermediate typing
                           } else {
                              const num = Number(text);
                              if (!isNaN(num)) parsedValue = num;
                           }
                        }
                        handleUpdateMock(componentName, varName, parsedValue);
                      }}
                      placeholder={`Default: ${varData.value}`}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                    />
                  ) : (
                    <Text style={styles.readOnlyValue}>
                      {JSON.stringify(displayValue) || 'undefined'}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderLeftWidth: 1,
    borderLeftColor: '#333',
    padding: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  componentSection: {
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    padding: 8,
  },
  componentTitle: {
    color: '#667eea',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  variableRow: {
    marginBottom: 12,
  },
  variableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  variableName: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
  },
  variableRowHighlighted: {
    backgroundColor: 'rgba(102, 126, 234, 0.15)',
    borderColor: 'rgba(102, 126, 234, 0.5)',
    borderWidth: 1,
    padding: 6,
    borderRadius: 6,
  },
  variableNameHighlighted: {
    color: '#a3bffa',
    fontWeight: 'bold',
  },
  variableType: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#ffffff',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
  },
  readOnlyValue: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 6,
    borderRadius: 4,
  },
  booleanToggle: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  booleanToggleTrue: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.5)',
  },
  booleanToggleFalse: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  booleanToggleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
