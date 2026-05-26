import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import { commonStyles } from '../styles/commonStyles';

const ProfileScreen = () => {
  const user = {
    name: 'Иван Иванов',
    email: 'ivan@example.com',
    role: 'Разработчик',
    joinDate: '2024-01-15',
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Профиль" 
        subtitle={user.name}
      />
      <ScrollView style={styles.content}>
        <Card title="Личная информация">
          <View style={commonStyles.spacing}>
            <Text style={[commonStyles.text, commonStyles.textBold]}>
              Имя:
            </Text>
            <Text style={commonStyles.textSecondary}>
              {user.name}
            </Text>
          </View>
          
          <View style={commonStyles.spacing}>
            <Text style={[commonStyles.text, commonStyles.textBold]}>
              Email:
            </Text>
            <Text style={commonStyles.textSecondary}>
              {user.email}
            </Text>
          </View>
          
          <View style={commonStyles.spacing}>
            <Text style={[commonStyles.text, commonStyles.textBold]}>
              Роль:
            </Text>
            <Text style={commonStyles.textSecondary}>
              {user.role}
            </Text>
          </View>
          
          <View style={commonStyles.spacing}>
            <Text style={[commonStyles.text, commonStyles.textBold]}>
              Дата регистрации:
            </Text>
            <Text style={commonStyles.textSecondary}>
              {user.joinDate}
            </Text>
          </View>
        </Card>

        <Card title="Действия">
          <Button
            title="Редактировать профиль"
            onPress={() => alert('Редактирование профиля')}
            variant="primary"
          />
          <View style={commonStyles.spacing} />
          <Button
            title="Выйти"
            onPress={() => alert('Выход из аккаунта')}
            variant="danger"
          />
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
});

export default ProfileScreen;
