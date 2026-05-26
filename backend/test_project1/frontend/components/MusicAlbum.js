import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    Image,
    StyleSheet,
} from 'react-native';
// import Audio from 'react-native-audio';
import { Avatar } from 'react-native-elements';
import { Ionicons } from '@expo/vector-icons';
import Database, { BASE_URL } from '../database';
import Modal from 'react-native-modal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MusicAlbum = ({ navigation, album, refresher }) => {
    const theme =  {
        current: 'light',
        colors: { light: { text: '#000', background: '#FFF' } },
    };
    const [liked, setLiked] = useState(album.likedByCurrentUser || false);
    const [artist, setArtist] = useState({ displayedName: 'Loading...', pic: null });
    const [myAlbum, setMyAlbum] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [open, setOpen] = useState(false);
    const [commentsCount, setCommentsCount] = useState(0);
    const flatListRef = useRef(null);

    useEffect(() => {
        let mounted = true;

        const fetchAlbumData = async () => {
            try {
                setIsLoading(true);
                const [artistData, me] = await Promise.all([
                    Database.getArtist(album.artistId),
                    Database.getCurrentUser(),
                ]);

                const likeStatus = await Database.getLikeAlbum(album.idAlbum);
                setLiked(likeStatus);
                if (mounted) {
                    setArtist(artistData || { displayedName: 'Unknown', pic: null });
                    setMyAlbum(me?.idUser === album.createdByIdUser);
                }
                const t = await Database.getAlbumCommentsCount(album.idAlbum);
                setCommentsCount(t.count);
            } catch (error) {
                console.error('Error fetching album data:', error);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        fetchAlbumData();
        return () => {
            mounted = false;
        };
    }, [album.artistId, album.idAlbum]);

    useEffect(() => {
        const interval = setInterval(async () => {
            await updateCommentsCount();
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const updateCommentsCount = async () => {
        const t = await Database.getAlbumCommentsCount(album.idAlbum);
        setCommentsCount(t.count);
    };

    const handleLike = async () => {
        try {
            if (liked) {
                await Database.unlikeAlbum(album.idAlbum);
                setLiked(false);
                album.likes--;
            } else {
                await Database.likeAlbum(album.idAlbum);
                setLiked(true);
                album.likes++;
            }
        } catch (err) {
            console.error('Error handling like:', err);
        }
    };

    const deleteAlbum = async () => {
        if (!myAlbum) {
            alert('You are not the creator');
            return;
        }

        try {
            const resp = await Database.deleteAlbum(album.idAlbum);
            if (resp.success) {
                refresher();
            }
        } catch (error) {
            console.error('Error deleting album:', error);
            alert('Failed to delete album');
        }
    };

    if (isLoading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    const renderTrack = ({ item, index }) => {
        return (
            <TouchableOpacity
                style={styles.trackItem}
                onPress={() => setCurrentTrackIndex(index)}
            >
                <Text style={styles.trackNumber}>{index + 1}</Text>
                <Text style={styles.trackTitle}>{item.title}</Text>
                <Text style={styles.trackDuration}>{item.duration}</Text>
            </TouchableOpacity>
        );
    };

    const tracks = Array.isArray(album.tracks) ? album.tracks : [];

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Modal isVisible={open}>
                <Image
                    style={{ width: '100%', height: '100%', resizeMode: 'center' }}
                    source={artist.pic ? { uri: artist.pic } : require('../assets/default-avatar.png')}
                />
            </Modal>
            {/* Header */}
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Avatar
                        source={artist.pic ? { uri: artist.pic } : require('../assets/default-avatar.png')}
                        rounded
                        size="medium"
                        containerStyle={styles.avatar}
                        onLongPress={() => setOpen(true)}
                        onPressOut={() => setOpen(false)}
                    />
                    <TouchableOpacity
                        style={styles.userInfo}
                        onPress={() => navigation.navigate('ArtistProfile', { artistId: album.artistId })}
                    >
                        <View>
                            <Text style={styles.username}>{artist.displayedName}</Text>
                            <Text style={styles.timestamp}>
                                {new Date(album.releaseDate).toLocaleDateString()}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>
                {myAlbum && (
                    <TouchableOpacity onPress={deleteAlbum}>
                        <Ionicons name="trash-outline" size={24} color="#ff4444" />
                    </TouchableOpacity>
                )}
            </View>
            {/* Album Cover */}
            {album.cover && (
                <View style={styles.coverContainer}>
                    <Image
                        source={{ uri: `${BASE_URL}${album.cover}` }}
                        style={styles.cover}
                        resizeMode="cover"
                        onError={(e) => console.error('Album cover error:', e)}
                    />
                </View>
            )}
            {/* Album Info */}
            <View style={styles.contentContainer}>
                <Text style={styles.albumTitle}>{album.title}</Text>
                {album.description && (
                    <Text style={styles.albumDescription}>{album.description}</Text>
                )}
            </View>
            {/* Track List */}
            {tracks.length > 0 && (
                <View style={styles.tracksContainer}>
                    <Text style={styles.tracksHeader}>Tracks</Text>
                    <FlatList
                        ref={flatListRef}
                        data={tracks}
                        renderItem={renderTrack}
                        keyExtractor={(item, index) => `${item.id}-${index}`}
                        showsVerticalScrollIndicator={false}
                        style={styles.tracksList}
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
                    <Text style={styles.actionText}>{album.likes}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() =>
                        navigation.navigate('AlbumDetail', { albumId: album.idAlbum, navigation })
                    }
                    style={styles.actionButton}
                >
                    <Ionicons name="chatbubble-outline" size={28} color="#666" />
                    <Text style={styles.actionText}>{commentsCount}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        maxWidth: 660,
        width: Dimensions.get('window').width * 0.9,
        marginVertical: 8,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
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
    coverContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: 12,
    },
    cover: {
        width: SCREEN_WIDTH * 0.9,
        height: SCREEN_WIDTH * 0.9,
        maxWidth: 400,
        maxHeight: 400,
        borderRadius: 8,
    },
    contentContainer: {
        padding: 12,
    },
    albumTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    albumDescription: {
        color: '#fff',
        fontSize: 14,
        lineHeight: 20,
    },
    tracksContainer: {
        padding: 12,
    },
    tracksHeader: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    tracksList: {
        maxHeight: 200,
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    trackNumber: {
        color: '#fff',
        fontSize: 14,
        width: 30,
    },
    trackTitle: {
        color: '#fff',
        fontSize: 14,
        flex: 1,
    },
    trackDuration: {
        color: '#aaa',
        fontSize: 14,
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
});

export default MusicAlbum;
