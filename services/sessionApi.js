import { apiClient } from './apiClient';

export const requestCall = async (listenerId) => {
  const response = await apiClient.post('/call/request', { listenerId });
  return response.data.data;
};

export const endCallSession = async (sessionId, endReason = 'USER_ENDED') => {
  const response = await apiClient.post(`/call/${sessionId}/end`, { endReason });
  return response.data.data;
};

export const refreshCallToken = async (sessionId) => {
  const response = await apiClient.post(`/call/${sessionId}/token`, {});
  return response.data.data;
};

export const requestChat = async (listenerId) => {
  const response = await apiClient.post('/chat/request', { listenerId });
  return response.data.data;
};

export const endChatSession = async (sessionId, endReason = 'USER_ENDED') => {
  const response = await apiClient.post(`/chat/${sessionId}/end`, { endReason });
  return response.data.data;
};

export const refreshChatToken = async (sessionId) => {
  const response = await apiClient.post(`/chat/${sessionId}/token`, {});
  return response.data.data;
};

export const getChatMessages = async (sessionId) => {
  const response = await apiClient.get(`/chat/${sessionId}/messages`);
  return response.data.data;
};

export const getWalletSummary = async () => {
  const response = await apiClient.get('/wallet/summary');
  return response.data.data;
};
