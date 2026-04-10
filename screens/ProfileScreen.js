import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { resolveAvatarSource } from '../services/avatarResolver';
import { isUnauthorizedApiError } from '../services/apiClient';
import { getMyProfile, updateMyProfile, uploadMyProfileAvatar } from '../services/profileApi';
import { queryKeys } from '../services/queryClient';

const logProfileDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ProfileScreen] ${label}`, payload);
};

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const normalizeImageMimeType = (asset = {}) =>
  String(asset?.mimeType || asset?.type || '')
    .trim()
    .toLowerCase();

const isAllowedProfileImage = (asset = {}) => {
  const mimeType = normalizeImageMimeType(asset);
  if (!mimeType) {
    return true;
  }

  return ALLOWED_PROFILE_IMAGE_MIME_TYPES.has(mimeType);
};

const ProfileScreen = ({ navigation, route }) => {
  const { session, setSession } = useAuth();
  const queryClient = useQueryClient();
  const profileMode = String(route?.params?.profileMode || 'self').trim().toLowerCase();
  const externalProfile = route?.params?.profileData || null;
  const showExternalProfile = profileMode === 'counterparty' && Boolean(externalProfile);
  const [selfProfile, setSelfProfile] = useState(session?.user || null);
  const [avatarInput, setAvatarInput] = useState('');
  const [selectedImageAsset, setSelectedImageAsset] = useState(null);
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
  const selfAvatarUrl = String(
    selfProfile?.profileImageUrl || session?.user?.profileImageUrl || '',
  ).trim();
  const activePreviewAvatarSource = selectedImageAsset?.uri
    ? { uri: selectedImageAsset.uri }
    : null;
  const avatarSource = activePreviewAvatarSource
    ? activePreviewAvatarSource
    : resolveAvatarSource({
        avatarUrl:
          (showExternalProfile ? externalProfile?.avatar || null : null) || selfAvatarUrl || null,
        profileImageUrl: selfAvatarUrl || null,
        id: showExternalProfile
          ? externalProfile?.id || null
          : selfProfile?.id || session?.user?.id || null,
        userId: showExternalProfile
          ? externalProfile?.id || null
          : selfProfile?.id || session?.user?.id || null,
        phone: showExternalProfile
          ? externalProfile?.phone || null
          : selfProfile?.phone || session?.user?.phone || null,
        name: displayName,
        role: showExternalProfile ? externalProfile?.role || null : session?.user?.role || null,
      });
  const phoneLabel = showExternalProfile
    ? externalProfile?.phone || 'Private profile'
    : selfProfile?.phone || session?.user?.phone || 'Phone not available';
  const roleLabel = showExternalProfile
    ? String(externalProfile?.role || '').trim().toUpperCase() || null
    : String(selfProfile?.role || session?.user?.role || '').trim().toUpperCase() || null;

  const onOpenAvatarEditor = useCallback(() => {
    setAvatarInput(selfAvatarUrl || '');
    setSelectedImageAsset(null);
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
    setSelectedImageAsset(null);
    setIsEditorVisible(false);
  }, [isSavingAvatar]);

  const applySelectedImageAsset = useCallback((asset) => {
    if (!asset?.uri) {
      return false;
    }

    const fileSize = Number(asset?.fileSize || 0);
    if (fileSize > MAX_PROFILE_IMAGE_BYTES) {
      Alert.alert('Image too large', 'Please select an image smaller than 5 MB.');
      return false;
    }

    if (!isAllowedProfileImage(asset)) {
      Alert.alert('Unsupported image', 'Please use JPG, PNG, or WEBP image.');
      return false;
    }

    setSelectedImageAsset(asset);
    setAvatarInput('');
    logProfileDebug('avatarPickerAssetSelected', {
      mimeType: normalizeImageMimeType(asset) || null,
      fileSize: Number(asset?.fileSize || 0) || null,
    });
    return true;
  }, []);

  const pickImageFromLibrary = useCallback(async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult?.granted) {
        Alert.alert(
          'Gallery permission needed',
          'Allow photo library access to upload your profile picture.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result?.canceled) {
        return;
      }

      const asset = result?.assets?.[0] || null;
      applySelectedImageAsset(asset);
    } catch (error) {
      logProfileDebug('avatarPickerLibraryFailure', {
        message: error?.message || 'Unknown error',
      });
      Alert.alert('Unable to open gallery', 'Please try again.');
    }
  }, [applySelectedImageAsset]);

  const pickImageFromCamera = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult?.granted) {
        Alert.alert(
          'Camera permission needed',
          'Allow camera access to capture your profile picture.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result?.canceled) {
        return;
      }

      const asset = result?.assets?.[0] || null;
      applySelectedImageAsset(asset);
    } catch (error) {
      logProfileDebug('avatarPickerCameraFailure', {
        message: error?.message || 'Unknown error',
      });
      Alert.alert('Unable to open camera', 'Please try again.');
    }
  }, [applySelectedImageAsset]);

  const onSaveAvatar = useCallback(async () => {
    const nextAvatarUrl = String(avatarInput || '').trim();

    if (!selectedImageAsset && !nextAvatarUrl) {
      Alert.alert(
        'Profile picture required',
        'Please choose an image from device or enter an image URL.',
      );
      return;
    }

    if (!selectedImageAsset && nextAvatarUrl) {
      try {
        // Validate URL input before API call.
        // eslint-disable-next-line no-new
        new URL(nextAvatarUrl);
      } catch (_error) {
        Alert.alert('Invalid URL', 'Please enter a valid image URL.');
        return;
      }
    }

    setIsSavingAvatar(true);
    logProfileDebug('profileUpdateStart', {
      role: roleLabel,
      hasSelectedImage: Boolean(selectedImageAsset?.uri),
      hasAvatarUrl: Boolean(nextAvatarUrl),
    });

    try {
      const updatedProfile = selectedImageAsset?.uri
        ? await uploadMyProfileAvatar(selectedImageAsset)
        : await updateMyProfile({
            profileImageUrl: nextAvatarUrl,
          });

      setSelfProfile(updatedProfile || selfProfile);
      await setSession({
        ...session,
        user: {
          ...(session?.user || {}),
          ...(updatedProfile || {}),
          profileImageUrl:
            updatedProfile?.profileImageUrl ||
            selectedImageAsset?.uri ||
            nextAvatarUrl,
        },
      });

      setSelectedImageAsset(null);
      setIsEditorVisible(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.listener.dashboard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
      ]);
      Alert.alert('Profile updated', 'Your profile picture has been updated.');
      logProfileDebug('profileUpdateSuccess', {
        role: roleLabel,
        uploadType: selectedImageAsset?.uri ? 'device_upload' : 'url_update',
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
  }, [
    avatarInput,
    queryClient,
    roleLabel,
    selectedImageAsset,
    selfProfile,
    session,
    setSession,
  ]);

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
              <Text style={styles.modalSubtitle}>
                Choose from gallery/camera, or use an image URL.
              </Text>

              <View style={styles.modalPreviewWrap}>
                <Image source={avatarSource} style={styles.modalPreviewAvatar} />
              </View>

              <View style={styles.pickerActionRow}>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={pickImageFromLibrary}
                  activeOpacity={0.85}
                  disabled={isSavingAvatar}
                >
                  <Ionicons name="images-outline" size={14} color={theme.colors.textPrimary} />
                  <Text style={styles.pickerBtnText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={pickImageFromCamera}
                  activeOpacity={0.85}
                  disabled={isSavingAvatar}
                >
                  <Ionicons name="camera-outline" size={14} color={theme.colors.textPrimary} />
                  <Text style={styles.pickerBtnText}>Camera</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={avatarInput}
                onChangeText={setAvatarInput}
                placeholder="Optional: https://example.com/avatar.jpg"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.modalInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSavingAvatar}
              />
              <Text style={styles.modalHint}>
                {selectedImageAsset?.uri
                  ? 'Device image selected. Save to upload it now.'
                  : 'URL is optional. Device upload is preferred.'}
              </Text>
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
              {isSavingAvatar ? (
                <View style={styles.modalLoaderRow}>
                  <ActivityIndicator size="small" color={theme.colors.magenta} />
                  <Text style={styles.modalLoaderText}>Uploading profile image...</Text>
                </View>
              ) : null}
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
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.glassStrong,
    padding: 22,
    alignItems: 'center',
    ...theme.shadow.card,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
    fontSize: 24,
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
  modalPreviewWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
  modalPreviewAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2,
    borderColor: theme.colors.magenta,
    backgroundColor: '#251B33',
  },
  pickerActionRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  pickerBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  pickerBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
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
  modalHint: {
    marginTop: 8,
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
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
  modalLoaderRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalLoaderText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
});

export default ProfileScreen;
