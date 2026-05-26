import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import HomeScreen from './screens/HomeScreen';
import ProfileScreen from './screens/ProfileScreen';
import Button from './components/Button';
import { colors } from './styles/commonStyles';

const App = () => {
  const [currentScreen, setCurrentScreen] = useState('home');

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />;
      case 'profile':
        return <ProfileScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <View style={styles.container}>
      {renderScreen()}
      <View style={styles.navigation}>
        <Button
          title="Главная"
          onPress={() => setCurrentScreen('home')}
          variant={currentScreen === 'home' ? 'primary' : 'secondary'}
        />
        <Button
          title="Профиль"
          onPress={() => setCurrentScreen('profile')}
          variant={currentScreen === 'profile' ? 'primary' : 'secondary'}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});

export default App;
