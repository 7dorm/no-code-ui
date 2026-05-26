import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Card = ({ title, children, style }) => {
  return (
    <View style={[styles.card, style]}>
      {title && (
        <Text style={styles.title}>{title}</Text>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 12,
  },
});

export default Card;
