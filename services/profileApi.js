import { API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';

export const getMyProfile = async () => {
  const response = await apiClient.get(API_ENDPOINTS.profile.me);
  return response.data?.data || null;
};

export const updateMyProfile = async (payload = {}) => {
  const response = await apiClient.patch(API_ENDPOINTS.profile.me, payload);
  return response.data?.data || null;
};

const DEFAULT_AVATAR_FILE_NAME = 'profile-avatar.jpg';
const DEFAULT_AVATAR_MIME_TYPE = 'image/jpeg';

export const uploadMyProfileAvatar = async (imageAsset = {}) => {
  const imageUri = String(imageAsset?.uri || '').trim();
  if (!imageUri) {
    throw new Error('Image uri is required for avatar upload.');
  }

  const formData = new FormData();
  formData.append('avatar', {
    uri: imageUri,
    name: imageAsset?.fileName || DEFAULT_AVATAR_FILE_NAME,
    type: imageAsset?.mimeType || imageAsset?.type || DEFAULT_AVATAR_MIME_TYPE,
  });

  const response = await apiClient.post(API_ENDPOINTS.profile.uploadAvatar, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data?.data || null;
};
