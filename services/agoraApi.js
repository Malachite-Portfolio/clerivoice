import { API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';

export const requestRtcToken = async ({
  sessionId,
  role = 'publisher',
  expirySeconds,
}) => {
  const response = await apiClient.post(API_ENDPOINTS.agora.rtcToken, {
    sessionId,
    role,
    expirySeconds,
  });

  return response.data.data;
};

export const requestChatToken = async ({
  sessionId,
  expirySeconds,
}) => {
  const response = await apiClient.post(API_ENDPOINTS.agora.chatToken, {
    sessionId,
    expirySeconds,
  });

  return response.data.data;
};
