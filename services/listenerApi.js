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

const toTimestamp = (value) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isGroupedCallItem = (item) =>
  Boolean(item?.lastCall) && Number.isFinite(Number(item?.totalCalls));

const normalizeGroupedCallItem = (item) => {
  const lastCall = item?.lastCall || null;
  return {
    id: item?.id || `group:${item?.user?.id || lastCall?.userId || 'unknown'}`,
    user: item?.user || lastCall?.user || null,
    totalCalls: toNumber(item?.totalCalls || 0),
    totalDuration: toNumber(item?.totalDuration || 0),
    totalAmount: toNumber(item?.totalAmount || 0),
    lastCall,
    status: item?.status || lastCall?.status || null,
    callType: item?.callType || lastCall?.callType || 'audio',
    startedAt:
      item?.startedAt ||
      lastCall?.startedAt ||
      lastCall?.answeredAt ||
      lastCall?.requestedAt ||
      lastCall?.createdAt ||
      null,
    requestedAt: item?.requestedAt || lastCall?.requestedAt || lastCall?.createdAt || null,
    durationSeconds: toNumber(item?.durationSeconds || lastCall?.durationSeconds || 0),
    groupedByUser: true,
  };
};

const groupCallSessionsByUser = (items = []) => {
  const groups = new Map();

  items.forEach((item) => {
    if (getRecordType(item) !== 'CALL') {
      return;
    }

    const participant = item?.user || null;
    const participantId = participant?.id || item?.userId || `unknown:${item?.id}`;
    const startedAt =
      item?.startedAt || item?.answeredAt || item?.requestedAt || item?.createdAt || null;
    const startedAtTs = toTimestamp(startedAt);

    if (!groups.has(participantId)) {
      groups.set(participantId, {
        id: `group:${participantId}`,
        user: participant || {
          id: participantId,
          displayName: 'Anonymous User',
          profileImageUrl: null,
        },
        totalCalls: 0,
        totalDuration: 0,
        totalAmount: 0,
        lastCall: null,
        lastCallAt: 0,
      });
    }

    const group = groups.get(participantId);
    group.totalCalls += 1;
    group.totalDuration += toNumber(item?.durationSeconds);
    group.totalAmount += toNumber(item?.totalAmount);

    if (!group.lastCall || startedAtTs >= group.lastCallAt) {
      group.lastCall = item;
      group.lastCallAt = startedAtTs;
      if (participant) {
        group.user = participant;
      }
    }
  });

  return Array.from(groups.values())
    .map((group) =>
      normalizeGroupedCallItem({
        ...group,
        status: group?.lastCall?.status || null,
        callType: group?.lastCall?.callType || 'audio',
        startedAt:
          group?.lastCall?.startedAt ||
          group?.lastCall?.answeredAt ||
          group?.lastCall?.requestedAt ||
          group?.lastCall?.createdAt ||
          null,
        requestedAt: group?.lastCall?.requestedAt || group?.lastCall?.createdAt || null,
        durationSeconds: group?.lastCall?.durationSeconds || 0,
      }),
    )
    .sort((left, right) => {
      const leftTs = toTimestamp(left?.startedAt || left?.requestedAt);
      const rightTs = toTimestamp(right?.startedAt || right?.requestedAt);
      return rightTs - leftTs;
    });
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
  const response = await apiClient.get(API_ENDPOINTS.call.sessions, {
    params: {
      groupByUser: 'true',
    },
  });
  const data = response.data?.data || {};
  const rawItems = data?.items || [];
  const callItems = rawItems.filter((item) => getRecordType(item) === 'CALL');
  const backendGrouped =
    Boolean(data?.groupedByUser) ||
    (callItems.length > 0 && callItems.every((item) => isGroupedCallItem(item)));
  const groupedItems = backendGrouped
    ? callItems.map((item) => normalizeGroupedCallItem(item))
    : groupCallSessionsByUser(callItems);

  logCallHistory('callHistoryFetchedItemTypes', {
    count: rawItems.length,
    types: rawItems.map((item) => getRecordType(item)),
  });
  logCallHistory('callHistoryFilteredCounts', {
    total: rawItems.length,
    callOnly: callItems.length,
    droppedNonCall: rawItems.length - callItems.length,
  });
  logCallHistory('callHistoryGroupedCounts', {
    backendGrouped,
    groupedCount: groupedItems.length,
    rawCount: callItems.length,
  });

  return {
    ...data,
    items: groupedItems,
    groupedByUser: true,
    aggregationSource: backendGrouped ? 'backend' : 'frontend_fallback',
  };
};

export const fetchMyChatSessions = async () => {
  const response = await apiClient.get(API_ENDPOINTS.chat.sessions);
  return response.data.data;
};
