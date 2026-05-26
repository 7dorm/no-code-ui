import React, {useEffect, useRef} from "react";
import {StyleSheet, View, Text, Animated} from "react-native";

export default function SplashScreen({navigation}) {
    const slideAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(slideAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0.5,
                    duration: 500,
                    useNativeDriver: true,
                })
            ]),
            {iterations: -1} // Infinite loop
        ).start();

        const timer = setTimeout(() => {
            navigation.replace('SystemMessage');
        }, 2000);

        return () => clearTimeout(timer);
    }, [slideAnim, navigation]);

    return (
        <View style={styles.container}>
            <Animated.Image style={[styles.image, {opacity: slideAnim}]} source={require('../public/logo-rb.png')} />
            <Text style={styles.text}>Open beta now!</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        alignSelf: 'center',
        alignItems: 'center',
        width: 100,
        height: 100,
        marginBottom: 20,

    },
    text: {
        fontWeight: 'bold',
        color: '#222',
        fontSize: 18,
        marginBottom: 20,
        alignSelf: 'center',
        alignItems: 'center',
    }
});
