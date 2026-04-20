import React from 'react';
import { View } from 'react-native';

type RenderFileToolbarProps = {
  children?: React.ReactNode;
};

export function RenderFileToolbar({ children }: RenderFileToolbarProps) {
  return <View>{children}</View>;
}
