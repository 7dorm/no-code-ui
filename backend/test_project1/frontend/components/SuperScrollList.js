import React from 'react';
import {View, Text, FlatList, RefreshControl, SafeAreaView, Dimensions, TouchableOpacity} from 'react-native';
import {styles} from '../styles/screens/FeedScreen';
import {FloatingButton} from './FloatingButton';
import Post from './Post';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default class SuperScrollList extends React.Component {
    navigation = null;
    loader = null;
    constructor(props) {
        super(props);
        this.renderHeader = props.renderHeader || <></>;
        this.navigation = props.navigation;
        this.loader = props.loader;
        this.state = {
            data: [],
            page: 1,
            isLoading: false,
            refreshing: false,
            hasMore: true,
            screenWidth: Dimensions.get('window').width,
            newPostsAvailable: false,
        };
        this.flatListRef = React.createRef();
    }

    componentDidMount() {
        (this.loader && this.fetchData().then(() =>  console.log("Fetched data!")));

        // Добавляем слушатель изменения размера экрана
        this.dimensionsSubscription = Dimensions.addEventListener('change', this.handleDimensionsChange);

        // Check for new posts every 30 seconds
        this.newPostsChecker = setInterval(this.checkForNewPosts, 30000);
    }

    componentWillUnmount() {
        // Удаляем слушатель при размонтировании компонента
        if (this.dimensionsSubscription) {
            this.dimensionsSubscription.remove();
        }

        // Clear the interval when component unmounts
        if (this.newPostsChecker) {
            clearInterval(this.newPostsChecker);
        }
    }

    handleDimensionsChange = ({ window }) => {
        this.setState({ screenWidth: window.width });
    };

    fetchData = async () => {
        if (this.state.isLoading || !this.state.hasMore) return;

        // console.log('SuperScrollList: Fetching data for page:', this.state.page);
        this.setState({isLoading: true});
        try {
            const res = await this.loader(this.state.page);
            // console.log('SuperScrollList: Received response:', res);
            const newPosts = res.posts || [];
            // console.log('SuperScrollList: Extracted posts:', newPosts.length);

            this.setState(prevState => ({
                data: prevState.page === 1 ? newPosts : [...prevState.data, ...newPosts],
                isLoading: false,
                hasMore: newPosts.length > 0
            }));

            // console.log('SuperScrollList: Updated state, total posts:', this.state.data.length);
        } catch (error) {
            console.error('Error fetching posts:', error);

            // Проверяем, является ли ошибка связанной с авторизацией
            if (error.message && error.message.includes('401')) {
                this.navigation.replace('Login');
                await AsyncStorage.removeItem('token');
            }

            this.setState({isLoading: false});
        }
    };

    handleLoadMore = () => {
        if (!this.state.isLoading && this.state.hasMore) {
            this.setState(
                prevState => ({page: prevState.page + 1}),
                () => this.fetchData()
            );
        }
    };

    // Add this to debug scroll position
    handleScroll = (event) => {
        const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
        const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    };

    renderRow = ({item}) => {
        // console.log('SuperScrollList: Rendering post:', item.idPost, item.content?.substring(0, 50));
        return (
            <View style={{
                minHeight: 50,
                width: '100%',
                alignItems: 'center',
                paddingHorizontal: 5,
            }}>
                <Post
                    post={item}
                    navigation={this.navigation}
                    refresher={this.refresh}
                />
            </View>
        );
    };

    // Check if there are new posts on the server
    checkForNewPosts = async () => {
        if (this.state.isLoading || this.state.refreshing) return;

        try {
            const res = await this.loader(1);
            const newPosts = res.posts || [];

            // If we're at the top of the list and there are new posts
            if (newPosts.length > 0 && this.state.data.length > 0) {
                const latestPostId = this.state.data[0].idPost;
                const hasNewPosts = newPosts.some(post => post.idPost > latestPostId);

                if (hasNewPosts) {
                    this.setState({ newPostsAvailable: true });
                }
            }
        } catch (error) {
            console.error('Error checking for new posts:', error);
        }
    };

    // Handle new posts button press
    handleNewPostsButtonPress = () => {
        this.setState({ newPostsAvailable: false });
        this.flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        this.refresh();

    };

    // Метод для обновления извне
    refresh = () => {
        this.setState({
            data: [],
            page: 1,
            hasMore: true,
            refreshing: true,
            newPostsAvailable: false
        }, () => {
            this.fetchData().then(() => {
                this.setState({ refreshing: false });
            });
        });
    };

    renderNewPostsButton = () => {
        if (!this.state.newPostsAvailable) return null;

        return (
            <View style={{
                position: 'absolute',
                top: 10,
                alignSelf: 'center',
                zIndex: 10,
                backgroundColor: '#4CAF50',
                borderRadius: 20,
                padding: 10,
                elevation: 5,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 3,
            }}>
                <TouchableOpacity onPress={this.handleNewPostsButtonPress}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                        New posts available! Tap to refresh
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    renderList = () => {
        return (
            <>
                {this.renderNewPostsButton()}
                <FlatList
                    ref={this.flatListRef}
                    data={this.state.data}
                    renderItem={this.renderRow}
                    keyExtractor={(item, index) => item.idPost ? item.idPost.toString() : index.toString()}
                    onEndReached={this.handleLoadMore}
                    onEndReachedThreshold={0.5}
                    style={{backgroundColor: "#000", flex: 1}}
                    contentContainerStyle={{
                        paddingHorizontal: 10,
                        paddingBottom: 100, // Добавляем отступ снизу для лучшей прокрутки
                        alignItems: 'center', // Центрируем контент
                        flexGrow: 1,
                    }}
                    onScroll={this.handleScroll}
                    ListHeaderComponent={this.renderHeader}
                    ListFooterComponent={this.renderFooter}
                    showsVerticalScrollIndicator={true}
                    extraData={this.state.page}
                    refreshControl={
                        <RefreshControl
                            refreshing={this.state.refreshing}
                            onRefresh={this.refresh}
                            colors={['#fff']}
                            tintColor="#fff"
                        />
                    }
                />
            </>
        );
    };

    renderFooter = () => {
        if (!this.state.isLoading) return null;
        return (
            <View style={{
                padding: 20,
                alignItems: 'center',
                width: '100%',
            }}>
                <Text style={{color: '#fff'}}>Loading more posts...</Text>
            </View>
        );
    };

    renderEmpty = () => {
        if (this.state.isLoading) return null;
        return (
            <View style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 20,
            }}>
                <Text style={{color: '#fff', fontSize: 16}}>No posts available</Text>
            </View>
        );
    };

    render() {
        return (
            <View style={{ flex: 1, backgroundColor: "#000" }}>
                {this.state.data.length === 0 ? this.renderEmpty() : this.renderList()}
            </View>
        );
    }
}
