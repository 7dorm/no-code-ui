import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator} from 'react-native';
import Modal from 'react-native-modal';
import {Avatar} from "@rneui/base";
import Database from '../database';

const { width: screenWidth } = Dimensions.get('window');

export default function UserProfileModal({ isVisible, onClose, user, navigation }) {
    const [stats, setStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);

    useEffect(() => {
        if (isVisible && user) {
            fetchUserStats();
        }
    }, [isVisible, user]);

    const fetchUserStats = async () => {
        if (!user?.idUser) return;
        
        try {
            setLoadingStats(true);
            const response = await fetch(`${Database.API_URL}/user/${user.idUser}/stats`, {
                headers: await Database.authHeaders(),
            });
            
            if (response.ok) {
                const statsData = await response.json();
                setStats(statsData);
            }
        } catch (error) {
            console.error('Error fetching user stats:', error);
        } finally {
            setLoadingStats(false);
        }
    };

    if (!user) return null;

    const handleVisitProfile = () => {
        onClose();
        navigation.navigate('Profile', { userId: user.idUser });
    };

    return (
        <Modal
            isVisible={isVisible}
            onBackdropPress={onClose}
            onBackButtonPress={onClose}
            style={styles.modal}
            animationIn="fadeIn"
            animationOut="fadeOut"
        >
            <View style={styles.modalContent}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>User Profile</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                </View>

                {/* User Info */}
                <View style={styles.userInfo}>
                    <Avatar
                        source={user.pic ? {uri: user.pic} : require('../assets/default-avatar.png')}
                        rounded
                        size="large"
                        containerStyle={styles.avatar}
                    />
                    <View style={styles.userDetails}>
                        <Text style={styles.username}>
                            {user.displayedName || 'Unknown User'}
                        </Text>
                        <Text style={styles.userId}>
                            ID: {user.idUser}
                        </Text>
                        <Text style={styles.userEmail}>
                            {user.nsu?.email || 'No email available'}
                        </Text>
                        {user.nsu?.group && (
                            <Text style={styles.userGroup}>
                                Group: {user.nsu.group}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Stats */}
                <View style={styles.stats}>
                    {loadingStats ? (
                        <ActivityIndicator size="small" color="#4CAF50" />
                    ) : (
                        <>
                            <View style={styles.statItem}>
                                <Text style={styles.statNumber}>
                                    {stats?.postsCount || 0}
                                </Text>
                                <Text style={styles.statLabel}>Posts</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statNumber}>
                                    {stats?.commentsCount || 0}
                                </Text>
                                <Text style={styles.statLabel}>Comments</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statNumber}>
                                    {stats?.followersCount || 0}
                                </Text>
                                <Text style={styles.statLabel}>Tag Followers</Text>
                            </View>
                        </>
                    )}
                </View>

                {/* Visit Profile Button */}
                <TouchableOpacity 
                    style={styles.visitButton}
                    onPress={handleVisitProfile}
                >
                    <Text style={styles.visitButtonText}>Visit Profile</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modal: {
        justifyContent: 'center',
        alignItems: 'center',
        margin: 20,
    },
    modalContent: {
        backgroundColor: '#1a1a1a',
        borderRadius: 15,
        padding: 20,
        width: Math.min(screenWidth * 0.9, 400),
        maxWidth: 400,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    closeButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    avatar: {
        marginRight: 15,
        borderWidth: 3,
        borderColor: '#4CAF50',
    },
    userDetails: {
        flex: 1,
    },
    username: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 5,
    },
    userId: {
        fontSize: 14,
        color: '#888',
        marginBottom: 3,
    },
    userEmail: {
        fontSize: 14,
        color: '#888',
        marginBottom: 3,
    },
    userGroup: {
        fontSize: 14,
        color: '#888',
    },
    stats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
        paddingVertical: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#4CAF50',
        marginBottom: 5,
    },
    statLabel: {
        fontSize: 12,
        color: '#888',
    },
    visitButton: {
        backgroundColor: '#4CAF50',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    visitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
}); 