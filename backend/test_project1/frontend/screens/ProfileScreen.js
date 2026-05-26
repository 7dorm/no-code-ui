// screens/ProfileSettingsScreen.js

import React, {useEffect, useState} from 'react';
import {View, Text, ActivityIndicator, Dimensions, TouchableOpacity, Image, FlatList, RefreshControl} from 'react-native';
import {styles} from '../styles/screens/ProfileScreen';
import {Menu} from "../MainNavigator";
import Database, {API_URL} from "../database";
import {Avatar} from "@rneui/base";
import Post from "../components/Post";

export default function ProfileScreen({navigation, route}) {
    const { current, colors } =  {
        current: 'light',
        colors: { light: { text: '#FFF', background: '#000' } },
    };
    const theme = colors[current];

    const [user, setUser] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOwnProfile, setIsOwnProfile] = useState(false);
    const [userStats, setUserStats] = useState(null);

    // Posts state for internal scrolling surface
    const [posts, setPosts] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Получаем userId из route.params или используем текущего пользователя
    const userId = route?.params?.userId;

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                setIsLoading(true);
                // console.log('ProfileScreen: Starting to fetch user data, userId:', userId);

                // Получаем текущего пользователя
                const currentUserData = await Database.getCurrentUser();
                // console.log('ProfileScreen: Current user data:', currentUserData);
                setCurrentUser(currentUserData);

                // Определяем, чей профиль показывать
                const targetUserId = userId || currentUserData?.idUser;
                // console.log('ProfileScreen: Target user ID:', targetUserId);

                if (targetUserId) {
                    // Получаем данные пользователя
                    const userData = await Database.getUser(targetUserId);
                    // console.log('ProfileScreen: User data:', userData);
                    setUser(userData);

                    // Проверяем, является ли это профилем текущего пользователя
                    const isOwn = currentUserData?.idUser === targetUserId;
                    // console.log('ProfileScreen: Is own profile:', isOwn);
                    setIsOwnProfile(isOwn);

                    // Загружаем статистику пользователя
                    await fetchUserStats(targetUserId);

                    // Reset posts and load first page
                    setPosts([]);
                    setPage(1);
                    setHasMore(true);
                    await loadPosts(1, targetUserId, true);
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // Функция для загрузки постов пользователя (internal)
    const loadPosts = async (pageToLoad, targetUserId, replace = false) => {
        if (isLoadingMore) return;
        try {
            setIsLoadingMore(true);
            const res = await getUserPosts(pageToLoad, targetUserId);
            const newPosts = res.posts || [];
            setPosts(prev => replace ? newPosts : [...prev, ...newPosts]);
            setHasMore(newPosts.length > 0);
            setPage(pageToLoad);
        } catch (e) {
            console.error('Error loading posts:', e);
        } finally {
            setIsLoadingMore(false);
        }
    };

    // Обработчик обновления (pull-to-refresh)
    const onRefresh = async () => {
        try {
            setRefreshing(true);
            const targetUserId = userId || currentUser?.idUser;
            if (!targetUserId) return;
            await loadPosts(1, targetUserId, true);
        } finally {
            setRefreshing(false);
        }
    };

    // Обработчик подгрузки следующей страницы
    const onEndReached = async () => {
        if (!hasMore || isLoadingMore) return;
        const targetUserId = userId || currentUser?.idUser;
        if (!targetUserId) return;
        await loadPosts(page + 1, targetUserId);
    };

    // Функция для загрузки постов пользователя через API
    const getUserPosts = async (pageParam, explicitUserId) => {
        try {
            const targetUserId = explicitUserId || userId || currentUser?.idUser;
            // console.log('Fetching posts for user:', targetUserId, 'page:', pageParam);
            if (!targetUserId) {
                return { posts: [] };
            }
            const response = await fetch(`${API_URL}/user/${targetUserId}/posts?page=${pageParam}&pageSize=10`, {
                headers: await Database.authHeaders(),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching user posts:', error);
            return { posts: [] };
        }
    };

    // Функция для загрузки статистики пользователя
    const fetchUserStats = async (explicitUserId) => {
        try {
            const targetUserId = explicitUserId || userId || currentUser?.idUser;
            if (!targetUserId) return;

            const response = await fetch(`${API_URL}/user/${targetUserId}/stats`, {
                headers: await Database.authHeaders(),
            });

            if (response.ok) {
                const statsData = await response.json();
                setUserStats(statsData);
            }
        } catch (error) {
            console.error('Error fetching user stats:', error);
        }
    };

    // Header that scrolls with the list
    const ListHeader = () => (
        <>
            <View style={styles.profileHeader}>
                <View style={styles.profileInfo}>
                    <Avatar
                        source={user?.pic ? {uri: user.pic} : require('../assets/default-avatar.png')}
                        rounded
                        size="large"
                        containerStyle={styles.avatar}
                    />
                    <View style={styles.userDetails}>
                        <Text style={[styles.username, {color: theme.text}]}>
                            {user?.displayedName || 'Unknown User'}
                        </Text>
                        <Text style={[styles.userId, {color: theme.text}]}>
                            ID: {user?.idUser}
                        </Text>
                        {isOwnProfile && (
                            <Text style={[styles.ownProfile, {color: '#4CAF50'}]}>Your Profile</Text>
                        )}
                    </View>
                </View>
                {isOwnProfile && (
                    <TouchableOpacity
                        style={styles.settingsButton}
                        onPress={() => navigation.navigate('ProfileSettings')}
                    >
                        <Text style={styles.settingsButtonText}>Settings</Text>
                    </TouchableOpacity>
                )}
            </View>

            {userStats && (
                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={[styles.statNumber, {color: theme.text}]}>
                            {userStats.postsCount || 0}
                        </Text>
                        <Text style={[styles.statLabel, {color: '#888'}]}>Posts</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statNumber, {color: theme.text}]}>
                            {userStats.commentsCount || 0}
                        </Text>
                        <Text style={[styles.statLabel, {color: '#888'}]}>Comments</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statNumber, {color: theme.text}]}>
                            {userStats.followersCount || 0}
                        </Text>
                        <Text style={[styles.statLabel, {color: '#888'}]}>Tag Followers</Text>
                    </View>
                </View>
            )}

            <View>
                <Text style={[styles.sectionTitle, {color: theme.text}]}>
                    {isOwnProfile ? 'Your Posts' : `${user?.displayedName}'s Posts`}
                </Text>
            </View>
        </>
    );

    const renderItem = ({ item }) => (
        <View style={{
            minHeight: 50,
            width: '100%',
            alignItems: 'center',
            paddingHorizontal: 5,
        }}>
            <Post
                post={item}
                navigation={navigation}
                refresher={onRefresh}
            />
        </View>
    );

    if (isLoading) {
        return (
            <View style={[styles.container, {backgroundColor: theme.background}]}>
                <Menu navigation={navigation} header={true}/>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.text} />
                    <Text style={[styles.loadingText, {color: theme.text}]}>Loading profile...</Text>
                </View>
            </View>
        );
    }

    if (!user) {
        return (
            <View style={[styles.container, {backgroundColor: theme.background}]}>
                <Menu navigation={navigation} header={true}/>
                <View style={styles.errorContainer}>
                    <Text style={[styles.errorText, {color: theme.text}]}>User not found</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* fixed top menu */}
            <Menu navigation={navigation} header={true} />

            {/* scrolling posts + profile */}
            <FlatList
                data={posts}
                renderItem={renderItem}
                keyExtractor={(item, index) =>
                    item.idPost ? item.idPost.toString() : index.toString()
                }
                style={styles.mediaScroll && {flex:1}}
                contentContainerStyle={{  paddingBottom: 20 }}
                ListHeaderComponent={ListHeader}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#fff"
                    />
                }
                onEndReached={onEndReached}
                onEndReachedThreshold={0.5}
                showsVerticalScrollIndicator={true}
            />
        </View>
    );
}
