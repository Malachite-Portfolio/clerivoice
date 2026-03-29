import { apiClient } from './apiClient';

export const requestRtcToken = async ({
  sessionId,
  role = 'publisher',
  expirySeconds,
}) => {
  const response = await apiClient.post('/agora/rtc-token', {
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
  const response = await apiClient.post('/agora/chat-token', {
    sessionId,
    expirySeconds,
  });

  return response.data.data;
};
