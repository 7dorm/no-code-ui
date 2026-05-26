import React, { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';
import PostDetailScreen from './screens/CommentScreen';
import { CreatePostScreen } from './screens/CreatePostScreen';
import MainNavigator from './MainNavigator';
import SplashScreen from "./screens/SplashScreen";
import ProfileSettingsScreen from "./screens/ProfileSettingsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import StaticSystemMessageScreen from "./screens/StaticSystemMessageScreen";

const Stack = createStackNavigator();


export default function App() {
    const navigationRef = useRef(null);

    return (

        <GestureHandlerRootView style={{ flex: 1 }}>
                <NavigationContainer ref={navigationRef}>
                    <Stack.Navigator initialRouteName="Splash">
                        <Stack.Screen
                            name="Splash"
                            component={SplashScreen}
                            options={{ headerShown: false }} />
                        <Stack.Screen
                            name="Login"
                            component={LoginScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="SystemMessage"
                            component={StaticSystemMessageScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Main"
                            component={MainNavigator}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name={"ProfileSettings"}
                            component={ProfileSettingsScreen}
                            options={{ headerShown: false }} />
                        <Stack.Screen
                            name={"Profile"}
                            component={ProfileScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Settings"
                            component={SettingsScreen}
                            options={{ headerShown: false }} // You can customize this
                        />
                        <Stack.Screen
                            name="PostDetail"
                            component={PostDetailScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="CreatePost"
                            component={CreatePostScreen}
                            options={{ headerShown: false }}
                        />
                    </Stack.Navigator>
                </NavigationContainer>
        </GestureHandlerRootView>
    );
}
