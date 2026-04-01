import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';

const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');

const ProfileScreen = () => {
  const { session } = useAuth();

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.card}>
          <Image source={avatarPlaceholder} style={styles.avatar} />
          <Text style={styles.name}>{session?.user?.displayName || 'Anonymous'}</Text>
          <Text style={styles.phone}>{session?.user?.phone || '+91 0000000000'}</Text>

          <View style={styles.infoRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color={theme.colors.magenta}
            />
            <Text style={styles.infoText}>Your identity is private and protected</Text>
          </View>

          <Text style={styles.note}>
            Profile details are synced securely with your live account.
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.glassStrong,
    padding: 22,
    alignItems: 'center',
    ...theme.shadow.card,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: theme.colors.magenta,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  phone: {
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontSize: 15,
  },
  infoRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 42, 163, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  infoText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  note: {
    marginTop: 18,
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});

export default ProfileScreen;
