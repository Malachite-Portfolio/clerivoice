import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_DEBUG_ENABLED } from '../constants/api';

const STORAGE_KEY = '@clarivoice/chat-ended-sessions/v1';
const MAX_TRACKED_SESSIONS = 300;

let cachedEndedSessions = null;

const logChatSessionState = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ChatSessionState] ${label}`, payload);
};

const normalizeSessionId = (sessionId) => {
  const normalized = String(sessionId || '').trim();
  return normalized || null;
};

const parseEndedSessions = (rawValue) => {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed;
  } catch (_error) {
    return {};
  }
};

const loadEndedSessions = async () => {
  if (cachedEndedSessions) {
    return cachedEndedSessions;
  }

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cachedEndedSessions = parseEndedSessions(raw);
  } catch (_error) {
    cachedEndedSessions = {};
  }

  return cachedEndedSessions;
};

const persistEndedSessions = async (endedSessions) => {
  cachedEndedSessions = endedSessions;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(endedSessions));
  } catch (error) {
    logChatSessionState('persistFailed', {
      message: error?.message || 'Unknown error',
    });
  }
};

const pruneEndedSessions = (endedSessions) => {
  const entries = Object.entries(endedSessions);
  if (entries.length <= MAX_TRACKED_SESSIONS) {
    return endedSessions;
  }

  entries.sort((left, right) => {
    const leftTs = new Date(left[1]?.endedAt || 0).getTime();
    const rightTs = new Date(right[1]?.endedAt || 0).getTime();
    return rightTs - leftTs;
  });

  return Object.fromEntries(entries.slice(0, MAX_TRACKED_SESSIONS));
};

export const markChatSessionEndedLocally = async ({
  sessionId,
  endReason = 'USER_ENDED',
  source = 'unknown',
  pendingSync = false,
} = {}) => {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    return null;
  }

  const endedSessions = await loadEndedSessions();
  const next = {
    ...endedSessions,
    [normalizedSessionId]: {
      sessionId: normalizedSessionId,
      endedAt: new Date().toISOString(),
      endReason: String(endReason || 'USER_ENDED')
        .trim()
        .toUpperCase(),
      source: String(source || 'unknown')
        .trim()
        .toLowerCase(),
      pendingSync: Boolean(pendingSync),
    },
  };

  const pruned = pruneEndedSessions(next);
  await persistEndedSessions(pruned);
  logChatSessionState('sessionMarkedEnded', {
    sessionId: normalizedSessionId,
    endReason,
    source,
    pendingSync: Boolean(pendingSync),
  });
  return pruned[normalizedSessionId] || null;
};

export const markChatSessionEndSynced = async (sessionId) => {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    return;
  }

  const endedSessions = await loadEndedSessions();
  const existing = endedSessions[normalizedSessionId];
  if (!existing) {
    return;
  }

  const next = {
    ...endedSessions,
    [normalizedSessionId]: {
      ...existing,
      pendingSync: false,
      syncedAt: new Date().toISOString(),
    },
  };
  await persistEndedSessions(next);
  logChatSessionState('sessionSyncMarked', {
    sessionId: normalizedSessionId,
  });
};

export const isChatSessionMarkedEndedLocally = async (sessionId) => {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    return false;
  }

  const endedSessions = await loadEndedSessions();
  return Boolean(endedSessions[normalizedSessionId]);
};

export const getLocallyEndedChatSessionIds = async () => {
  const endedSessions = await loadEndedSessions();
  return new Set(Object.keys(endedSessions));
};

export const getPendingChatSessionEnds = async () => {
  const endedSessions = await loadEndedSessions();
  return Object.values(endedSessions).filter((entry) => entry?.pendingSync);
};

