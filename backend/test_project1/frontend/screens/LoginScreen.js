// screens/LoginScreen.js

import React, {useState, useEffect, useRef} from 'react';
import {View, Text, TextInput, Button, KeyboardAvoidingView} from 'react-native';
import Database from '../database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {styles} from '../styles/screens/LoginScreen';
import Modal from "react-native-modal";

export default function LoginScreen({navigation}) {
    const { current, colors } =  {
        current: 'light',
        colors: { light: { text: '#FFF', background: '#000' } },
    };
    const theme = colors[current];
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [realName, setRealName] = useState('');
    const [group, setGroup] = useState('');
    const [displayedName, setDisplayedName] = useState('');
    const [error, setError] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);

    const emailRef = useRef(null);
    const passwordRef = useRef(null);
    const realNameRef = useRef(null);
    const groupRef = useRef(null);
    const displayedNameRef = useRef(null);

    useEffect(() => {
        async function check() {
            const user = await AsyncStorage.getItem('token');
            if (user) {
                navigation.replace('Main');
            }
        }

        check();
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const isStandalone = "standalone" in window.navigator && window.navigator.standalone;

        if (isIOS && isSafari && !isStandalone) {
            setShowPrompt(true);
        }
    }, []);

    const handleSubmit = async () => {
        setError(null);
        try {
            let user;
            if (isLogin) {
                user = await Database.login({email, password});
            } else {
                if ((password.length > 7) && (displayedName.length > 1)) {
                    user = await Database.register({email, password, realName, group, displayedName});
                } else {
                    alert('Password or Displayed Name Too Short!');
                }
            }
            navigation.replace('Main');
        } catch (err) {
            setError(err.message);
            console.error('Auth error:', err.message);
        }
    };

    const handleReset = async () => {
        setError(null);
        try {
            if (!email) {
                setError("Please enter an email");
                return;
            }
            setError("Check your inbox");
            await Database.resetPass(email);

        } catch (error) {
            setError(error.text);
            console.error(error);
        }
    }


    return (
        <KeyboardAvoidingView style={[styles.container, {backgroundColor: theme.background}]}>
            <Text style={[styles.title, {color: theme.text}]}>
                {isLogin ? 'Login' : 'Sign Up'}
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <TextInput
                ref={emailRef}
                style={[styles.input, {borderColor: theme.border, color: theme.text}]}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                placeholderTextColor={theme.text === '#000' ? '#666' : '#ccc'}
                onSubmitEditing={() => passwordRef.current.focus()}
            />
            <TextInput
                ref={passwordRef}
                style={[styles.input, {borderColor: theme.border, color: theme.text}]}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor={theme.text === '#000' ? '#666' : '#ccc'}
                onSubmitEditing={() => isLogin ? handleSubmit(): realNameRef.current.focus()}
            />

            {!isLogin && (
                <>
                    <TextInput
                        ref={realNameRef}
                        style={[styles.input, {borderColor: theme.border, color: theme.text}]}
                        placeholder="Real Name"
                        value={realName}
                        onChangeText={setRealName}
                        placeholderTextColor={theme.text === '#000' ? '#666' : '#ccc'}
                        onSubmitEditing={() => groupRef.current.focus()}
                    />
                    <TextInput
                        ref={groupRef}
                        style={[styles.input, {borderColor: theme.border, color: theme.text}]}
                        placeholder="Group (e.g., student)"
                        value={group}
                        onChangeText={setGroup}
                        placeholderTextColor={theme.text === '#000' ? '#666' : '#ccc'}
                        onSubmitEditing={() => displayedNameRef.current.focus()}
                    />
                    <TextInput
                        ref={displayedNameRef}
                        style={[styles.input, {borderColor: theme.border, color: theme.text}]}
                        placeholder="Displayed Name"
                        value={displayedName}
                        onChangeText={setDisplayedName}
                        placeholderTextColor={theme.text === '#000' ? '#666' : '#ccc'}
                        onSubmitEditing={() => handleSubmit()}
                    />
                </>
            )}
            <Button title={isLogin ? 'Login' : 'Sign Up'} onPress={handleSubmit}/>
            <Button
                title={`Switch to ${isLogin ? 'Sign Up' : 'Login'}`}
                onPress={() => {
                    setIsLogin(!isLogin);
                    setError(null);
                    setEmail('');
                    setPassword('');
                    setRealName('');
                    setGroup('');
                    setDisplayedName('');
                }}
            />
            {isLogin && (
                <Button title={"Reset password"} onPress={handleReset}/>
            )}
            <Modal visible={showPrompt} style={{backgroundColor: "#111"}}>
                <View style={{alignItems: 'center', alignSelf: 'center', alignContent: 'center'}}>
                    <Text style={{color: "#fff", fontSize: 20, alignSelf: 'center', alignItems: 'center', alignContent: 'center', justifyContent: 'center'}}>
                        Нажми на кнопку поделиться, потом выбери "Add to Home Screen" чтобы установить
                    </Text>
                    {/* Add an image or icon here */}
                    <Button title="Got it" onPress={() => setShowPrompt(false)} />
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}
