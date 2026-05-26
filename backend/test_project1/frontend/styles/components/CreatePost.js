import { Dimensions, StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  input: { borderWidth: 1, padding: 10, marginBottom: 10, borderRadius: 5 },
  previewImage: { width: 100, height: 100, marginRight: 10, marginBottom: 10 },
  error: { color: 'red', marginBottom: 10 },
  postList: { marginTop: 10 },
  post: { marginBottom: 10 },
  postImage: {
    width: '100%',
    height: Dimensions.get('window').width * 0.9,
    borderRadius: 5,
  },
});