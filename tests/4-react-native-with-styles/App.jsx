import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import styles from './styles';

/**
 * React Native компонент с импортированными стилями
 * Тестирует обработку внешних импортов стилей
 */
export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [items, setItems] = useState([
    { id: 1, title: 'Элемент 1', completed: false },
    { id: 2, title: 'Элемент 2', completed: true },
    { id: 3, title: 'Элемент 3', completed: false },
  ]);

  const toggleItem = (id) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>React Native с импортом стилей</Text>
        <Text style={styles.headerSubtitle}>Тестирование external styles</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'home' && styles.tabActive]}
          onPress={() => setActiveTab('home')}
        >
          <Text style={[styles.tabText, activeTab === 'home' && styles.tabTextActive]}>
            Главная
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tasks' && styles.tabActive]}
          onPress={() => setActiveTab('tasks')}
        >
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>
            Задачи
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'settings' && styles.tabActive]}
          onPress={() => setActiveTab('settings')}
        >
          <Text style={[styles.tabText, activeTab === 'settings' && styles.tabTextActive]}>
            Настройки
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'home' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitleMrpak1}>Добро пожаловать!</Text>
              <Text style={styles.cardTextMrpak1}>
                Этот компонент тестирует импорт стилей из отдельного файла.
                Framework должен корректно обрабатывать зависимости и применять
                патчи к внешним файлам стилей.
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Статистика</Text>
              <Text style={styles.cardText}>
                Всего задач: {items.length}
              </Text>
              <Text style={styles.cardText}>
                Выполнено: {items.filter(i => i.completed).length}
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'tasks' && (
          <View>
            <Text style={styles.sectionTitle}>Список задач</Text>
            {items.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.listItem, item.completed && styles.listItemCompleted]}
                onPress={() => toggleItem(item.id)}
              >
                <Text style={[styles.listItemText, item.completed && styles.listItemTextCompleted]}>
                  {item.title}
                </Text>
                {item.completed && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'settings' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Настройки</Text>
              <Text style={styles.cardText}>
                Здесь будут настройки приложения
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

