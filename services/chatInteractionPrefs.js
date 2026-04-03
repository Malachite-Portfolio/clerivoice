import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_DEBUG_ENABLED } from '../constants/api';

const STORAGE_PREFIX = 'clarivoice_chat_interaction_prefs';

const logPrefsDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ChatInteractionPrefs] ${label}`, payload);
};

const toSafeId = (value) => String(value || '').trim();

const getStorageKey = (currentUserId) => `${STORAGE_PREFIX}:${toSafeId(currentUserId)}`;

const normalizeList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toSafeId(item))
    .filter(Boolean);
};

const normalizePrefs = (value) => ({
  mutedConversationIds: normalizeList(value?.mutedConversationIds),
  blockedUserIds: normalizeList(value?.blockedUserIds),
});

const readPrefs = async (currentUserId) => {
  const normalizedUserId = toSafeId(currentUserId);
  if (!normalizedUserId) {
    return normalizePrefs(null);
  }

  const raw = await AsyncStorage.getItem(getStorageKey(normalizedUserId));
  if (!raw) {
    return normalizePrefs(null);
  }

  try {
    return normalizePrefs(JSON.parse(raw));
  } catch (_error) {
    return normalizePrefs(null);
  }
};

const writePrefs = async (currentUserId, prefs) => {
  const normalizedUserId = toSafeId(currentUserId);
  if (!normalizedUserId) {
    return normalizePrefs(null);
  }

  const normalized = normalizePrefs(prefs);
  await AsyncStorage.setItem(getStorageKey(normalizedUserId), JSON.stringify(normalized));
  return normalized;
};

const resolveConversationId = (counterpartyId) => toSafeId(counterpartyId);

export const getChatInteractionPrefs = async (currentUserId) => {
  const prefs = await readPrefs(currentUserId);
  logPrefsDebug('prefsLoaded', {
    currentUserId: toSafeId(currentUserId) || null,
    mutedCount: prefs.mutedConversationIds.length,
    blockedCount: prefs.blockedUserIds.length,
  });
  return prefs;
};

export const isConversationMuted = async ({ currentUserId, counterpartyId }) => {
  const conversationId = resolveConversationId(counterpartyId);
  if (!conversationId) {
    return false;
  }

  const prefs = await readPrefs(currentUserId);
  return prefs.mutedConversationIds.includes(conversationId);
};

export const setConversationMuted = async ({
  currentUserId,
  counterpartyId,
  muted,
}) => {
  const conversationId = resolveConversationId(counterpartyId);
  if (!conversationId) {
    return false;
  }

  const prefs = await readPrefs(currentUserId);
  const nextMutedIds = new Set(prefs.mutedConversationIds);

  if (muted) {
    nextMutedIds.add(conversationId);
  } else {
    nextMutedIds.delete(conversationId);
  }

  await writePrefs(currentUserId, {
    ...prefs,
    mutedConversationIds: Array.from(nextMutedIds),
  });

  logPrefsDebug('conversationMuteUpdated', {
    currentUserId: toSafeId(currentUserId) || null,
    counterpartyId: conversationId,
    muted: Boolean(muted),
  });

  return Boolean(muted);
};

export const isUserBlocked = async ({ currentUserId, counterpartyId }) => {
  const normalizedCounterpartyId = toSafeId(counterpartyId);
  if (!normalizedCounterpartyId) {
    return false;
  }

  const prefs = await readPrefs(currentUserId);
  return prefs.blockedUserIds.includes(normalizedCounterpartyId);
};

export const setUserBlocked = async ({
  currentUserId,
  counterpartyId,
  blocked,
}) => {
  const normalizedCounterpartyId = toSafeId(counterpartyId);
  if (!normalizedCounterpartyId) {
    return false;
  }

  const prefs = await readPrefs(currentUserId);
  const nextBlockedIds = new Set(prefs.blockedUserIds);

  if (blocked) {
    nextBlockedIds.add(normalizedCounterpartyId);
  } else {
    nextBlockedIds.delete(normalizedCounterpartyId);
  }

  await writePrefs(currentUserId, {
    ...prefs,
    blockedUserIds: Array.from(nextBlockedIds),
  });

  logPrefsDebug('blockStateUpdated', {
    currentUserId: toSafeId(currentUserId) || null,
    counterpartyId: normalizedCounterpartyId,
    blocked: Boolean(blocked),
  });

  return Boolean(blocked);
};
