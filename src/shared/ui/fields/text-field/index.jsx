import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const htmlInputStyle = {
  width: '100%',
  height: '32px',
  borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(0,0,0,0.25)',
  color: '#ffffff',
  paddingLeft: '10px',
  paddingRight: '10px',
  outline: 'none',
};

/**
 * Поле ввода для текстовых значений
 */
export function TextField({ label, value, onChange, placeholder }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <input
        style={htmlInputStyle}
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    width: 70,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginRight: 8,
  },
});

