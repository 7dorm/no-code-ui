// components/ThemeProvider.js
import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTheme } from '../redux/slices/themeSlice';
import { useColorScheme } from 'react-native';

export default function ThemeProvider({ children }) {
  const dispatch = useDispatch();
  const deviceTheme = useColorScheme();

  useEffect(() => {
    // Try to load theme from AsyncStorage
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('theme');
        if (savedTheme) {
          const parsedTheme = JSON.parse(savedTheme);
          dispatch(setTheme(parsedTheme.mode));
        } else {
          // If no saved theme, use device theme or default to dark
          dispatch(setTheme(deviceTheme || 'dark'));
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
        // Default to dark theme if there's an error
        dispatch(setTheme('dark'));
      }
    };

    loadTheme();
  }, [dispatch, deviceTheme]);

  return <>{children}</>;
}