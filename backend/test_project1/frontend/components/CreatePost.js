import {
    View,
    Text,
    TextInput,
    Button,
    Image,
    FlatList,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {useRef, useState} from 'react';
import Database from '../database';
import {styles} from '../styles/components/CreatePost';

export function CreatePost({navigation}) {
    const [content, setContent] = useState('');
    const [posts, setPosts] = useState([]);
    const { current, colors } =  {
        current: 'light',
        colors: { light: { text: '#FFF', background: '#000' } },
    };
    const theme = colors[current];
    const [media, setMedia] = useState([]);
    const [inputs, setInputs] = useState(['']); // Dynamic tags inputs
    const [error, setError] = useState(null);
    const [showReadMore, setShowReadMore] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const textInputRef = useRef(null);
    const [inputHeight, setInputHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    const scrollViewRef = useRef(null);
    const [isDisabled, setDisabled] = useState(false);
	const [iframe, setFrame] = useState("");
	const iframeInputRef = useRef(null);

    const handleInputChange = (index, value) => {
        const newInputs = [...inputs];
        newInputs[index] = value;
        setInputs(newInputs);
    };

    const addInput = () => {
        if (inputs.length < 4) {
            setInputs([...inputs, '']);
        }
    };

    const handleReadMore = () => {
        setIsExpanded(true);
        setShowReadMore(false);
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({animated: true});
        }, 100);
    };

    const handleReadLess = () => {
        setIsExpanded(false);
        setShowReadMore(contentHeight > inputHeight);
    };

    const pickMedia = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            // mediaTypes: ImagePicker.MediaTypeOptions.Images, // Restrict to images only
            allowsMultipleSelection: true,
            quality: 1, // Compress to 70% quality
            allowsEditing: true,
        });

        if (!result.canceled) {
            const newMedia = result.assets.map((asset) => ({
                uri: asset.uri,
                type: 'image',
                mimeType: asset.mimeType || 'image/jpeg',
            }));
            setMedia([...media, ...newMedia]);
        }
    };

	const submitPost = async (isAnonymous = false) => {
		setDisabled(true);

		if (!content.trim() && media.length === 0 && !iframe.trim()) {
			setError('Content, media, or iframe is required');
			setDisabled(false);
			return;
		}

		try {
			const tagArray = inputs
				.filter((tag) => tag.trim())
				.map((tag) => tag.trim());

			const mediaWithBase64 = await Promise.all(
				media.map(async (item, index) => {
					const response = await fetch(item.uri);
					const blob = await response.blob();
					const base64 = await new Promise((resolve) => {
						const reader = new FileReader();
						reader.onloadend = () => resolve(reader.result.split(',')[1]);
						reader.readAsDataURL(blob);
					});

					const extension = item.mimeType?.split('/')[1] || 'jpg';
					const fileName = `image-${Date.now()}-${index}.${extension}`;

					return {
						name: fileName,
						type: item.mimeType || 'image/jpeg',
						base64,
					};
				})
			);

			const payload = {
				content: content.trim(),
				tags: tagArray.join(','),
				isAnonymous,
				images: mediaWithBase64,
				iframe: iframe.trim(), // <-- Add iframe field explicitly here
			};

			const newPost = await Database.addPost(payload);

			setPosts([newPost, ...posts]);
			setContent('');
			setMedia([]);
			setInputs(['']);
			setError(null);
			setFrame('');
			navigation.navigate('Main');
			setDisabled(false);

			return newPost;
		} catch (err) {
			const errorMessage = err.message || 'Failed to submit post';
			setError(errorMessage);
			console.error('Error submitting post:', err);
			setDisabled(false);
		}
	};

    return (
        <KeyboardAvoidingView
            behavior="padding"
            style={{flex: 1}}
            keyboardVerticalOffset={20}
        >
            <ScrollView
                ref={scrollViewRef}
                style={{flex: 1, backgroundColor: 'black'}}
                contentContainerStyle={{
                    flexGrow: 1,
                    padding: 10,
                    paddingBottom: 100,
                }}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={true}
            >
                <View>
                    <TextInput
                        ref={textInputRef}
                        style={[
                            {
                                borderColor: theme.border,
                                color: theme.text,
                                height: isExpanded ? contentHeight : 80,
                                minHeight: 80,
                                borderRadius: 20,
                            },
                            styles.input,
                        ]}
                        placeholder="What's on your mind?"
                        value={content}
                        onChangeText={(newText) => {
                            if (newText.length <= 10000) {
                                setContent(newText);
                            }
                        }}
                        onContentSizeChange={(e) => {
                            const newContentHeight = e.nativeEvent.contentSize.height;
                            setContentHeight(newContentHeight);
                            if (!isExpanded) {
                                setShowReadMore(newContentHeight > inputHeight);
                            }
                        }}
                        onLayout={(e) => {
                            if (!isExpanded) {
                                setInputHeight(e.nativeEvent.layout.height);
                            }
                        }}
                        placeholderTextColor={theme.text === '#000' ? '#666' : '#ccc'}
                        numberOfLines={3}
                        multiline={true}
                        scrollEnabled={true}
                    />
                    {showReadMore && !isExpanded && (
                        <TouchableOpacity
                            onPress={handleReadMore}
                            style={{
                                marginTop: 5,
                                padding: 5,
                                alignSelf: 'flex-start',
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.text === '#000' ? '#0066cc' : '#4da8ff',
                                    fontSize: 14,
                                    fontWeight: '500',
                                }}
                            >
                                Read More
                            </Text>
                        </TouchableOpacity>
                    )}
                    {isExpanded && (
                        <TouchableOpacity
                            onPress={handleReadLess}
                            style={{
                                marginTop: 5,
                                padding: 5,
                                alignSelf: 'flex-start',
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.text === '#000' ? '#0066cc' : '#4da8ff',
                                    fontSize: 14,
                                    fontWeight: '500',
                                }}
                            >
                                Read Less
                            </Text>
                        </TouchableOpacity>
                    )}
                    {inputs.map((input, index) => (
                        <View
                            key={index}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginBottom: 10,
                            }}
                        >
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        borderColor: theme.border,
                                        color: theme.text,
                                        flex: 1,
                                    },
                                ]}
                                placeholder={`Tag ${index + 1}`}
                                value={input}
                                onChangeText={(value) => handleInputChange(index, value)}
                                placeholderTextColor={theme.text === '#000' ? '#666' : '#ccc'}
                            />
                            {index === inputs.length - 1 && inputs.length < 4 && (
                                <TouchableOpacity
                                    onPress={addInput}
                                    style={{
                                        marginLeft: 10,
                                        backgroundColor: '#4CAF50',
                                        padding: 10,
                                        borderRadius: 5,
                                    }}
                                >
                                    <Text style={{color: 'white', fontSize: 16}}>+</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                    {media.length > 0 && (
                        <FlatList
                            data={media}
                            renderItem={({item}) => (
                                <Image source={{uri: item.uri}} style={styles.previewImage}/>
                            )}
                            keyExtractor={(item, index) => index.toString()}
                            horizontal
                            pagingEnabled
                        />
                    )}
                    <TextInput
                        ref={iframeInputRef}
                        style={[
                            styles.input,
                            {
                                borderColor: theme.border,
                                color: theme.text,
                                flex: 1,
                            },
                        ]}
                        placeholder="iframe?"
                        value={iframe}
                        onChangeText={(newText) => {
                            if (newText.length <= 10000) {
                                setFrame(newText);
                            }
                        }}/>
                    <Button title="Pick Media" onPress={pickMedia}/>
                    <Button title="Post" disabled={isDisabled} onPress={() => submitPost(false)}/>
                    <Button title="Anon Post" disabled={isDisabled} onPress={() => submitPost(true)}/>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
