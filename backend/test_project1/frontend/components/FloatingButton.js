import React, {useEffect, useRef} from "react";
import {Animated, Dimensions, Platform, Text, TouchableOpacity} from "react-native";

export const FloatingButton = ({ onPress, visible }) => {
    const slideAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(slideAnim, {
            toValue: visible ? 0 : 300,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, [visible, slideAnim]);

    return (
        <Animated.View
            style={{
                position: 'absolute',
                top: Platform.OS === 'web' ? Dimensions.get('window').height * 0.85 : '80%',
                right: Platform.OS === 'web' ? Dimensions.get('window').width * 0.02 : '3%',
                zIndex: 999,
                transform: [{ translateY: slideAnim }],
            }}
        >
            <TouchableOpacity
                style={{
                    backgroundColor: '#000',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 10,
                    borderRadius: 50,
                    width: 60,
                    height: 60,
                }}
                onPress={onPress}
            >
                <Text style={{ fontSize: 30, color: '#FFF' }}>σ</Text>
            </TouchableOpacity>
        </Animated.View>
    );
};
