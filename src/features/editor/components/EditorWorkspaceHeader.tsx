import React from 'react';
import { View } from 'react-native';

type RenderFileHeaderProps = {
  children?: React.ReactNode;
};

export function RenderFileHeader({ children }: RenderFileHeaderProps) {
  return <View>{children}</View>;
}
