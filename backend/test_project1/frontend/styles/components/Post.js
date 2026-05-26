// components/Post.js
import {Dimensions, StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
    container: {
        margin: 10, // Remove padding to mimic Instagram's edge-to-edge feel
        borderBottomWidth: 1,
        borderBottomColor: '#ddd', // Light separator like Instagram
        maxWidth: 660,
        borderRadius: 10,
        width: Dimensions.get('window').width * 0.97,

    },
    username: {
        fontWeight: 'bold',
        padding: 10,
    },
    header: {
        flexDirection: 'row',
        paddingBottom: 20,
    },
    image: {
        alignSelf: 'center',
        width: Dimensions.get('window').width, // Full width
        height: Dimensions.get('window').width, // Square aspect ratio (1:1)
        maxHeight: 660,
        maxWidth: 660,
    },
    interactionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 10,
    },
    likes: {
        fontSize: 16,
    },
    content: {
        paddingHorizontal: 10,
        paddingBottom: 5,
        fontSize: 32,
    },
    noImages: {
        padding: 10,
        opacity: 0.7,
    },
    noTags: {
        paddingHorizontal: 10,
        opacity: 0.7,
    },
    noComments: {
        paddingHorizontal: 10,
        opacity: 0.7,
    },
    commentSection: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: '#ddd',
    },
    commentInput: {
        flex: 1,
        borderWidth: 1,
        padding: 8,
        marginRight: 10,
        borderRadius: 20, // Rounded like Instagram
    },
});