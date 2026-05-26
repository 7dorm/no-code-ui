import React, { useState } from 'react';
import { styles } from '../styles/screens/FeedScreen';
import { FloatingButton } from '../components/FloatingButton';
import Database from '../database';
import SuperScrollList from "../components/SuperScrollList";
import {View} from "react-native";

export default function FeedScreen({ navigation }) {

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <SuperScrollList navigation={navigation} loader={Database.getAllPosts} />
      <FloatingButton
        onPress={() => navigation.navigate('CreatePost')}
        visible={true}
      />
    </View>
  );
}
