import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import { commonStyles } from '../styles/commonStyles';

const HomeScreen = () => {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('Добро пожаловать!');

  const handleIncrement = () => {
    setCount(count + 1);
    setMessage(`Счетчик увеличен до ${count + 1}`);
  };

  const handleDecrement = () => {
    setCount(count - 1);
    setMessage(`Счетчик уменьшен до ${count - 1}`);
  };

  const handleReset = () => {
    setCount(0);
    setMessage('Счетчик сброшен');
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Главный экран" 
        subtitle="Тестовое React Native приложение"
      />
      <ScrollView style={styles.content}>
        <Card title="Счетчик">
          <View style={commonStyles.center}>
            <Text style={styles.counter}>{count}</Text>
            <Text style={[commonStyles.textSecondary, commonStyles.spacing]}>
              {message}
            </Text>
          </View>
          
          <View style={[commonStyles.row, commonStyles.spacingLarge]}>
            <Button
              title="Увеличить"
              onPress={handleIncrement}
              variant="primary"
            />
            <Button
              title="Уменьшить"
              onPress={handleDecrement}
              variant="secondary"
            />
          </View>
          
          <Button
            title="Сброс"
            onPress={handleReset}
            variant="danger"
          />
        </Card>

        <Card title="Информация">
          <Text style={commonStyles.text}>
            Это тестовый экран для проверки работы рендерера.
          </Text>
          <Text style={[commonStyles.textSecondary, commonStyles.spacing]}>
            Компоненты импортированы из отдельных файлов и используют общие стили.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
  },
  counter: {
    fontSize: 48,
    fontWeight: 'bold',
    color: "#667eea",
    marginVertical: 16,
  },
});

export default HomeScreen;
