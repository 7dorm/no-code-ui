// styles/theme.js

export const getThemeStyles = (theme) => ({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    text: {
      color: theme.colors.text,
    },
    postContainer: {
      backgroundColor: theme.colors.background,
      padding: 10,
      marginVertical: 5,
      borderRadius: 5,
    },
    button: {
      backgroundColor: theme.mode === 'light' ? '#007AFF' : '#0A84FF',
      padding: 10,
      borderRadius: 5,
    },
    buttonText: {
      color: '#fff',
      textAlign: 'center',
    },
  });