import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {styles} from '../styles/screens/FeedScreen';
import Database from '../database';
import SuperScrollList from "../components/SuperScrollList";

export default class FollowingScreen extends React.Component {
    navigation = null;

    constructor(props) {
        super(props);
        this.navigation = props.navigation;
        this.flatListRef = React.createRef();
        this.superScrollListRef = React.createRef();
    }

    componentDidMount() {
        this.unsubscribe = this.navigation.addListener('focus', () => {
            this.refreshPosts();
        });
    }

    componentWillUnmount() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    refreshPosts = () => {
        if (this.superScrollListRef.current) {
            this.superScrollListRef.current.refresh();
        }
    };

    onPress = () => {
        // console.log('Press');

    }

    render() {
        return (
            <View style={[styles.container, {backgroundColor: "#000"}]}>
                <TouchableOpacity
                    style={{
                        backgroundColor: '#000',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 10,
                        borderRadius: 50,
                        width: 250,
                        height: 60,
                    }}
                    onPress={this.onPress}
                >
                    <Text style={{fontSize: 20, color: '#FFF'}}>View posts by tag</Text>
                </TouchableOpacity>
                <SuperScrollList
                    ref={this.superScrollListRef}
                    navigation={this.navigation}
                    loader={Database.getFollowingPosts}
                />
            </View>
        );
    }
}
