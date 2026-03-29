import { apiClient } from './apiClient';

export const updateMyAvailability = async (availability) => {
  const response = await apiClient.post('/listeners/me/availability', {
    availability,
  });
  return response.data.data;
};

export const acceptCallRequest = async (sessionId) => {
  const response = await apiClient.post('/call/accept', { sessionId });
  return response.data.data;
};

export const rejectCallRequest = async (sessionId, reason) => {
  const response = await apiClient.post('/call/reject', { sessionId, reason });
  return response.data.data;
};

export const acceptChatRequest = async (sessionId) => {
  const response = await apiClient.post('/chat/accept', { sessionId });
  return response.data.data;
};

export const rejectChatRequest = async (sessionId, reason) => {
  const response = await apiClient.post('/chat/reject', { sessionId, reason });
  return response.data.data;
};

export const fetchMyCallSessions = async () => {
  const response = await apiClient.get('/call/sessions');
  return response.data.data;
};

export const fetchMyChatSessions = async () => {
  const response = await apiClient.get('/chat/sessions');
  return response.data.data;
};
