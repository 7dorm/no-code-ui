// components/ThemeToggle.js

import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { toggleTheme } from '../redux/slices/themeSlice';

export default function ThemeToggle() {
  const dispatch = useDispatch();
  const theme = useSelector((state) => state.theme);

  return (
    <TouchableOpacity onPress={() => dispatch(toggleTheme())}>
      <Text style={{ color: theme.colors.text }}>
        Switch to {theme.mode === 'light' ? 'Dark' : 'Light'} Mode
      </Text>
    </TouchableOpacity>
  );
}