import { API_ENDPOINTS, AUTH_DEBUG_ENABLED } from '../constants/api';
import { apiClient } from './apiClient';
import {
  createDemoCallRequest,
  createDemoChatRequest,
  endDemoCallSession,
  endDemoChatSession,
  getDemoCallSessions,
  getDemoChatMessages,
  getDemoChatSessions,
  getDemoWalletSummary,
  isDemoSessionActive,
} from './demoMode';

const CHAT_SESSION_PAGE_SIZE = 10;
const CALL_SESSION_PAGE_SIZE = 10;

const logSessionApi = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[SessionApi] ${label}`, payload);
};

const toStatus = (value) => String(value || '').trim().toUpperCase();

const toTimestamp = (value) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const getSessionRecordType = (session) => {
  const rawType = String(
    session?.type || session?.sessionType || session?.recordType || session?.kind || '',
  )
    .trim()
    .toUpperCase();

  if (rawType.includes('CALL') || session?.callType || session?.answeredAt || session?.durationSeconds) {
    return 'CALL';
  }

  if (rawType.includes('CHAT')) {
    return 'CHAT';
  }

  return 'CHAT';
};

const resolveSessionParticipant = (session, currentUserId) => {
  if (!session) {
    return null;
  }

  if (currentUserId && session.userId === currentUserId) {
    return session.listener || null;
  }

  if (currentUserId && session.listenerId === currentUserId) {
    return session.user || null;
  }

  return session.listener || session.user || null;
};

const getChatFallbackPreview = (status) => {
  switch (toStatus(status)) {
    case 'REQUESTED':
      return 'Waiting for the other side to join the conversation.';
    case 'ACTIVE':
      return 'Conversation is live right now.';
    case 'REJECTED':
      return 'Chat request was declined.';
    case 'ENDED':
      return 'Conversation ended.';
    default:
      return 'Start conversation...';
  }
};

export const requestCall = async (listenerId, options = {}) => {
  const callType =
    String(options?.callType || '').trim().toLowerCase() === 'video'
      ? 'video'
      : 'audio';

  if (isDemoSessionActive()) {
    return createDemoCallRequest(listenerId);
  }

  logSessionApi('callSessionCreateStart', {
    listenerId,
    callType,
  });
  const response = await apiClient.post(API_ENDPOINTS.call.request, {
    listenerId,
    callType,
  });
  logSessionApi('callSessionCreateSuccess', {
    listenerId,
    callType:
      response.data?.data?.session?.callType || callType,
    sessionId: response.data?.data?.session?.id || null,
    status: response.data?.data?.session?.status || null,
  });
  return response.data.data;
};

export const endCallSession = async (sessionId, endReason = 'USER_ENDED') => {
  if (isDemoSessionActive()) {
    return endDemoCallSession(sessionId, endReason);
  }

  const response = await apiClient.post(API_ENDPOINTS.call.end(sessionId), { endReason });
  return response.data.data;
};

export const refreshCallToken = async (sessionId) => {
  if (isDemoSessionActive()) {
    return {
      sessionId,
      agora: null,
      channelName: null,
      demoMode: true,
    };
  }

  const response = await apiClient.post(API_ENDPOINTS.call.token(sessionId), {});
  return response.data.data;
};

export const requestChat = async (listenerId) => {
  if (isDemoSessionActive()) {
    return createDemoChatRequest(listenerId);
  }

  logSessionApi('chatSessionCreateStart', {
    listenerId,
  });
  const response = await apiClient.post(API_ENDPOINTS.chat.request, { listenerId });
  logSessionApi('chatSessionCreateSuccess', {
    listenerId,
    sessionId: response.data?.data?.session?.id || null,
    status: response.data?.data?.session?.status || null,
  });
  return response.data.data;
};

export const endChatSession = async (sessionId, endReason = 'USER_ENDED') => {
  if (isDemoSessionActive()) {
    return endDemoChatSession(sessionId, endReason);
  }

  const response = await apiClient.post(API_ENDPOINTS.chat.end(sessionId), { endReason });
  return response.data.data;
};

export const refreshChatToken = async (sessionId) => {
  if (isDemoSessionActive()) {
    return {
      sessionId,
      agora: null,
      demoMode: true,
    };
  }

  const response = await apiClient.post(API_ENDPOINTS.chat.token(sessionId), {});
  return response.data.data;
};

export const getChatMessages = async (sessionId) => {
  if (isDemoSessionActive()) {
    return getDemoChatMessages(sessionId);
  }

  const response = await apiClient.get(API_ENDPOINTS.chat.messages(sessionId));
  return response.data.data;
};

export const getChatSessions = async ({ page = 1, limit = CHAT_SESSION_PAGE_SIZE, status } = {}) => {
  if (isDemoSessionActive()) {
    return getDemoChatSessions({ page, limit, status });
  }

  const response = await apiClient.get(API_ENDPOINTS.chat.sessions, {
    params: {
      page,
      limit,
      ...(status ? { status } : {}),
    },
  });
  logSessionApi('chatSessionsFetched', {
    page,
    limit,
    status: status || null,
    count: response.data?.data?.items?.length || 0,
  });
  return response.data.data;
};

export const getCallSessions = async ({
  page = 1,
  limit = CALL_SESSION_PAGE_SIZE,
  status,
  groupByUser = false,
} = {}) => {
  if (isDemoSessionActive()) {
    return getDemoCallSessions({ page, limit });
  }

  const normalizedStatuses = Array.isArray(status)
    ? status.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
    : typeof status === 'string'
      ? status
          .split(',')
          .map((item) => String(item || '').trim().toUpperCase())
          .filter(Boolean)
      : [];

  const response = await apiClient.get(API_ENDPOINTS.call.sessions, {
    params: {
      page,
      limit,
      ...(normalizedStatuses.length ? { status: normalizedStatuses.join(',') } : {}),
      ...(groupByUser ? { groupByUser: 'true' } : {}),
    },
  });
  logSessionApi('callSessionsFetched', {
    page,
    limit,
    statuses: normalizedStatuses,
    groupByUser: Boolean(groupByUser),
    count: response.data?.data?.items?.length || 0,
  });
  return response.data.data;
};

export const getCallSession = async (sessionId) => {
  if (isDemoSessionActive()) {
    return null;
  }

  const response = await apiClient.get(API_ENDPOINTS.call.session(sessionId));
  logSessionApi('callSessionFetched', {
    sessionId,
    status: response.data?.data?.session?.status || null,
    isAccepted: response.data?.data?.realtime?.isAccepted ?? null,
    hasUserJoinedMedia: response.data?.data?.realtime?.hasUserJoinedMedia ?? null,
    hasListenerJoinedMedia: response.data?.data?.realtime?.hasListenerJoinedMedia ?? null,
  });
  return response.data.data;
};

export const getWalletSummary = async () => {
  if (isDemoSessionActive()) {
    return getDemoWalletSummary();
  }

  const response = await apiClient.get(API_ENDPOINTS.wallet.summary);
  logSessionApi('walletSummaryFetched', {
    balance: response.data?.data?.balance ?? null,
  });
  return response.data.data;
};

export const getInboxItems = async ({ currentUserId, limit = 12 } = {}) => {
  const chatSessionData = await getChatSessions({ page: 1, limit });

  const inboxSourceItems = chatSessionData?.items || [];
  const chatSessions = inboxSourceItems.filter((session) => getSessionRecordType(session) === 'CHAT');

  logSessionApi('inboxFetchedItemTypes', {
    count: inboxSourceItems.length,
    types: inboxSourceItems.map((session) => getSessionRecordType(session)),
  });
  logSessionApi('inboxFilteredCounts', {
    total: inboxSourceItems.length,
    chatOnly: chatSessions.length,
    droppedNonChat: inboxSourceItems.length - chatSessions.length,
  });

  const messageHistoryEntries = await Promise.all(
    chatSessions.map(async (session) => {
      try {
        const history = await getChatMessages(session.id);
        return [session.id, history?.messages || []];
      } catch (_error) {
        return [session.id, []];
      }
    }),
  );

  const messageHistoryBySessionId = Object.fromEntries(messageHistoryEntries);

  const chatItems = chatSessions.map((session) => {
    const participant = resolveSessionParticipant(session, currentUserId);
    const messages = messageHistoryBySessionId[session.id] || [];
    const lastMessage = messages[messages.length - 1] || null;
    const unreadCount = messages.filter(
      (message) => message?.receiverId === currentUserId && message?.status !== 'READ',
    ).length;
    const preview = lastMessage?.content || getChatFallbackPreview(session.status);
    const timestamp =
      lastMessage?.createdAt ||
      session.updatedAt ||
      session.endedAt ||
      session.startedAt ||
      session.requestedAt ||
      session.createdAt;

    return {
      id: `chat-${session.id}`,
      type: 'chat',
      session,
      participant: {
        id: participant?.id || session.listenerId || session.userId,
        name: participant?.displayName || 'Conversation',
        profileImageUrl: participant?.profileImageUrl || null,
      },
      preview,
      unreadCount,
      timestamp,
      sortAt: toTimestamp(timestamp),
      status: session.status,
      hasMessages: messages.length > 0,
    };
  });

  const finalItems = chatItems
    .sort((left, right) => right.sortAt - left.sortAt)
    .slice(0, limit);

  logSessionApi('inboxFinalCounts', {
    returned: finalItems.length,
    returnedTypes: finalItems.map((item) => item.type),
  });

  return finalItems;
};
