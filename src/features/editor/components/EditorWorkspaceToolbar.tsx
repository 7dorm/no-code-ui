import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../styles';

type RenderFileToolbarProps = {
  label: string;
  componentName?: string | null;
};

export function RenderFileToolbar({ label, componentName = null }: RenderFileToolbarProps) {
  return (
    <View style={styles.contentMetaOverlay} pointerEvents="none">
      <View style={styles.fileTypeBadge}>
        <Text style={styles.fileTypeText}>
          {componentName ? `${label} • ${componentName}` : label}
        </Text>
      </View>
    </View>
  );
}
