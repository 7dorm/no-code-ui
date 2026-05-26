// components/ProfileModal.js
import { StyleSheet } from 'react-native';


export const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    maxHeight: '50%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  menuItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  image: {
    width: 100,
    height: 100,
    alignSelf: 'center',
  }
});