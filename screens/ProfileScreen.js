import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { isUnauthorizedApiError } from '../services/apiClient';
import { getMyProfile, updateMyProfile } from '../services/profileApi';

const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');

const logProfileDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ProfileScreen] ${label}`, payload);
};

const ProfileScreen = ({ navigation, route }) => {
  const { session, setSession } = useAuth();
  const profileMode = String(route?.params?.profileMode || 'self').trim().toLowerCase();
  const externalProfile = route?.params?.profileData || null;
  const showExternalProfile = profileMode === 'counterparty' && Boolean(externalProfile);
  const [selfProfile, setSelfProfile] = useState(session?.user || null);
  const [avatarInput, setAvatarInput] = useState('');
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  const isHostSelfProfile =
    !showExternalProfile && String(session?.user?.role || '').trim().toUpperCase() === 'LISTENER';

  useEffect(() => {
    if (!showExternalProfile) {
      setSelfProfile(session?.user || null);
    }
  }, [session?.user, showExternalProfile]);

  useEffect(() => {
    let cancelled = false;

    if (showExternalProfile || !session?.accessToken) {
      return () => {
        cancelled = true;
      };
    }

    getMyProfile()
      .then(async (liveProfile) => {
        if (cancelled || !liveProfile) {
          return;
        }

        setSelfProfile(liveProfile);

        const isCurrentSessionUser =
          String(liveProfile?.id || '') === String(session?.user?.id || '');
        const shouldSyncSessionUser =
          isCurrentSessionUser &&
          (String(liveProfile?.profileImageUrl || '') !==
            String(session?.user?.profileImageUrl || '') ||
            String(liveProfile?.displayName || '') !== String(session?.user?.displayName || '') ||
            String(liveProfile?.phone || '') !== String(session?.user?.phone || ''));

        if (!shouldSyncSessionUser) {
          return;
        }

        await setSession({
          ...session,
          user: {
            ...(session?.user || {}),
            ...liveProfile,
          },
        });
      })
      .catch((error) => {
        logProfileDebug('profileFetchFailed', {
          message: error?.response?.data?.message || error?.message || 'Unknown error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    session?.accessToken,
    session?.user?.displayName,
    session?.user?.id,
    session?.user?.phone,
    session?.user?.profileImageUrl,
    setSession,
    showExternalProfile,
  ]);

  const displayName = showExternalProfile
    ? externalProfile?.name || 'Profile'
    : selfProfile?.displayName || session?.user?.displayName || 'Anonymous';
  const selfAvatarUrl = String(selfProfile?.profileImageUrl || session?.user?.profileImageUrl || '')
    .trim();
  const avatarSource =
    showExternalProfile &&
    typeof externalProfile?.avatar === 'string' &&
    externalProfile.avatar.trim()
      ? { uri: externalProfile.avatar.trim() }
      : selfAvatarUrl
        ? { uri: selfAvatarUrl }
      : avatarPlaceholder;
  const phoneLabel = showExternalProfile
    ? externalProfile?.phone || 'Private profile'
    : selfProfile?.phone || session?.user?.phone || '+91 0000000000';
  const roleLabel = showExternalProfile
    ? String(externalProfile?.role || '').trim().toUpperCase() || null
    : String(selfProfile?.role || session?.user?.role || '').trim().toUpperCase() || null;

  const onOpenAvatarEditor = useCallback(() => {
    setAvatarInput(selfAvatarUrl || '');
    setIsEditorVisible(true);
    logProfileDebug('avatarEditorOpened', {
      hasExistingAvatar: Boolean(selfAvatarUrl),
      role: roleLabel,
    });
  }, [roleLabel, selfAvatarUrl]);

  const onCloseAvatarEditor = useCallback(() => {
    if (isSavingAvatar) {
      return;
    }
    setIsEditorVisible(false);
  }, [isSavingAvatar]);

  const onSaveAvatar = useCallback(async () => {
    const nextAvatarUrl = String(avatarInput || '').trim();
    if (!nextAvatarUrl) {
      Alert.alert('Avatar required', 'Please enter a valid image URL.');
      return;
    }

    try {
      // Validate URL input before API call.
      // eslint-disable-next-line no-new
      new URL(nextAvatarUrl);
    } catch (_error) {
      Alert.alert('Invalid URL', 'Please enter a valid image URL.');
      return;
    }

    setIsSavingAvatar(true);
    logProfileDebug('profileUpdateStart', {
      role: roleLabel,
      hasAvatarUrl: Boolean(nextAvatarUrl),
    });

    try {
      const updatedProfile = await updateMyProfile({
        profileImageUrl: nextAvatarUrl,
      });

      setSelfProfile(updatedProfile || selfProfile);
      await setSession({
        ...session,
        user: {
          ...(session?.user || {}),
          ...(updatedProfile || {}),
          profileImageUrl: updatedProfile?.profileImageUrl || nextAvatarUrl,
        },
      });

      setIsEditorVisible(false);
      Alert.alert('Profile updated', 'Your profile picture has been updated.');
      logProfileDebug('profileUpdateSuccess', {
        role: roleLabel,
      });
    } catch (error) {
      logProfileDebug('profileUpdateFailure', {
        role: roleLabel,
        message: error?.response?.data?.message || error?.message || 'Unknown error',
      });
      if (!isUnauthorizedApiError(error)) {
        Alert.alert(
          'Profile update failed',
          error?.response?.data?.message || error?.message || 'Unable to update profile picture.',
        );
      }
    } finally {
      setIsSavingAvatar(false);
    }
  }, [avatarInput, roleLabel, selfProfile, session, setSession]);

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {navigation?.canGoBack?.() ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.card}>
          <Image source={avatarSource} style={styles.avatar} />
          {isHostSelfProfile ? (
            <TouchableOpacity
              style={styles.changeAvatarBtn}
              onPress={onOpenAvatarEditor}
              activeOpacity={0.85}
            >
              <Ionicons name="camera-outline" size={14} color={theme.colors.textPrimary} />
              <Text style={styles.changeAvatarBtnText}>Change Photo</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.phone}>{phoneLabel}</Text>
          {roleLabel ? <Text style={styles.role}>{roleLabel}</Text> : null}

          <View style={styles.infoRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color={theme.colors.magenta}
            />
            <Text style={styles.infoText}>
              {showExternalProfile
                ? 'Profile shared from active conversation'
                : 'Your identity is private and protected'}
            </Text>
          </View>

          <Text style={styles.note}>
            {showExternalProfile
              ? 'Open a chat or call to view the latest realtime profile activity.'
              : isHostSelfProfile
                ? 'Host profile picture and details are synced securely with your live account.'
                : 'Profile details are synced securely with your live account.'}
          </Text>
        </View>

        <Modal
          visible={isEditorVisible}
          transparent
          animationType="fade"
          onRequestClose={onCloseAvatarEditor}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Update Profile Picture</Text>
              <Text style={styles.modalSubtitle}>Paste an image URL for your host avatar.</Text>
              <TextInput
                value={avatarInput}
                onChangeText={setAvatarInput}
                placeholder="https://example.com/avatar.jpg"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.modalInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSavingAvatar}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnSecondary}
                  onPress={onCloseAvatarEditor}
                  activeOpacity={0.85}
                  disabled={isSavingAvatar}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtnPrimary,
                    isSavingAvatar ? styles.modalBtnPrimaryDisabled : null,
                  ]}
                  onPress={onSaveAvatar}
                  activeOpacity={0.85}
                  disabled={isSavingAvatar}
                >
                  <Text style={styles.modalBtnPrimaryText}>
                    {isSavingAvatar ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  backBtn: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
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
  changeAvatarBtn: {
    marginTop: 10,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255, 42, 163, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeAvatarBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
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
  role: {
    marginTop: 6,
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: '#130A1C',
    padding: 16,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  modalSubtitle: {
    marginTop: 6,
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  modalInput: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  modalActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtnSecondary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalBtnSecondaryText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  modalBtnPrimary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalBtnPrimaryDisabled: {
    opacity: 0.6,
  },
  modalBtnPrimaryText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});

export default ProfileScreen;
