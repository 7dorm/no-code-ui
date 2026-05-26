import { Dimensions, StyleSheet } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000',
    width: '100%',
    alignItems: 'center', // Центрируем содержимое
  },
  title: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    marginBottom: 10,
    color: '#fff',
  },
  input: { 
    borderWidth: 1, 
    padding: 10, 
    marginBottom: 10, 
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  previewImage: { 
    width: 100, 
    height: 100, 
    marginRight: 10, 
    marginBottom: 10,
  },
  error: { 
    color: 'red', 
    marginBottom: 10,
  },
  postList: { 
    marginTop: 10,
    width: '100%',
    maxWidth: 660, // Максимальная ширина для больших экранов
  },
  post: { 
    marginBottom: 10,
    alignSelf: 'center',
  },
});