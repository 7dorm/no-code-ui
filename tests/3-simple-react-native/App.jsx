import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

/**
 * Простой однофайловый React Native компонент для тестирования ReactNativeFramework
 */
export default function App() {
  const [count, setCount] = useState(0);
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    setCount(count + 1);
    setPressed(true);
    setTimeout(() => setPressed(false), 300);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Простой React Native тест</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Активен</Text>
        </View>

        <View style={styles.card}>
          
          <Text style={styles.text}>
            Текущее значение: {count}
          </Text>
          <TouchableOpacity
            style={[styles.button, pressed && styles.buttonPressed]}
            onPress={handlePress}
          >
            <Text style={styles.buttonText}>Увеличить счетчик</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>О компоненте</Text>
          <Text style={styles.text}>
            Этот компонент тестирует ReactNativeFramework:
          </Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• Инструментация JSX</Text>
            <Text style={styles.listItem}>• Обработка зависимостей</Text>
            <Text style={styles.listItem}>• Применение стилей</Text>
            <Text style={styles.listItem}>• React Native Web рендеринг</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Состояние</Text>
          <Text style={styles.text}>
            Кнопка была нажата: {pressed ? 'Да' : 'Нет'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 16,
  },
  badge: {
    backgroundColor: '#28a745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  badgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#764ba2',
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: '#495057',
    lineHeight: 24,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    backgroundColor: '#5568d3',
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    marginTop: 8,
  },
  listItem: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 24,
  },
});

