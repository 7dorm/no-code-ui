// components/Tag.js

import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, Alert } from 'react-native';
import Database from '../database';

export default function Tag({ tag, onRefresh, navigation }) {
  const theme =  {
    current: 'light',
    colors: { light: { text: '#000', background: '#FFF' } },
  };
  const [isFollowed, setIsFollowed] = useState(false);

  useEffect(() => {
    checkFollowStatus();
  }, [tag]);

  const checkFollowStatus = async () => {
    try {
      const followedTags = await Database.getFollowedTags();
      // console.log('Tag component: Received followed tags:', followedTags);
      // console.log('Tag component: Current tag:', tag);
      // console.log('Tag component: Is followed:', followedTags.includes(tag));
      setIsFollowed(followedTags.includes(tag));
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  };

  const handleTagPress = async () => {
    // console.log('Tag component: Pressed tag:', tag, 'Current follow status:', isFollowed);

    try {
      if (isFollowed) {
        // console.log('Tag component: Unfollowing tag:', tag);
        await Database.unfollowTag(tag);
        Alert.alert('Unfollowed', `You unfollowed #${tag}`);
      } else {
        // console.log('Tag component: Following tag:', tag);
        await Database.followTag(tag);
        Alert.alert('Followed', `You are now following #${tag}`);
      }

      setIsFollowed(!isFollowed);
      // console.log('Tag component: Updated follow status to:', !isFollowed);

      // Обновляем ленту Following если мы находимся на ней
      if (onRefresh) {
        onRefresh();
      }

      // Если мы находимся на экране Following, обновляем его
      if (navigation) {
        // Находим экран Following и обновляем его
        const followingScreen = navigation.getState()?.routes?.find(route => route.name === 'Following');
        if (followingScreen) {
          // Обновляем состояние экрана Following
          navigation.setParams({ refresh: Date.now() });

          // Если отписываемся от тега, явно обновляем экран Following
          if (isFollowed) {
            const followingScreenComponent = navigation.getParent()?.getState()?.routes?.find(
              route => route.name === 'Following'
            )?.state?.routeNames?.includes('FollowingScreen');

            if (followingScreenComponent && navigation.getParent().navigate) {
              // Force refresh the Following screen
              navigation.getParent().navigate('Following', { refresh: Date.now() });
            }
          }
        }
      }
    } catch (err) {
      console.error('Error toggling tag:', err);
      Alert.alert('Error', 'Failed to update tag subscription');
    }
  };

  return (
    <TouchableOpacity onPress={handleTagPress} style={{
      marginRight: 5,
      backgroundColor: isFollowed ? '#4CAF50' : '#BBB',
      borderRadius: 10,
      padding: 5,
      alignContent: "center",
      height: "100%",
    }}>
      <Text style={{
        color: isFollowed ? '#fff' : '#888',
        fontWeight: isFollowed ? 'bold' : 'normal',
        textAlign: 'center',
        textAlignVertical: 'center',
        alignContent: 'center',
        alignSelf: 'center',
        alignItems: 'center',
      }}>
        {tag.substring(0, 20) || 'unknown'}
      </Text>
    </TouchableOpacity>
  );
}




//+79960728223 малолетки (трабла с подиком)
