// components/ProfileModal.js

import React, {useEffect, useState} from 'react';
import {Text, TouchableOpacity, SafeAreaView, TextInput, Alert, Platform, View,} from 'react-native';
import Database from '../database';
import {styles} from '../styles/components/ProfileModal';
import * as ImagePicker from "expo-image-picker";
import database from "../database";
import {Avatar} from "react-native-elements";

export default function ProfileModal({navigation}) {
    const theme =  {
        current: 'light',
        colors: { light: { text: '#000', background: '#FFF' } },
    };
    const [editMode, setEditMode] = useState(false);
    const [imageEditMode, setImageEditMode] = useState(false);
    const [media, setMedia] = useState([]);
    const [username, setUsername] = useState('');
    const [user, setUser] = useState({});

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchUser = async () => {
        const userid = await Database.getUsername(setUsername);
        const use = await database.getUser(userid);
        setUser(use);
        setMedia([{uri: use.pic}]);
        // console.log(use);
    }

    const handleEditProfile = async () => {
        if (editMode) {
            if (username.length > 1) {
                const newUser = await Database.changeUsername(username);
                alert('Profile Updated', `Username saved as: ${newUser.displayedName}`);

            } else {
                alert("Invalid length");
                useEffect(() => {
                    Database.getUsername(setUsername);
                }, []);
            }
        }
        setEditMode(!editMode);
    };

    const handleLogout = async () => {
        if (Platform.OS === "web") {
            try {
                await Database.logout();
                await navigation.navigate('Login');

            } catch (err) {
                console.error('Logout error:', err);
            }
        } else {
            Alert.alert(
                'Logout',
                'Are you sure you want to logout?',
                [
                    {text: 'Cancel', style: 'cancel'},
                    {
                        text: 'Yes', onPress: async () => {
                            try {
                                await Database.logout();
                                onClose();
                            } catch (err) {
                                console.error('Logout error:', err);
                            }
                        }
                    },
                ]
            );
        }
    };

    const handleImageChange = async (newMedia) => {
        if (newMedia.length === 0) return;
        try {
            // console.log(newMedia);
            (Database.changeImage(newMedia[0].uri)).then(el => setMedia([{ uri: el.pic }]))
        } catch (err) {
            console.error("Upload failed", err);
        }
    };

    const pickMedia = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: false,
            quality: 0.7,
            allowsEditing: true,
        });

        if (!result.canceled) {
            const newMedia = result.assets.map((asset) => ({
                uri: asset.uri,
                type: 'image',
                mimeType: asset.mimeType || (asset.type === 'image/jpeg'),
            }));
            await handleImageChange(newMedia);
        }
    };
    return (
        <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
            <Text style={[styles.header, {color: '#fff', fontSize: 18}]}>
                Profile
            </Text>
            <Avatar rounded
                    source={{uri: media.length > 0 ? media[0].uri : null}}
                    style={styles.image}/>

            {editMode ? (
                <TextInput
                    value={username}
                    onChangeText={setUsername}
                    style={{
                        borderWidth: 1,
                        padding: 10,
                        marginBottom: 20,
                        color: '#fff',
                        borderColor: '#ccc',
                        width: '100%',
                    }}
                />
            ) : (
                <Text style={{color: '#fff', marginBottom: 20}}>
                    Username: {username}
                </Text>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
                <Text style={{color: '#fff'}}>
                    {editMode ? 'Save Profile' : 'Edit Profile'}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickMedia} style={styles.menuItem}>
                <Text style={{color: "#fff"}}>
                     Choose Profile Pic
                </Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                    navigation.navigate('Settings');
                    onClose();
                }}
            >
                <Text style={{color: '#fff'}}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                <Text style={{color: '#fff'}}>Logout</Text>
            </TouchableOpacity>
        </View>
    );
}
