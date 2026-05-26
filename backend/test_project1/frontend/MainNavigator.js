import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View, Dimensions, Button, TouchableOpacity, FlatList, Text, Pressable, SafeAreaView,
} from 'react-native';
import Modal from 'react-native-modal';
import FeedScreen from './screens/FeedScreen';
import FollowingScreen from './screens/FollowingScreen';
import Database from "./database";

const screens = [{ key: 'Feed', component: FeedScreen, title: 'Feed' }, {
    key: 'Following', component: FollowingScreen, title: 'Following'
}];

export function Menu({ navigation, header, scrollToPage, activeScreen, setActiveScreen }) {
    const [showMenu, setShowMenu] = useState(false);

    const openMenu = () => setShowMenu(true);
    const closeMenu = () => setShowMenu(false);


    const handleNavigation = useCallback((screenName, index) => {
        setActiveScreen(screenName);
        scrollToPage(index);
    }, [scrollToPage, setActiveScreen]);

    return (<View>
        <Modal
            testID={'modal'}
            deviceHeight={Dimensions.get('window').height}
            deviceWidth={Dimensions.get('window').width}
            animationIn="slideInLeft"
            animationOut="slideOutLeft"
            transparent
            isVisible={showMenu}
            onRequestClose={closeMenu}
            style={{
                width: Dimensions.get('window').width,
                height: Dimensions.get('window').height,
                flexDirection: 'row',
                margin: 0,
            }}
        >
            <View
                style={{
                    backgroundColor: '#000',
                    width: Dimensions.get('window').width * 0.3,
                    height: Dimensions.get('window').height,
                    flexDirection: 'column',
                }}
            >
                <View style={{ flex: 3 }}>
                    <TouchableOpacity
                        onPress={() => {
                            closeMenu();
                        }}
                        style={{
                            marginTop: 5,
                            borderRadius: 5,
                            backgroundColor: '#222',
                            height: 30,
                            width: Dimensions.get('window').width * 0.3,
                            justifyContent: 'center',
                            alignItems: 'center',
                            maxWidth: 200,
                            alignSelf: 'center',
                        }}
                    >
                        <Text style={{ color: '#FFF' }}>
                            Close
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => {
                            closeMenu();
                            navigation.navigate('Main');
                            navigation.navigate('ProfileSettings');
                        }}
                        style={{
                            marginTop: 5,
                            borderRadius: 5,
                            backgroundColor: '#111',
                            height: 50,
                            width: Dimensions.get('window').width * 0.3,
                            justifyContent: 'center',
                            alignItems: 'center',
                            alignSelf: 'center',
                            maxWidth: 200
                        }}
                    >
                        <Text style={{ color: '#fff' }}>Settings</Text>
                    </TouchableOpacity>



                    <TouchableOpacity
                        onPress={() => {
                            closeMenu();
                            navigation.navigate('Main');
                            navigation.navigate('Profile', { userId: null }); // null означает профиль текущего пользователя
                        }}
                        style={{
                            marginTop: 5,
                            borderRadius: 5,
                            backgroundColor: '#111',
                            height: 50,
                            width: Dimensions.get('window').width * 0.3,
                            justifyContent: 'center',
                            alignItems: 'center',
                            alignSelf: 'center',
                            maxWidth: 200
                        }}
                    >
                        <Text style={{ color: '#fff' }}>Profile</Text>
                    </TouchableOpacity>




                </View>
                <View style={{ flex: 10 }}></View>
                <View style={{ flex: 1, alignSelf: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#FFF' }}>
                        SigmaLTD community
                    </Text>
                    <Text style={{ color: '#555' }}>
                        We trust in you
                    </Text>
                </View>

            </View>
            <TouchableOpacity
                style={{
                    width: Dimensions.get('window').width * 0.7, height: Dimensions.get('window').height,
                }}
                onPress={closeMenu}
            />
        </Modal>
        <View style={{ flexDirection: 'row', backgroundColor: '#000', width: Dimensions.get('window').width }}>

            {header ? <>
                <Pressable
                    style={{
                        flex: 2, alignItems: 'center', alignSelf: 'center', justifyContent: 'center',
                    }}
                    onPress={openMenu}
                >
                    <Text style={{ fontSize: 30, color: "#FFF", fontWeight: "bold" }}>Σ</Text>
                </Pressable>
                <View
                    style={{
                        flex: 20, alignItems: 'center', alignSelf: 'center', justifyContent: 'center',
                    }} />
                <TouchableOpacity onPress={navigation.goBack}
                    style={{ flex: 2, justifyContent: 'center', alignItems: 'center', marginRight: 5 }}>
                    <Text style={{ color: "#FFF" }}>Close</Text>
                </TouchableOpacity>

            </> : <>
                <Pressable
                    style={{
                        flex: 2, alignItems: 'center', alignSelf: 'center', justifyContent: 'center',
                    }}
                    onPress={openMenu}
                >
                    <Text style={{ fontSize: 30, color: "#FFF", fontWeight: "bold" }}>Σ</Text>
                </Pressable>
                <TouchableOpacity
                    style={{
                        flex: 10, alignItems: 'center', justifyContent: 'center',
                    }}
                    onPress={() => handleNavigation('Feed', 0)}
                >
                    <Text
                        style={{
                            fontSize: activeScreen === 'Feed' ? 20 : 16,
                            fontWeight: activeScreen === 'Feed' ? 'bold' : 'normal',
                            color: "#FFF"
                        }}
                    >
                        Feed
                    </Text>
                </TouchableOpacity><TouchableOpacity
                    style={{
                        flex: 10, alignItems: 'center', justifyContent: 'center',
                    }}
                    onPress={() => handleNavigation('Following', 1)}
                >
                    <Text
                        style={{
                            fontSize: activeScreen === 'Following' ? 20 : 16,
                            fontWeight: activeScreen === 'Following' ? 'bold' : 'normal',
                            color: "#FFF"
                        }}
                    >
                        Following
                    </Text>
                </TouchableOpacity>
                <View
                    style={{
                        flex: 2, alignItems: 'center', alignSelf: 'center', justifyContent: 'center',
                    }}>
                </View>
            </>}
        </View>
    </View>);
}

function MainNavigator({ navigation }) {
    const flatListRef = useRef(null);
    const [activeScreen, setActiveScreen] = useState('Feed');
    const refList = [];
    useEffect(() => {
        navigation.addListener('focus', () => {
            setActiveScreen('Feed');
        })
        checkAuth().then();
    })

    const checkAuth = async () => {
        try {
            await Database.getAllPosts(1);
        } catch (error) {
            navigation.replace('Login');
        }
    }

    const scrollToPage = useCallback((index) => {
        if (flatListRef.current) {
            flatListRef.current.scrollToIndex({
                animated: true, index,
            });
        }
    }, []);

    const getItemLayout = useCallback((data, index) => ({
        length: Dimensions.get('window').width, offset: Dimensions.get('window').width * index, index,
    }), []);

    const onScrollToIndexFailed = useCallback((info) => {
        console.warn('Scroll to index failed:', info);
        const wait = new Promise((resolve) => setTimeout(resolve, 500));
        wait.then(() => {
            flatListRef.current?.scrollToIndex({
                index: info.index, animated: true,
            });
        });
    }, []);

    const setActiveScreenRef = useRef(setActiveScreen);
    setActiveScreenRef.current = setActiveScreen;

    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        if (viewableItems.length > 0) {
            const visibleScreen = viewableItems[0].item;
            setActiveScreenRef.current(visibleScreen.key);
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;


    return (<View style={{ flex: 1 }}>
        <Menu
            navigation={navigation}
            scrollToPage={scrollToPage}
            activeScreen={activeScreen}
            setActiveScreen={setActiveScreen}
        />
        <FlatList
            ref={flatListRef}
            data={screens}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (<View
                style={{
                    width: Dimensions.get('window').width, height: Dimensions.get('window').height,
                }}
            >
                <item.component
                    navigation={navigation}
                    currentScreen={activeScreen === item.key}
                    setActiveScreen={setActiveScreen}// Pass currentScreen prop
                />
            </View>)}
            keyExtractor={(item) => item.key}
            getItemLayout={getItemLayout}
            onScrollToIndexFailed={onScrollToIndexFailed}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={2}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
        />
    </View>);
}

export default MainNavigator;
