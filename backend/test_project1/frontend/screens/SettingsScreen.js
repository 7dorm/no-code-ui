// screens/SettingsScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Switch,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen({ navigation }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [dataSync, setDataSync] = useState(true);

  const handleThemeChange = () => {
    setDarkMode(!darkMode);
    Alert.alert('Theme Changed', `Switched to ${!darkMode ? 'Light' : 'Dark'} theme`);
  };

  const handleNotificationSettings = () => {
    navigation.navigate('NotificationSettings');
  };

  const handleProfileSettings = () => {
    navigation.navigate('ProfileSettings');
  };

  const handlePrivacySettings = () => {
    Alert.alert('Privacy Settings', 'Privacy settings coming soon!');
  };

  const handleDataExport = () => {
    Alert.alert('Data Export', 'Data export feature coming soon!');
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear the app cache?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => Alert.alert('Success', 'Cache cleared successfully!')
        },
      ]
    );
  };

  const renderSettingItem = (icon, title, subtitle, onPress, rightElement = null, color = '#007AFF') => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.settingRight}>
        {rightElement || <Ionicons name="chevron-forward" size={20} color="#666" />}
      </View>
    </TouchableOpacity>
  );

  const renderSwitchItem = (icon, title, subtitle, value, onValueChange, color = '#007AFF') => (
    <View style={styles.settingItem}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.settingRight}>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#333', true: color }}
          thumbColor={value ? '#fff' : '#f4f3f4'}
        />
      </View>
    </View>
  );

  const renderSectionHeader = (title, icon, color = '#007AFF') => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {renderSectionHeader('Preferences', 'settings-outline', '#007AFF')}

        {renderSwitchItem(
          'notifications-outline',
          'Push Notifications',
          'Receive notifications about new activity',
          notificationsEnabled,
          setNotificationsEnabled,
          '#FF6B35'
        )}

        {renderSwitchItem(
          'moon-outline',
          'Dark Mode',
          'Use dark theme for better visibility',
          darkMode,
          handleThemeChange,
          '#6C5CE7'
        )}

        {renderSwitchItem(
          'save-outline',
          'Auto Save',
          'Automatically save your work',
          autoSave,
          setAutoSave,
          '#00B894'
        )}

        {renderSwitchItem(
          'sync-outline',
          'Data Sync',
          'Sync data across devices',
          dataSync,
          setDataSync,
          '#FDCB6E'
        )}

        {renderSectionHeader('Account', 'person-outline', '#4ECDC4')}

        {renderSettingItem(
          'person-circle-outline',
          'Profile Settings',
          'Edit your profile information',
          handleProfileSettings,
          null,
          '#45B7D1'
        )}

        {renderSettingItem(
          'notifications-outline',
          'Notification Settings',
          'Customize notification preferences',
          handleNotificationSettings,
          null,
          '#FF6B6B'
        )}

        {renderSettingItem(
          'shield-checkmark-outline',
          'Privacy & Security',
          'Manage your privacy settings',
          handlePrivacySettings,
          null,
          '#96CEB4'
        )}

        {renderSectionHeader('Data & Storage', 'folder-outline', '#FFA07A')}

        {renderSettingItem(
          'download-outline',
          'Export Data',
          'Download your data',
          handleDataExport,
          null,
          '#74B9FF'
        )}

        {renderSettingItem(
          'trash-outline',
          'Clear Cache',
          'Free up storage space',
          handleClearCache,
          null,
          '#E17055'
        )}

        {renderSectionHeader('Support', 'help-circle-outline', '#A29BFE')}

        {renderSettingItem(
          'document-text-outline',
          'Terms of Service',
          'Read our terms and conditions',
          () => Alert.alert('Terms', 'Terms of service coming soon!'),
          null,
          '#FD79A8'
        )}

        {renderSettingItem(
          'information-circle-outline',
          'About',
          'App version and information',
          () => Alert.alert('About', 'SigmaLTD v1.0.0\nBuilt with ❤️'),
          null,
          '#00CEC9'
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#111',
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    backgroundColor: '#111',
    marginTop: 20,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  settingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#999',
    lineHeight: 18,
  },
  settingRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSpacer: {
    height: 40,
  },
});
