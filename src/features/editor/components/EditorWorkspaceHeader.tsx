import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { styles } from '../styles';

type RenderFileHeaderProps = {
  mode: 'placeholder' | 'loading' | 'error';
  title: string;
  subtitle?: string;
};

export function RenderFileHeader({ mode, title, subtitle }: RenderFileHeaderProps) {
  if (mode === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>{title}</Text>
        </View>
      </View>
    );
  }

  if (mode === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>{title}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.placeholderText}>{title}</Text>
      {subtitle ? <Text style={styles.hintText}>{subtitle}</Text> : null}
    </View>
  );
}
