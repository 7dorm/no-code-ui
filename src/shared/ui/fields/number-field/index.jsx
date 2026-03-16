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
 * Поле ввода для числовых значений
 */
export function NumberField({ label, value, onChange, mode = 'value', modeOptions = null, onModeChange }) {
  const hasModes = Array.isArray(modeOptions) && modeOptions.length > 0 && typeof onModeChange === 'function';
  const isValueMode = mode === 'value';
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <input
        style={{
          ...htmlInputStyle,
          flex: 1,
          opacity: isValueMode ? 1 : 0.7,
        }}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        disabled={!isValueMode}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      {hasModes ? (
        <select
          style={{
            ...htmlInputStyle,
            width: '110px',
            marginLeft: '8px',
            paddingLeft: '8px',
            paddingRight: '8px',
          }}
          value={mode}
          onChange={(e) => onModeChange(e.target.value)}
        >
          {modeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
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
