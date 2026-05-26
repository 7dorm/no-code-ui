import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    TextInput,
    FlatList,
    Text,
    Image,
    ActivityIndicator,
    Platform,
    StyleSheet,
    KeyboardAvoidingView,
    Switch, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Database from '../database';
import { Menu } from '../MainNavigator';
import Comment from '../components/Comment';
import {Avatar} from "@rneui/base";

export default function PostDetailScreen({ route }) {
    const { current, colors } =  {
        current: 'light',
        colors: { light: { text: '#000', background: '#FFF' } },
    };
    const theme = colors[current] || { text: '#000', background: '#FFF' };

    const [post, setPost] = useState(null);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [selectedImages, setSelectedImages] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const flatListRef = useRef(null);
    const [inputHeight, setInputHeight] = useState(40);

    // Fetch initial data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const postData = await Database.getPost(route.params.postId);
                const loadedComments = await Database.getPostComments(route.params.postId);
                const currentUse = await Database.getCurrentUser();

                // console.log('Loaded comments:', loadedComments);

                setPost(postData);
                setComments(loadedComments || []);
                setCurrentUser(currentUse);
            } catch (err) {
                console.error('❌ Ошибка загрузки:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [route.params.postId]);

    // Scroll to end when comments update
    useEffect(() => {
        // With inverted FlatList, new comments appear at the top automatically
        // No need to scroll manually
    }, [comments.length]);

    // Poll for new comments
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const loadedComments = await Database.getPostComments(route.params.postId);
                if (loadedComments && Array.isArray(loadedComments)) {
                    setComments(loadedComments);
                } else {
                    console.error('Invalid comments data received:', loadedComments);
                }
            } catch (error) {
                console.error('Error polling comments:', error);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [route.params.postId]);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            base64: true,
        });

        if (!result.canceled) {
            const asset = result.assets?.[0];
            if (!asset || !asset.base64) return;

            const fullDataUri = `data:image/jpeg;base64,${asset.base64}`;
            setSelectedImages([{ uri: fullDataUri }]);
        }
    };

    const sendComment = async () => {
        const content = newComment.trim();
        if (!content && selectedImages.length === 0) return;

        try {
            const imageBase64 = selectedImages[0]?.uri || null;

            const newC = await Database.addCommentBase64({
                postId: post.idPost || post.id,
                content,
                isAnonymous: isAnonymous,
                imageBase64,
            });

            // Проверяем, что новый комментарий содержит необходимые поля
            if (newC && typeof newC === 'object') {
                // console.log('New comment received:', newC);
                setComments((prev) => [newC, ...prev]);
            } else {
                console.error('Invalid comment data received:', newC);
            }

            setNewComment('');
            setSelectedImages([]);
        } catch (err) {
            console.error('❌ Ошибка отправки комментария:', err);
        }
    };

    const toggleLike = async (item) => {
        try {
            const updatedComments = [...comments];
            const index = updatedComments.findIndex((c) => c.idComment === item.idComment);
            if (index === -1) return;

            const current = updatedComments[index];
            if (current.likedByMe) {
                await Database.unlikeComment(current.idComment);
                current.likes = Number(current.likes) - 1;
                current.likedByMe = false;
            } else {
                await Database.likeComment(current.idComment);
                current.likes = Number(current.likes) + 1;
                current.likedByMe = true;
            }

            setComments(updatedComments);
        } catch (err) {
            console.error('❌ Ошибка лайка:', err);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={theme.text} />
            </View>
        );
    }

    const Wrapper = Platform.OS === 'ios' ? KeyboardAvoidingView : View;

    return (
        <Wrapper
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
            <Menu navigation={route.params.navigation} header={true} />
            <FlatList
                ref={flatListRef}
                data={comments}
                keyExtractor={(item, index) => `${item?.idComment || index}`}
                renderItem={({ item }) => {
                    // Проверяем, что item существует и имеет необходимые поля
                    if (!item) {
                        // console.log('Invalid comment item:', item);
                        return null;
                    }
                    return (
                        <Comment comment={item} currentUser={currentUser} toggleLike={toggleLike} />
                    );
                }}
                style={styles.mediaScroll}
                contentContainerStyle={{ paddingBottom: 20, maxHeight: Dimensions.get('window').height * 0.9 }}
                ListEmptyComponent={<Text style={styles.emptyText}>No comments yet.</Text>}
                inverted={true}
            />
            {selectedImages.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>
                    {selectedImages.map((img, i) => (
                        <Image
                            key={i}
                            source={{ uri: img.uri }}
                            style={{ width: 80, height: 80, margin: 4, borderRadius: 8 }}
                        />
                    ))}
                </View>
            )}
            <View style={styles.inputContainer}>
                <Avatar activeOpacity={0.2} containerStyle={{ backgroundColor: "#20C0B0" }} icon={{ name: "upload" }} onPress={pickImage} rounded size="medium"/>
                <TextInput
                    value={newComment}
                    onChangeText={setNewComment}
                    style={[styles.textInput, {height: inputHeight}]}
                    placeholder="Ваш комментарий..."
                    placeholderTextColor="#888"
                    multiline={true}
                    onContentSizeChange={(e) =>
                        setInputHeight(Math.max(40, e.nativeEvent.contentSize.height))}
                />
                <Text>Анон?</Text>
                <Switch
                    value={isAnonymous}
                    onValueChange={setIsAnonymous}
                    style={{ marginHorizontal: 5 }}
                />
                {/*<Button title="Медиа" onPress={pickImage} />*/}
                {/*<Button title="Отправить" onPress={sendComment} />*/}
                <Avatar activeOpacity={0.2} containerStyle={{ backgroundColor: "#40E0D0" }} icon={{ name: "send" }} onPress={sendComment} rounded size="medium"/>
            </View>
        </Wrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        maxWidth: Dimensions.get('screen').width,
        maxHeight: Dimensions.get('screen').height,
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    mediaScroll: {
        flex: 1,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 10,
        marginBottom: 20,
        borderTopWidth: 1,
        borderColor: '#ccc',
        backgroundColor: '#f9f9f9',
        alignItems: 'center',
    },
    textInput: {
        flex: 1,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginRight: 10,
        fontSize: 15,
        backgroundColor: '#fff',
        color: '#000',
    },
    emptyText: {
        textAlign: 'center',
        padding: 20,
        color: '#888',
    },
});
