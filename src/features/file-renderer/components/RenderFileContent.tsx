import React from 'react';
import { View } from 'react-native';

type RenderFileContentProps = {
  children?: React.ReactNode;
};

export function RenderFileContent({ children }: RenderFileContentProps) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
