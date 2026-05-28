import React from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { useEditorStore } from '../../../store/editorStore';
import { MRPAK_CMD } from '../../../blockEditor/EditorProtocol';

const ObjectEditor = ({ value, onChange, depth = 0 }: { value: any, onChange: (val: any) => void, depth?: number }) => {
  if (value === null || value === undefined) {
    return <Text style={styles.readOnlyValue}>{String(value)}</Text>;
  }

  if (typeof value === 'boolean') {
    return (
      <TouchableOpacity 
        style={[styles.booleanToggle, value ? styles.booleanToggleTrue : styles.booleanToggleFalse]}
        onPress={() => onChange(!value)}
      >
        <Text style={styles.booleanToggleText}>{value ? 'TRUE' : 'FALSE'}</Text>
      </TouchableOpacity>
    );
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return (
      <TextInput
        style={styles.input}
        value={String(value)}
        onChangeText={(text) => {
          let parsedValue: any = text;
          if (typeof value === 'number') {
             if (text === '' || text === '-') {
                parsedValue = text; // allow intermediate typing
             } else {
                const num = Number(text);
                if (!isNaN(num)) parsedValue = num;
             }
          }
          onChange(parsedValue);
        }}
        placeholderTextColor="rgba(255,255,255,0.3)"
      />
    );
  }

  if (Array.isArray(value)) {
    return <Text style={styles.readOnlyValue}>{JSON.stringify(value)}</Text>;
  }

  if (typeof value === 'object') {
    return (
      <View style={depth > 0 ? styles.objectContainerNested : styles.objectContainer}>
        {Object.entries(value).map(([key, val]) => (
          <View key={key} style={styles.objectField}>
            <Text style={styles.objectKey}>{key}</Text>
            <ObjectEditor 
              value={val} 
              onChange={(newVal) => onChange({ ...value, [key]: newVal })} 
              depth={depth + 1} 
            />
          </View>
        ))}
      </View>
    );
  }

  return <Text style={styles.readOnlyValue}>{JSON.stringify(value)}</Text>;
};

export function VariablesPanel() {
  const { 
    variableSnapshots, 
    mockVariables, 
    updateMockVariables, 
    forceRenderVariables,
    blockMapForFile,
    selectedBlock,
    setSelectedBlockIds,
    selectedVariableName,
    setSelectedVariableName
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

    // First, apply values from variableSnapshots as defaults.
    // State and props should be stable/editable across reloads; derived variables should not be frozen.
    for (const [comp, vars] of Object.entries(state.variableSnapshots || {})) {
      if (!mergedMocks[comp]) mergedMocks[comp] = {};
      for (const [varName, varData] of Object.entries(vars)) {
        if (varData.isState || varData.isProp) {
          mergedMocks[comp][varName] = varData.value;
        }
      }
    }

    // Then override with explicit mockVariables
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
    
    // Request a fresh snapshot after React has had time to re-render inside the iframe.
    // This allows derived variables (like doubledCount) to update in the UI.
    setTimeout(() => {
      useEditorStore.getState().sendIframeCommand({
        type: 'MRPAK_CMD_REQUEST_VAR_SNAPSHOT',
      });
    }, 100);
  };

  const handleSelectVariable = (componentName: string, varName: string) => {
    // Select blocks using it
    const ids: string[] = [];
    if (blockMapForFile) {
      for (const [id, block] of Object.entries(blockMapForFile)) {
        if (block.componentName === componentName && typeof block.snippet === 'string' && block.snippet.includes(varName)) {
          ids.push(id);
        }
      }
    }
    setSelectedBlockIds(ids);
    
    // Select the variable
    setSelectedVariableName(varName);

    // Send highlight command for getters and setters
    const state = useEditorStore.getState();
    const usages = state.variableUsages?.[varName] || { getters: [], setters: [] };
    state.sendIframeCommand({
      type: MRPAK_CMD.HIGHLIGHT_VAR_BLOCKS || 'MRPAK_CMD_HIGHLIGHT_VAR_BLOCKS',
      getterIds: usages.getters,
      setterIds: usages.setters,
    });
  };

  React.useEffect(() => {
    return () => {
      // Clear highlights when unmounting
      const state = useEditorStore.getState();
      state.setSelectedVariableName(null);
      state.sendIframeCommand({
        type: MRPAK_CMD.HIGHLIGHT_VAR_BLOCKS || 'MRPAK_CMD_HIGHLIGHT_VAR_BLOCKS',
        getterIds: [],
        setterIds: [],
      });
    };
  }, []);

  const selectedBlockSnippet = selectedBlock?.id ? blockMapForFile?.[selectedBlock.id]?.snippet || '' : '';
  const selectedBlockComponentName = selectedBlock?.id ? blockMapForFile?.[selectedBlock.id]?.componentName || '' : '';

  if (!variableSnapshots || Object.keys(variableSnapshots).length === 0) {
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
              
              const isPrimitive = varData.type === 'string' || varData.type === 'number' || varData.type === 'boolean';
              const isObject = varData.type === 'object' && displayValue !== null && !Array.isArray(displayValue);

              const isUsedBySelectedBlock = selectedBlockComponentName === componentName && typeof selectedBlockSnippet === 'string' && selectedBlockSnippet.includes(varName);
              const isSelectedVariable = selectedVariableName === varName;
              const isHighlighted = isUsedBySelectedBlock || isSelectedVariable;

              return (
                <View key={varName} style={[styles.variableRow, isHighlighted && styles.variableRowHighlighted]}>
                  <TouchableOpacity onPress={() => handleSelectVariable(componentName, varName)} style={styles.variableHeader}>
                    <Text style={[styles.variableName, isHighlighted && styles.variableNameHighlighted]}>{varName}</Text>
                    <Text style={styles.variableType}>
                      {varData.type} {varData.isState ? '(State)' : varData.isProp ? '(Prop)' : ''}
                    </Text>
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
                  ) : isObject ? (
                    <ObjectEditor 
                      value={displayValue} 
                      onChange={(newVal) => handleUpdateMock(componentName, varName, newVal)} 
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
  objectContainer: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 4,
    padding: 6,
  },
  objectContainerNested: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  objectField: {
    marginTop: 6,
  },
  objectKey: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginBottom: 4,
    fontFamily: 'monospace',
  },
});
