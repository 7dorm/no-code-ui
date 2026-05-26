// screens/ProfileSettingsScreen.js

import { StyleSheet, Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        width: '100%',
        // alignItems: 'center', // Центрируем содержимое
    },
    mediaScroll: {
        flex: 1,
        width: '100%', // ✅ ensures FlatList fills horizontally
    },
    postsSection: {
        flex: 1,
        // ❌ remove minHeight & zIndex if not needed
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontSize: 16,
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#1a1a1a',
    },
    profileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
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
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    userId: {
        fontSize: 14,
        color: '#888',
        marginBottom: 5,
    },
    ownProfile: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    settingsButton: {
        backgroundColor: '#4CAF50',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 8,
    },
    settingsButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        padding: 15,
        textAlign: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 15,
        backgroundColor: '#1a1a1a',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statNumber: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    statLabel: {
        fontSize: 12,
    }
});
