import { API_ENDPOINTS, AUTH_DEBUG_ENABLED } from '../constants/api';
import { apiClient } from './apiClient';

const getRecordType = (item) => {
  const rawType = String(
    item?.type || item?.sessionType || item?.recordType || item?.kind || '',
  )
    .trim()
    .toUpperCase();

  if (rawType.includes('CHAT')) {
    return 'CHAT';
  }

  if (rawType.includes('CALL') || item?.callType || item?.answeredAt || item?.durationSeconds) {
    return 'CALL';
  }

  return 'CALL';
};

const logCallHistory = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[listenerApi] ${label}`, payload);
};

export const updateMyAvailability = async (availability) => {
  const response = await apiClient.post(API_ENDPOINTS.listeners.myAvailability, {
    availability,
  });
  return response.data.data;
};

export const fetchListenerDashboard = async () => {
  const response = await apiClient.get(API_ENDPOINTS.listeners.dashboard);
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

export const fetchMyCallSessions = async () => {
  const response = await apiClient.get(API_ENDPOINTS.call.sessions);
  const data = response.data?.data || {};
  const rawItems = data?.items || [];
  const callItems = rawItems.filter((item) => getRecordType(item) === 'CALL');

  logCallHistory('callHistoryFetchedItemTypes', {
    count: rawItems.length,
    types: rawItems.map((item) => getRecordType(item)),
  });
  logCallHistory('callHistoryFilteredCounts', {
    total: rawItems.length,
    callOnly: callItems.length,
    droppedNonCall: rawItems.length - callItems.length,
  });

  return {
    ...data,
    items: callItems,
  };
};

export const fetchMyChatSessions = async () => {
  const response = await apiClient.get(API_ENDPOINTS.chat.sessions);
  return response.data.data;
};
