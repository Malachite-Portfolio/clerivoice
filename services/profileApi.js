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
