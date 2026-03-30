import { API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';

export const updateMyAvailability = async (availability) => {
  const response = await apiClient.post(API_ENDPOINTS.listeners.myAvailability, {
    availability,
  });
  return response.data.data;
};

export const acceptCallRequest = async (sessionId) => {
  const response = await apiClient.post(API_ENDPOINTS.call.accept, { sessionId });
  return response.data.data;
};

export const rejectCallRequest = async (sessionId, reason) => {
  const response = await apiClient.post(API_ENDPOINTS.call.reject, { sessionId, reason });
  return response.data.data;
};

export const acceptChatRequest = async (sessionId) => {
  const response = await apiClient.post(API_ENDPOINTS.chat.accept, { sessionId });
  return response.data.data;
};

export const rejectChatRequest = async (sessionId, reason) => {
  const response = await apiClient.post(API_ENDPOINTS.chat.reject, { sessionId, reason });
  return response.data.data;
};

export const fetchMyCallSessions = async () => {
  const response = await apiClient.get(API_ENDPOINTS.call.sessions);
  return response.data.data;
};

export const fetchMyChatSessions = async () => {
  const response = await apiClient.get(API_ENDPOINTS.chat.sessions);
  return response.data.data;
};
