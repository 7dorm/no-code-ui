// screens/ProfileSettingsScreen.js

import React from 'react';
import { View } from 'react-native';
import { styles } from '../styles/screens/ProfileScreen';
import ProfileModal from '../components/ProfileModal';
import {Menu} from "../MainNavigator";

export default function ProfileSettingsScreen({navigation}) {
    const { current, colors } =  {
        current: 'light',
        colors: { light: { text: '#FFF', background: '#000' } },
    };
  const theme = colors[current];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Menu navigation={navigation} header={true}/>
      <ProfileModal navigation={navigation} />
    </View>
  );
}
