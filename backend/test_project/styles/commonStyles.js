import { StyleSheet } from 'react-native';

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacing: {
    marginVertical: 8,
  },
  spacingLarge: {
    marginVertical: 16,
  },
  text: {
    fontSize: 16,
    color: '#333333',
  },
  textSecondary: {
    fontSize: 14,
    color: '#666666',
  },
  textBold: {
    fontWeight: '600',
  },
});

export const colors = {
  primary: '#667eea',
  secondary: '#764ba2',
  danger: '#e53e3e',
  success: '#48bb78',
  warning: '#ed8936',
  background: '#f5f5f5',
  white: '#ffffff',
  text: '#333333',
  textSecondary: '#666666',
};
