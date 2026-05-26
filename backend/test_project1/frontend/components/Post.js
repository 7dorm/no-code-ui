import React, {useEffect, useState, useRef} from 'react';
import {
    View, Text, FlatList, TouchableOpacity, ActivityIndicator, Dimensions, Image, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import {Video} from 'react-native-video';
import {Avatar} from 'react-native-elements';
import {Ionicons} from '@expo/vector-icons';
import Database, {BASE_URL} from '../database';
import Tag from "./Tag";
import Modal from "react-native-modal";
import UserProfileModal from './UserProfileModal';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

function findURLs(text) {
    // Regular expression for matching URLs
    const urlPattern = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*))/gi;

    // Find all matches in the text
    const urls = text.match(urlPattern) || [];

    return urls;
}

import {Platform} from 'react-native';

let WebView;

if (Platform.OS === 'web') {
    WebView = require('react-native-web-webview').default;
} else {
    WebView = require('react-native-webview').default;
}


const Post = React.memo(({navigation, post, refresher}) => {
    const theme =  {
        current: 'light',
        colors: { light: { text: '#000', background: '#FFF' } },
    };
    const [liked, setLiked] = useState(post.likedByCurrentUser || false);
    const [creator, setCreator] = useState({displayedName: 'Loading...', pic: null});
    const [myPost, setMyPost] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [open, setOpen] = useState(false);
    const flatListRef = useRef(null);
    const [commentsCount, setCommentsCount] = useState(0);
    const [urls, setUrls] = useState([]);
    const [content, setContent] = useState('');
    const [showUserModal, setShowUserModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    useEffect(() => {
        let mounted = true;

        const fetchPostData = async () => {
            try {
                setIsLoading(true);
                const [user, me] = await Promise.all([Database.getUser(post.createdByIdUser), Database.getCurrentUser(),]);
                // console.log(user);
                const likeStatus = await Database.getLikePost(Number(post.idPost));
                setLiked(likeStatus);
                if (mounted) {
                    setCreator(user || {displayedName: 'Unknown', pic: null});
                    setMyPost(me?.idUser === post.createdByIdUser);
                }
                const t = await Database.getPostCommentsCount(post.idPost);
                setCommentsCount(t.count);
                if (post.content) {
                    const url1 = findURLs(post.content);
                    setUrls(url1);
                    let temp = post.content;
                    url1.forEach(url => {
                        temp = temp.replace(url, `(${urls.indexOf(url) + 2})`);
                    })
                    setContent(temp);
                }
            } catch (error) {
                console.error('Error fetching post data:', error);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        fetchPostData();
        return () => {
            mounted = false;
        };
    }, [post.createdByIdUser, post.idPost]);

    useEffect(() => {
        const interval = setInterval(async () => {
            await updateCommentsCount();
        }, 1000)
        return () => clearInterval(interval)
    }, []);

    const updateCommentsCount = async () => {
        const t = await Database.getPostCommentsCount(post.idPost);
        setCommentsCount(t.count);
    }

    const handleUserPress = async () => {
        try {
            const userData = await Database.getUser(post.createdByIdUser);
            setSelectedUser(userData);
            setShowUserModal(true);
        } catch (error) {
            console.error('Error fetching user data:', error);
        }
    };

    const closeUserModal = () => {
        setShowUserModal(false);
        setSelectedUser(null);
    };

    const handleLike = async () => {
        try {
            if (liked) {
                await Database.unlikePost(post.idPost);
                setLiked(false);
                post.likes--;
            } else {
                await Database.likePost(post.idPost);
                setLiked(true);
                post.likes++;
            }
        } catch (err) {
            console.error('Error handling like:', err);
        }
    };

    const deletePost = async () => {
        if (!myPost) {
            alert('You are not the creator');
            return;
        }

        try {
            const resp = await Database.deletePost(post.idPost);
            // console.log('Delete response:', resp);

            // Проверяем успешность удаления
            if (resp && resp.message === 'Post deleted successfully') {
                // Вызываем функцию обновления списка
                if (refresher) {
                    refresher();
                } else {
                    console.warn('Refresher function not provided');
                }
            } else {
                alert('Failed to delete post');
            }
        } catch (error) {
            console.error('Error deleting post:', error);
            alert('Failed to delete post');
        }
    };

    // const onViewableItemsChanged = useRef(({ viewableItems }) => {
    //     if (viewableItems.length > 0) {
    //         setCurrentIndex(viewableItems[0].index);
    //     }
    // }).current;

    if (isLoading) {
        return (<View style={styles.container}>
            <ActivityIndicator size="large" color={theme.colors.primary}/>
        </View>);
    }

    const renderUrl = ({item}) => {
        return (<View style={{
            width: 80, height: 25, backgroundColor: "#222", borderRadius: 5, alignSelf: 'center', alignItems: 'center'
        }}>
            <a href={item} style={{color: "#FFFFFF"}} target="_blank">{item.slice(8, 18)}</a>
        </View>);
    }

    const mediaItems = Array.isArray(post.images) ? post.images : post.images?.split(',').filter(Boolean) || [];
    return (<View style={[styles.container, {backgroundColor: theme.colors.background}]}>
        <Modal isVisible={open}>
            <Image
                style={{width: "100%", height: "100%", resizeMode: "center"}}
                source={creator.pic ? {uri: `${creator.pic}`} : require('../assets/default-avatar.png')}/>

        </Modal>
        {/* Header */}
        <View style={styles.header}>
            <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
                <Avatar
                    source={creator.pic ? {uri: creator.pic} : require('../assets/default-avatar.png')}
                    rounded
                    size="medium"
                    containerStyle={styles.avatar}
                    onLongPress={() => setOpen(true)}
                    onPressOut={() => setOpen(false)}
                />
                <TouchableOpacity
                    style={styles.userInfo}
                    onPress={handleUserPress}
                >
                    <View>
                        <Text style={styles.username}>
                            {post.isAnonymous ? 'Anonymous' : creator.displayedName}
                        </Text>
                        <Text style={styles.timestamp}>
                            {new Date(post.createdAt).toLocaleDateString()}
                        </Text>
                    </View>

                </TouchableOpacity>
            </View>
            {/* Tags */}
            {post.tags?.length > 0 && (<View style={styles.tagsContainer && {flex: 1}}>
                <FlatList
                    style={{flexDirection: 'row-reverse'}}
                    data={Array.isArray(post.tags) ? post.tags.slice(0, 4).reverse() : post.tags.split(',').slice(0, 4).reverse()}
                    renderItem={({item}) => (<Tag tag={item} navigation={navigation}/>)}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item, index) => `${item}-${index}`}
                />
            </View>)}
            {myPost && (<TouchableOpacity onPress={deletePost}>
                <Ionicons name="trash-outline" size={24} color="#ff4444"/>
            </TouchableOpacity>)}
        </View>
        {/* Content */}
        {content && (<View style={styles.contentContainer}>
            <Text style={styles.content}>{content}</Text>
        </View>)}
        {}

        {/* Media */}
        {mediaItems.length > 0 && (<View>
            <ScrollView
                ref={flatListRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={1}
                onScroll={(e) => {
                    const newIndex = Math.round((e.nativeEvent.contentOffset.x + 100) / SCREEN_WIDTH);
                    setCurrentIndex(newIndex);
                }}
                style={styles.mediaScroll}
                contentContainerStyle={styles.mediaScrollContent}
            >
                {mediaItems.map((item, index) => (<View key={`${item}-${index}`} style={styles.mediaContainer}>
                    {/\.(mp4|mov|m4v)$/.test(item) ? (<Video
                        source={{uri: `${BASE_URL}${item}`}}
                        style={styles.media}
                        resizeMode="cover"
                        shouldPlay={currentIndex === index}
                        isLooping
                        useNativeControls={true}
                        onError={(e) => console.error('Video error:', e)}
                    />) : (<Image
                        source={{uri: `${BASE_URL}${item}`}}
                        style={styles.media}
                        resizeMode="cover"
                        onError={(e) => console.error('Image error:', e)}
                    />)}

                </View>))}
            </ScrollView>
            {mediaItems.length > 1 && (<View style={styles.pagination}>
                {mediaItems.map((_, i) => (<Pressable
                    key={i}
                    onPress={() => {
                        flatListRef.current?.scrollTo({x: i * SCREEN_WIDTH, animated: true});
                        setCurrentIndex(i);
                    }}
                    style={[styles.dot, {backgroundColor: i === currentIndex ? '#fff' : 'rgba(255,255,255,0.5)'},]}
                />))}
            </View>)}
        </View>)}

        {urls.length > 0 && (<View style={styles.actions}>
            <FlatList
                data={urls}
                renderItem={renderUrl}
                horizontal
                showsHorizontalScrollIndicator={false}
            />
        </View>)}
        {post.iframe && (<View style={{width: '100%', alignSelf: 'center'}}>
                <WebView
                    originWhitelist={['*']}
                    source={{
                        html: `
                            <html>
                            <body style="margin:0;padding:0;display:flex;justify-content:center;align-items:center;height:100vh;">
                            ${post.iframe}
                            </body>
                            </html>
                        `
                    }}
                    javaScriptEnabled
                    style={{
                        flex: 1, alignSelf: 'center', backgroundColor: 'transparent',
                    }}
                />
            </View>

        )}

        {/* Actions */}
        <View style={styles.actions}>
            <TouchableOpacity onPress={handleLike} style={styles.actionButton}>
                <Ionicons
                    name={liked ? 'heart' : 'heart-outline'}
                    size={28}
                    color={liked ? '#ff4444' : '#666'}
                />
                <Text style={styles.actionText}>{post.likes}</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => navigation.navigate('PostDetail', {postId: post.idPost, navigation: navigation})}
                style={styles.actionButton}
            >
                <Ionicons name="chatbubble-outline" size={28} color="#666"/>
                <Text style={styles.actionText}>{commentsCount}</Text>
            </TouchableOpacity>
        </View>

        {/* User Profile Modal */}
        <UserProfileModal
            isVisible={showUserModal}
            onClose={closeUserModal}
            user={selectedUser}
            navigation={navigation}
        />

    </View>);
});

const styles = StyleSheet.create({
    container: {
        maxWidth: 660,
        width: Math.min(Dimensions.get('window').width * 0.95, 660), // Адаптивная ширина
        marginVertical: 8,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        alignSelf: 'center', // Центрируем пост
        backgroundColor: '#1a1a1a', // Добавляем фон для лучшей видимости
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1, // Позволяет контенту занимать доступное пространство
    },
    avatar: {
        marginRight: 12,
        borderWidth: 2,
        borderColor: '#fff',
    },
    username: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    timestamp: {
        color: '#aaa',
        fontSize: 12,
        marginTop: 2,
    },
    mediaScroll: {
        width: '100%',
        padding: 0,
        alignSelf: 'center',
        flex: 1,
    },
    mediaScrollContent: {
        flexDirection: 'row',
        padding: 0,
    },
    mediaContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: Math.min(Dimensions.get('window').width * 0.95, 660), // Адаптивная ширина
        maxWidth: 660,
    },
    media: {
        width: Math.min(Dimensions.get('window').width * 0.95, 660), // Адаптивная ширина
        height: Math.min(Dimensions.get('window').width * 0.95, 660), // Квадратное изображение
        maxWidth: 660,
        maxHeight: 660,
        overflow: "hidden",
    },
    pagination: {
        position: 'absolute',
        bottom: 10,
        flexDirection: 'row',
        alignSelf: 'center',
    },
    dot: {
        height: 8,
        width: 8,
        borderRadius: 4,
        margin: 4,
    },
    contentContainer: {
        padding: 12,
    },
    content: {
        color: '#fff',
        fontSize: 14,
        lineHeight: 20,
    },
    actions: {
        flexDirection: 'row',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 20,
    },
    actionText: {
        color: '#fff',
        marginLeft: 8,
        fontSize: 14,
    },
    tagsContainer: {
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    tag: {
        color: '#4CAF50',
        marginRight: 8,
        fontSize: 14,
    },
});

export default Post;
