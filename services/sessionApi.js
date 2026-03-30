import { API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';

export const requestCall = async (listenerId) => {
  const response = await apiClient.post(API_ENDPOINTS.call.request, { listenerId });
  return response.data.data;
};

export const endCallSession = async (sessionId, endReason = 'USER_ENDED') => {
  const response = await apiClient.post(API_ENDPOINTS.call.end(sessionId), { endReason });
  return response.data.data;
};

export const refreshCallToken = async (sessionId) => {
  const response = await apiClient.post(API_ENDPOINTS.call.token(sessionId), {});
  return response.data.data;
};

export const requestChat = async (listenerId) => {
  const response = await apiClient.post(API_ENDPOINTS.chat.request, { listenerId });
  return response.data.data;
};

export const endChatSession = async (sessionId, endReason = 'USER_ENDED') => {
  const response = await apiClient.post(API_ENDPOINTS.chat.end(sessionId), { endReason });
  return response.data.data;
};

export const refreshChatToken = async (sessionId) => {
  const response = await apiClient.post(API_ENDPOINTS.chat.token(sessionId), {});
  return response.data.data;
};

export const getChatMessages = async (sessionId) => {
  const response = await apiClient.get(API_ENDPOINTS.chat.messages(sessionId));
  return response.data.data;
};

export const getWalletSummary = async () => {
  const response = await apiClient.get(API_ENDPOINTS.wallet.summary);
  return response.data.data;
};
