import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import theme from '../constants/theme';
import { AGORA_CHAT_APP_KEY, AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { resetToAuthEntry } from '../navigation/navigationRef';
import { apiClient, isUnauthorizedApiError } from '../services/apiClient';
import { addDemoChatMessage, addDemoChatReply } from '../services/demoMode';
import { connectRealtimeSocket, emitWithAck, getRealtimeSocket } from '../services/realtimeSocket';
import {
  endChatSession,
  getCallSessions,
  getChatMessages,
  refreshChatToken,
  requestCall,
} from '../services/sessionApi';
import { initAgoraChatSession, leaveAgoraChatSession, renewAgoraChatToken } from '../services/agoraChatService';
import {
  requestCallAudioPermissions,
  requestVideoCallPermissions,
} from '../services/audioPermissions';
import { getCallStatusMessageFromError } from '../services/callStatusMessage';
import {
  getChatInteractionPrefs,
  setConversationMuted,
  setUserBlocked,
} from '../services/chatInteractionPrefs';

const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');
const PATTERN = [{ t: 20, l: 24, s: 54 }, { t: 110, l: 180, s: 28 }, { t: 160, l: 42, s: 16 }, { t: 280, l: 220, s: 44 }, { t: 380, l: 70, s: 24 }, { t: 460, l: 200, s: 18 }, { t: 520, l: 18, s: 60 }, { t: 620, l: 190, s: 26 }];
const src = (v) => (typeof v === 'string' ? { uri: v } : v || avatarPlaceholder);
const time = (v) => new Date(v || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const duration = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

const normalizeChatStatus = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) {
    return 'ACTIVE';
  }

  // Legacy sessions may still be marked REQUESTED from older builds; chat no longer requires approval.
  if (normalized === 'REQUESTED') {
    return 'ACTIVE';
  }

  return normalized;
};

const logChatDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ChatSessionScreen] ${label}`, payload);
};

const SUSPENSION_CODES = new Set(['ACCOUNT_SUSPENDED', 'RESTRICTED_CONTACT_INFO']);
const SUSPENSION_MESSAGE =
  'Your account is temporarily suspended for 2 hours due to sharing restricted contact information.';

const getErrorCode = (error) =>
  String(error?.code || error?.response?.data?.code || '')
    .trim()
    .toUpperCase();

const getSuspendedUntilFromError = (error) =>
  error?.data?.suspendedUntil ||
  error?.response?.data?.data?.suspendedUntil ||
  error?.response?.data?.suspendedUntil ||
  null;

const getSuspendedUntilFromSession = (sessionData) =>
  sessionData?.user?.suspendedUntil || null;

const toDateMs = (value) => {
  const dateMs = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(dateMs) ? dateMs : NaN;
};

const formatSuspendedUntil = (value) => {
  const dateMs = toDateMs(value);
  if (!Number.isFinite(dateMs)) {
    return '';
  }

  return new Date(dateMs).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatPresenceLabel = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'ONLINE') {
    return 'Online';
  }
  if (normalized === 'BUSY') {
    return 'Busy';
  }
  return 'Offline';
};

const ChatSessionScreen = ({ navigation, route }) => {
  const { session: authSession } = useAuth();
  const payload = route?.params?.chatPayload;
  const host = route?.params?.host || {};
  const sessionId = payload?.session?.id;
  const currentUserId = authSession?.user?.id;
  const isListener = authSession?.user?.role === 'LISTENER';
  const isDemoSession = Boolean(authSession?.isDemoUser || payload?.demoMode);
  const isScreenFocused = useIsFocused();
  const [sessionStatus, setSessionStatus] = useState(normalizeChatStatus(payload?.session?.status));
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lowBalanceWarning, setLowBalanceWarning] = useState('');
  const [targetUserId, setTargetUserId] = useState(null);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [suspendedUntil, setSuspendedUntil] = useState(getSuspendedUntilFromSession(authSession));
  const [isConversationMuted, setIsConversationMuted] = useState(false);
  const [isCounterpartyBlocked, setIsCounterpartyBlocked] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [counterpartyPresence, setCounterpartyPresence] = useState(
    String(host?.isOnline ? 'ONLINE' : host?.availability || 'OFFLINE')
      .trim()
      .toUpperCase(),
  );
  const timerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const demoReplyTimeoutRef = useRef(null);
  const demoRemoteTypingTimeoutRef = useRef(null);
  const sessionEndedRef = useRef(false);
  const flatListRef = useRef(null);
  const blockedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState || 'active');
  const isChatVisibleRef = useRef(
    isScreenFocused && (AppState.currentState || 'active') === 'active',
  );

  const title = useMemo(() => host?.name || 'Conversation', [host?.name]);
  const avatar = useMemo(() => src(host?.avatar || host?.profileImageUrl), [host?.avatar, host?.profileImageUrl]);
  const listenerId = payload?.session?.listenerId || host?.listenerId || null;
  const counterpartyUserId = useMemo(
    () =>
      isListener
        ? payload?.session?.userId || host?.userId || null
        : payload?.session?.listenerId || host?.listenerId || null,
    [host?.listenerId, host?.userId, isListener, payload?.session?.listenerId, payload?.session?.userId],
  );

  useEffect(() => {
    const nextPresence = String(host?.isOnline ? 'ONLINE' : host?.availability || 'OFFLINE')
      .trim()
      .toUpperCase();
    if (nextPresence) {
      setCounterpartyPresence(nextPresence);
    }
  }, [host?.availability, host?.isOnline]);

  const isSuspended = useMemo(() => {
    const suspendedUntilMs = toDateMs(suspendedUntil);
    return Number.isFinite(suspendedUntilMs) && suspendedUntilMs > Date.now();
  }, [suspendedUntil]);

  useEffect(() => {
    const nextSuspendedUntil = getSuspendedUntilFromSession(authSession);
    if (nextSuspendedUntil) {
      setSuspendedUntil(nextSuspendedUntil);
    }
  }, [authSession]);

  useEffect(() => {
    blockedRef.current = isCounterpartyBlocked;
  }, [isCounterpartyBlocked]);

  useEffect(() => {
    isChatVisibleRef.current = isScreenFocused && appStateRef.current === 'active';
    logChatDebug('chatVisibilityChanged', {
      sessionId,
      isScreenFocused,
      appState: appStateRef.current,
      isVisible: isChatVisibleRef.current,
    });
  }, [isScreenFocused, sessionId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      isChatVisibleRef.current = isScreenFocused && nextState === 'active';
      logChatDebug('chatAppStateChanged', {
        sessionId,
        nextState,
        isScreenFocused,
        isVisible: isChatVisibleRef.current,
      });
    });

    return () => {
      subscription.remove();
    };
  }, [isScreenFocused, sessionId]);

  useEffect(() => {
    let cancelled = false;

    const hydrateInteractionPrefs = async () => {
      if (!currentUserId || !counterpartyUserId) {
        if (!cancelled) {
          setIsConversationMuted(false);
          setIsCounterpartyBlocked(false);
        }
        return;
      }

      const prefs = await getChatInteractionPrefs(currentUserId);
      if (cancelled) {
        return;
      }

      const muted = prefs.mutedConversationIds.includes(String(counterpartyUserId));
      const blocked = prefs.blockedUserIds.includes(String(counterpartyUserId));

      setIsConversationMuted(muted);
      setIsCounterpartyBlocked(blocked);
      blockedRef.current = blocked;
      logChatDebug('interactionPrefsLoaded', {
        sessionId,
        counterpartyUserId,
        muted,
        blocked,
      });
    };

    hydrateInteractionPrefs().catch((error) => {
      logChatDebug('interactionPrefsLoadFailed', {
        sessionId,
        counterpartyUserId,
        message: error?.message || 'Unknown error',
      });
    });

    return () => {
      cancelled = true;
    };
  }, [counterpartyUserId, currentUserId, sessionId]);

  // Allow the first message to send immediately while history loads.
  useEffect(() => {
    if (targetUserId) {
      return;
    }

    const sessionUserId = payload?.session?.userId || host?.userId || null;
    const sessionListenerId = payload?.session?.listenerId || host?.listenerId || null;
    const initialTarget = isListener ? sessionUserId : sessionListenerId;

    if (initialTarget) {
      setTargetUserId(initialTarget);
    }
  }, [host?.listenerId, host?.userId, isListener, payload?.session?.listenerId, payload?.session?.userId, targetUserId]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback((initialSeconds = 0) => {
    stopTimer();
    setElapsedSeconds(initialSeconds);
    logChatDebug('chatTimerStarted', {
      sessionId,
      initialSeconds,
      startedAt: new Date().toISOString(),
    });
    timerRef.current = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
  }, [sessionId, stopTimer]);

  useEffect(() => {
    sessionEndedRef.current = false;
    setMessages([]);
    setInputValue('');
    setLowBalanceWarning('');
    setRemoteTyping(false);
    setIsSendingMessage(false);
    setElapsedSeconds(0);
    stopTimer();
    logChatDebug('chatSessionStateReset', {
      sessionId,
    });
  }, [sessionId, stopTimer]);

  const updateMessages = useCallback((updater) => {
    setMessages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return Array.isArray(next) ? next : prev;
    });
  }, []);

  const markMessagesRead = useCallback(async (messageIds = [], options = {}) => {
    if (!messageIds.length) return;

    const force = options?.force === true;
    if (!force && !isChatVisibleRef.current) {
      logChatDebug('readReceiptDeferred', {
        sessionId,
        messageCount: messageIds.length,
        reason: 'chat_not_visible',
      });
      return;
    }

    updateMessages((prev) =>
      prev.map((item) =>
        messageIds.includes(item.id)
          ? {
              ...item,
              status: 'READ',
              readAt: item.readAt || new Date().toISOString(),
            }
          : item,
      ),
    );
    try {
      await emitWithAck('chat_read', { sessionId, messageIds });
      logChatDebug('readReceiptUpdated', {
        sessionId,
        messageCount: messageIds.length,
        force,
      });
    } catch (_error) {}
  }, [sessionId, updateMessages]);

  const appendMessage = useCallback((message) => {
    if (!message?.id) return;
    updateMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
  }, [updateMessages]);

  useEffect(() => {
    if (!sessionId || !isScreenFocused || appStateRef.current !== 'active') {
      return;
    }

    const unreadIds = messages
      .filter((item) => item?.receiverId === currentUserId && item?.status !== 'READ')
      .map((item) => item.id);

    if (!unreadIds.length) {
      return;
    }

    logChatDebug('unreadBadgeSyncStart', {
      sessionId,
      unreadCount: unreadIds.length,
      source: 'screen_visible',
    });
    markMessagesRead(unreadIds, { force: true });
  }, [currentUserId, isScreenFocused, markMessagesRead, messages, sessionId]);

  const emitTyping = useCallback((isTyping) => {
    const socket = getRealtimeSocket();
    if (socket && sessionId) socket.emit('chat_typing', { sessionId, isTyping: Boolean(isTyping) });
  }, [sessionId]);

  const onInputChange = (text) => {
    setInputValue(text);
    if (!sessionId || sessionStatus !== 'ACTIVE') return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitTyping(Boolean(text.trim()));
    if (text.trim()) typingTimeoutRef.current = setTimeout(() => emitTyping(false), 1200);
  };

  const handleSessionEnded = useCallback((eventPayload) => {
    if (eventPayload?.sessionId !== sessionId || sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    emitTyping(false);
    stopTimer();
    setElapsedSeconds(0);
    setIsSendingMessage(false);
    setSessionStatus('ENDED');
    logChatDebug('chatSessionEnded', {
      sessionId,
      endReason: eventPayload?.endReason || null,
      reasonCode: eventPayload?.reasonCode || null,
    });
    if (eventPayload?.reasonCode === 'LOW_BALANCE') {
      Alert.alert('Insufficient Balance', 'You do not have sufficient balance. Please recharge your wallet to continue.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } else {
      navigation.goBack();
    }
  }, [emitTyping, navigation, sessionId, stopTimer]);

  useEffect(() => {
    if (isDemoSession) {
      const bootstrapDemo = async () => {
        if (!sessionId) {
          Alert.alert('Chat unavailable', 'Unable to start demo chat right now.');
          navigation.goBack();
          return;
        }

        const history = await getChatMessages(sessionId);
        const historyMessages = history?.messages || [];
        const liveSession = history?.session || payload?.session || {};
        const otherUserId = liveSession?.listenerId || host?.listenerId || null;

        setMessages(historyMessages);
        setSessionStatus(normalizeChatStatus(liveSession?.status || 'ACTIVE'));
        setTargetUserId(otherUserId);

        if (liveSession?.startedAt) {
          startTimer(
            Math.max(0, Math.floor((Date.now() - new Date(liveSession.startedAt).getTime()) / 1000)),
          );
        } else {
          startTimer(0);
        }
      };

      bootstrapDemo().catch((error) => {
        Alert.alert('Chat unavailable', error?.message || 'Unable to start demo chat right now.');
        navigation.goBack();
      });

      return () => {
        emitTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (demoReplyTimeoutRef.current) clearTimeout(demoReplyTimeoutRef.current);
        if (demoRemoteTypingTimeoutRef.current) clearTimeout(demoRemoteTypingTimeoutRef.current);
        stopTimer();
      };
    }

    if (!authSession?.accessToken) {
      resetToAuthEntry();
      return undefined;
    }
    if (!sessionId) {
      Alert.alert('Chat unavailable', 'Unable to start chat session right now.');
      navigation.goBack();
      return undefined;
    }
    let socket = getRealtimeSocket();
    if (!socket) socket = connectRealtimeSocket(authSession.accessToken);

    const bootstrap = async () => {
      try {
        const history = await getChatMessages(sessionId);
        const historyMessages = history?.messages || [];
        setMessages(historyMessages);
        const liveSession = history?.session || payload?.session || {};
        setSessionStatus(
          normalizeChatStatus(liveSession?.status || payload?.session?.status || 'ACTIVE'),
        );
        const otherUserId = currentUserId === liveSession?.userId ? liveSession?.listenerId : liveSession?.userId;
        setTargetUserId(otherUserId || host?.userId || null);
        if (liveSession?.startedAt) startTimer(Math.max(0, Math.floor((Date.now() - new Date(liveSession.startedAt).getTime()) / 1000)));
        const unreadIds = historyMessages.filter((item) => item?.receiverId === currentUserId && item?.status !== 'READ').map((item) => item.id);
        markMessagesRead(unreadIds, { force: true });
      } catch (error) {
        if (!isUnauthorizedApiError(error)) setMessages([]);
      }

      try {
        let chatToken = payload?.agora?.token;
        let chatAppKey = payload?.agora?.appKey || payload?.agora?.appId || AGORA_CHAT_APP_KEY;
        if (!chatToken) {
          const refreshed = await refreshChatToken(sessionId);
          chatToken = refreshed?.agora?.token;
          chatAppKey = refreshed?.agora?.appKey || refreshed?.agora?.appId || chatAppKey;
        }
        if (chatToken && chatAppKey && currentUserId) {
          await initAgoraChatSession({
            appKey: chatAppKey,
            userId: currentUserId,
            token: chatToken,
            onMessagesReceived: () => {},
            onTokenWillExpire: async () => {
              try {
                const refreshed = await refreshChatToken(sessionId);
                if (refreshed?.agora?.token) await renewAgoraChatToken(refreshed.agora.token);
              } catch (_error) {}
            },
            onTokenDidExpire: async () => {
              try {
                const refreshed = await refreshChatToken(sessionId);
                if (refreshed?.agora?.token) await renewAgoraChatToken(refreshed.agora.token);
              } catch (_error) {}
            },
          });
        }
      } catch (error) {
        if (!isUnauthorizedApiError(error)) console.warn('[ChatSession] Agora chat init skipped', error?.message || 'init failed');
      }
    };

    const onChatStarted = (eventPayload) => {
      if (eventPayload?.sessionId === sessionId) {
        setSessionStatus('ACTIVE');
        const startedAt = eventPayload?.startedAt || new Date().toISOString();
        const initialSeconds = Math.max(
          0,
          Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
        );
        startTimer(initialSeconds);
        logChatDebug('chatStartedEventHandled', {
          sessionId,
          startedAt,
          timerInitialSeconds: initialSeconds,
          localTimestamp: new Date().toISOString(),
        });
      }
    };
    const onChatMessage = (message) => {
      if (message?.sessionId !== sessionId) return;
      if (
        blockedRef.current &&
        String(message?.senderId || '') === String(counterpartyUserId || '')
      ) {
        logChatDebug('messageIgnoredFromBlockedUser', {
          sessionId,
          messageId: message?.id || null,
          senderId: message?.senderId || null,
        });
        return;
      }
      logChatDebug('messageReceived', {
        sessionId: message?.sessionId || null,
        messageId: message?.id || null,
        senderId: message?.senderId || null,
      });
      appendMessage(message);
      if (message?.receiverId === currentUserId) {
        if (isChatVisibleRef.current) {
          markMessagesRead([message.id], { force: true });
        } else {
          logChatDebug('readReceiptDeferred', {
            sessionId,
            messageId: message?.id || null,
            reason: 'incoming_message_when_not_visible',
          });
        }
      }
    };
    const onChatRead = (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) return;
      const messageIds = Array.isArray(eventPayload?.messageIds)
        ? eventPayload.messageIds.filter(Boolean)
        : [];
      if (!messageIds.length) {
        return;
      }
      updateMessages((prev) =>
        prev.map((item) =>
          messageIds.includes(item.id)
            ? { ...item, status: 'READ', readAt: item.readAt || new Date().toISOString() }
            : item,
        ),
      );
      logChatDebug('readReceiptSynced', {
        sessionId,
        readerId: eventPayload?.readerId || null,
        messageCount: messageIds.length,
      });
    };
    const onTyping = (eventPayload) => { if (eventPayload?.sessionId === sessionId && eventPayload?.senderId !== currentUserId) setRemoteTyping(Boolean(eventPayload?.isTyping)); };
    const onLowBalance = (eventPayload) => { if (eventPayload?.sessionId === sessionId) setLowBalanceWarning(eventPayload?.message || 'Low balance. Please recharge to avoid disconnection.'); };
    const onListenerStatusChanged = (eventPayload) => {
      if (isListener || String(eventPayload?.listenerId || '') !== String(counterpartyUserId || '')) {
        return;
      }
      const status = String(eventPayload?.status || eventPayload?.availability || 'OFFLINE')
        .trim()
        .toUpperCase();
      if (!status) {
        return;
      }
      setCounterpartyPresence(status);
      logChatDebug('presenceUpdate', {
        sessionId,
        counterpartyUserId,
        status,
        source: 'listener_status_changed',
      });
    };
    const onUserOnline = (eventPayload) => {
      if (!isListener || String(eventPayload?.userId || '') !== String(counterpartyUserId || '')) {
        return;
      }
      setCounterpartyPresence('ONLINE');
      logChatDebug('presenceUpdate', {
        sessionId,
        counterpartyUserId,
        status: 'ONLINE',
        source: 'user_online',
      });
    };
    const onUserOffline = (eventPayload) => {
      if (!isListener || String(eventPayload?.userId || '') !== String(counterpartyUserId || '')) {
        return;
      }
      setCounterpartyPresence('OFFLINE');
      logChatDebug('presenceUpdate', {
        sessionId,
        counterpartyUserId,
        status: 'OFFLINE',
        source: 'user_offline',
      });
    };

    bootstrap();
    socket.on('chat_started', onChatStarted);
    socket.on('chat_message', onChatMessage);
    socket.on('chat_read', onChatRead);
    socket.on('chat_typing', onTyping);
    socket.on('chat_low_balance_warning', onLowBalance);
    socket.on('chat_end_due_to_low_balance', handleSessionEnded);
    socket.on('chat_ended', handleSessionEnded);
    socket.on('listener_status_changed', onListenerStatusChanged);
    socket.on('host_status_changed', onListenerStatusChanged);
    socket.on('user_online', onUserOnline);
    socket.on('user_offline', onUserOffline);
    socket.emit('join_chat_session', { sessionId });

    return () => {
      emitTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.off('chat_started', onChatStarted);
      socket.off('chat_message', onChatMessage);
      socket.off('chat_read', onChatRead);
      socket.off('chat_typing', onTyping);
      socket.off('chat_low_balance_warning', onLowBalance);
      socket.off('chat_end_due_to_low_balance', handleSessionEnded);
      socket.off('chat_ended', handleSessionEnded);
      socket.off('listener_status_changed', onListenerStatusChanged);
      socket.off('host_status_changed', onListenerStatusChanged);
      socket.off('user_online', onUserOnline);
      socket.off('user_offline', onUserOffline);
      stopTimer();
      leaveAgoraChatSession().catch(() => {});
    };
  }, [
    appendMessage,
    authSession?.accessToken,
    counterpartyUserId,
    currentUserId,
    emitTyping,
    handleSessionEnded,
    host?.listenerId,
    host?.userId,
    isDemoSession,
    isListener,
    markMessagesRead,
    navigation,
    updateMessages,
    payload?.agora?.appId,
    payload?.agora?.appKey,
    payload?.agora?.token,
    payload?.session,
    counterpartyUserId,
    sessionId,
    startTimer,
    stopTimer,
  ]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages, remoteTyping]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = (event) => {
      logChatDebug('keyboardShown', {
        height: event?.endCoordinates?.height ?? null,
      });

      // Keep the latest message visible above the keyboard.
      requestAnimationFrame(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 60);
      });
    };

    const onKeyboardHide = () => {
      logChatDebug('keyboardHidden', {});
    };

    const showSubscription = Keyboard.addListener(showEvent, onKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, onKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const onSendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !targetUserId || isSendingMessage) return;
    if (isCounterpartyBlocked) {
      return Alert.alert(
        'Blocked contact',
        'Unblock this contact from the menu before sending messages.',
      );
    }
    if (isSuspended) {
      const until = formatSuspendedUntil(suspendedUntil);
      return Alert.alert(
        'Account suspended',
        until ? `${SUSPENSION_MESSAGE}\n\nSuspended until ${until}.` : SUSPENSION_MESSAGE,
      );
    }

    const normalizedStatus = String(sessionStatus || '').toUpperCase();
    if (['ENDED', 'CANCELLED', 'REJECTED'].includes(normalizedStatus)) {
      return Alert.alert('Chat ended', 'This conversation is no longer active.');
    }

    setIsSendingMessage(true);

    if (isDemoSession) {
      try {
        const sent = await addDemoChatMessage(sessionId, {
          senderId: currentUserId || 'demo-user-1',
          receiverId: targetUserId,
          content: trimmed,
          status: 'READ',
        });

        appendMessage(sent);
        setInputValue('');
        setRemoteTyping(false);
        emitTyping(false);

        if (demoReplyTimeoutRef.current) clearTimeout(demoReplyTimeoutRef.current);
        if (demoRemoteTypingTimeoutRef.current) clearTimeout(demoRemoteTypingTimeoutRef.current);

        demoRemoteTypingTimeoutRef.current = setTimeout(() => {
          setRemoteTyping(true);
        }, 450);

        demoReplyTimeoutRef.current = setTimeout(async () => {
          const reply = await addDemoChatReply(
            sessionId,
            'Demo reply: you can explore the chat UI safely without live billing or OTP.',
          );
          appendMessage(reply);
          setRemoteTyping(false);
        }, 1500);
      } finally {
        setIsSendingMessage(false);
      }

      return;
    }

    try {
      logChatDebug('messageSendStart', {
        sessionId,
        receiverId: targetUserId,
        contentLength: trimmed.length,
      });
      const sent = await emitWithAck('chat_message', { sessionId, receiverId: targetUserId, content: trimmed, messageType: 'text' });
      appendMessage(sent);
      logChatDebug('messageSendSuccess', {
        sessionId,
        messageId: sent?.id || null,
      });
      if (normalizedStatus !== 'ACTIVE') {
        setSessionStatus('ACTIVE');
      }
      setInputValue('');
      setRemoteTyping(false);
      emitTyping(false);
    } catch (error) {
      logChatDebug('messageSendFailure', {
        sessionId,
        code: error?.code || error?.response?.data?.code || null,
        message: error?.message || 'Unknown error',
      });
      if (isUnauthorizedApiError(error)) return;

      const errorCode = getErrorCode(error);
      if (SUSPENSION_CODES.has(errorCode)) {
        const nextSuspendedUntil = getSuspendedUntilFromError(error);
        if (nextSuspendedUntil) {
          setSuspendedUntil(nextSuspendedUntil);
        }

        const until = formatSuspendedUntil(nextSuspendedUntil || suspendedUntil);
        Alert.alert(
          'Account suspended',
          until ? `${SUSPENSION_MESSAGE}\n\nSuspended until ${until}.` : SUSPENSION_MESSAGE,
        );
        return;
      }

      Alert.alert(errorCode === 'INSUFFICIENT_BALANCE' ? 'Insufficient Balance' : 'Message failed', error?.message || 'Unable to send message right now.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const onEndChat = async () => {
    if (isDemoSession) {
      emitTyping(false);
      stopTimer();
      await endChatSession(sessionId, isListener ? 'LISTENER_ENDED' : 'USER_ENDED');
      navigation.goBack();
      return;
    }

    try {
      await endChatSession(sessionId, isListener ? 'LISTENER_ENDED' : 'USER_ENDED');
      await emitWithAck('chat_ended', { sessionId, endReason: isListener ? 'LISTENER_ENDED' : 'USER_ENDED' }).catch(() => {});
    } catch (_error) {
    } finally {
      emitTyping(false);
      stopTimer();
      setElapsedSeconds(0);
      setIsSendingMessage(false);
      setSessionStatus('ENDED');
      await leaveAgoraChatSession().catch(() => {});
      navigation.goBack();
    }
  };

  const onStartCallByType = async (callType = 'audio') => {
    const normalizedCallType = callType === 'video' ? 'video' : 'audio';

    if (isCounterpartyBlocked) {
      return Alert.alert(
        'Blocked contact',
        `Unblock this contact from the menu before starting a ${normalizedCallType} call.`,
      );
    }

    if (isListener || !listenerId) {
      return Alert.alert(
        normalizedCallType === 'video'
          ? 'Video call unavailable'
          : 'Voice call unavailable',
        `${normalizedCallType === 'video' ? 'Video' : 'Voice'} call can be started from the user side only.`,
      );
    }
    try {
      const permissionResult =
        normalizedCallType === 'video'
          ? await requestVideoCallPermissions()
          : await requestCallAudioPermissions();
      logChatDebug(
        normalizedCallType === 'video'
          ? 'videoPermissionPreflight'
          : 'microphonePermissionPreflight',
        {
        listenerId,
        callType: normalizedCallType,
        granted: permissionResult?.granted === true,
        permissions: permissionResult?.permissions || null,
        source: 'ChatSessionScreen.onStartCallByType',
      },
      );
      if (!permissionResult?.granted) {
        Alert.alert(
          normalizedCallType === 'video'
            ? 'Camera and microphone permission needed'
            : 'Microphone permission needed',
          normalizedCallType === 'video'
            ? 'Enable camera and microphone permission to start a video call.'
            : 'Enable microphone permission to start a voice call.',
        );
        return;
      }

      logChatDebug('callRequestStart', {
        listenerId,
        callType: normalizedCallType,
      });
      const callPayload = await requestCall(listenerId, {
        callType: normalizedCallType,
      });
      logChatDebug('callRequestSuccess', {
        sessionId: callPayload?.session?.id || null,
        listenerId,
        callType:
          callPayload?.session?.callType || normalizedCallType,
      });
      navigation.navigate('CallSession', { callPayload, host });
    } catch (error) {
      logChatDebug('callRequestFailure', {
        listenerId,
        callType: normalizedCallType,
        message: error?.response?.data?.message || error?.message || 'Unknown error',
      });
      const errorCode = getErrorCode(error);
      if (SUSPENSION_CODES.has(errorCode)) {
        const nextSuspendedUntil = getSuspendedUntilFromError(error);
        if (nextSuspendedUntil) {
          setSuspendedUntil(nextSuspendedUntil);
        }
        const until = formatSuspendedUntil(nextSuspendedUntil || suspendedUntil);
        Alert.alert(
          'Account suspended',
          until ? `${SUSPENSION_MESSAGE}\n\nSuspended until ${until}.` : SUSPENSION_MESSAGE,
        );
        return;
      }
      if (!isUnauthorizedApiError(error)) {
        Alert.alert('Call unavailable', getCallStatusMessageFromError(error));
      }
    }
  };

  const subtitle = isSuspended
    ? 'Account temporarily suspended'
    : remoteTyping
      ? 'Typing...'
      : sessionStatus === 'ACTIVE'
        ? formatPresenceLabel(counterpartyPresence)
        : sessionStatus === 'ENDED'
          ? 'Conversation ended'
          : isDemoSession
            ? 'Demo session ready'
            : 'Waiting to connect';
  const onToggleConversationMute = useCallback(async () => {
    if (!currentUserId || !counterpartyUserId) {
      return;
    }

    const nextMuted = !isConversationMuted;
    await setConversationMuted({
      currentUserId,
      counterpartyId: counterpartyUserId,
      muted: nextMuted,
    });

    setIsConversationMuted(nextMuted);
    logChatDebug('conversationMuteChanged', {
      sessionId,
      counterpartyUserId,
      muted: nextMuted,
    });
  }, [counterpartyUserId, currentUserId, isConversationMuted, sessionId]);

  const onToggleBlockedUser = useCallback(async () => {
    if (!currentUserId || !counterpartyUserId) {
      return;
    }

    const nextBlocked = !isCounterpartyBlocked;
    await setUserBlocked({
      currentUserId,
      counterpartyId: counterpartyUserId,
      blocked: nextBlocked,
    });

    setIsCounterpartyBlocked(nextBlocked);
    blockedRef.current = nextBlocked;
    logChatDebug('blockStateChanged', {
      sessionId,
      counterpartyUserId,
      blocked: nextBlocked,
    });
  }, [counterpartyUserId, currentUserId, isCounterpartyBlocked, sessionId]);

  const onOpenCallHistory = useCallback(async () => {
    if (!authSession?.accessToken || !counterpartyUserId) {
      return;
    }

    try {
      const history = await getCallSessions({
        page: 1,
        limit: 50,
        status: ['REQUESTED', 'RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'REJECTED', 'CANCELLED'],
      });

      const callItems = (history?.items || []).filter((item) => {
        const participantId = isListener ? item?.userId : item?.listenerId;
        return String(participantId || '') === String(counterpartyUserId);
      });

      if (!callItems.length) {
        Alert.alert('Call history', 'No call history found for this conversation.');
        return;
      }

      const totalDuration = callItems.reduce(
        (acc, item) => acc + Number(item?.durationSeconds || 0),
        0,
      );
      const latestCall = callItems[0];
      const latestCallAt =
        latestCall?.endedAt ||
        latestCall?.updatedAt ||
        latestCall?.startedAt ||
        latestCall?.requestedAt ||
        latestCall?.createdAt ||
        null;
      const historyLines = callItems.slice(0, 8).map((item) => {
        const at =
          item?.endedAt ||
          item?.updatedAt ||
          item?.startedAt ||
          item?.requestedAt ||
          item?.createdAt ||
          new Date().toISOString();
        const status = String(item?.status || 'UNKNOWN').toUpperCase();
        const callType = String(item?.callType || 'audio').toUpperCase();
        return `${callType} ${status} - ${time(at)} - ${duration(Number(item?.durationSeconds || 0))}`;
      });

      Alert.alert(
        'Call history',
        `Total calls: ${callItems.length}\nTotal duration: ${duration(totalDuration)}\nLast call: ${time(
          latestCallAt || new Date().toISOString(),
        )}\nLatest status: ${String(latestCall?.status || 'UNKNOWN').toUpperCase()}\n\nRecent:\n${historyLines.join('\n')}`,
      );
      logChatDebug('callHistoryOpened', {
        sessionId,
        counterpartyUserId,
        totalCalls: callItems.length,
        totalDuration,
      });
    } catch (error) {
      logChatDebug('callHistoryOpenFailed', {
        sessionId,
        counterpartyUserId,
        message: error?.response?.data?.message || error?.message || 'Unknown error',
      });
      if (!isUnauthorizedApiError(error)) {
        Alert.alert('Call history', 'Unable to load call history right now.');
      }
    }
  }, [authSession?.accessToken, counterpartyUserId, isListener, sessionId]);

  const onOpenCounterpartyProfile = useCallback(() => {
    const profileData = {
      id: counterpartyUserId || null,
      name: host?.name || 'Profile',
      avatar: host?.avatar || host?.profileImageUrl || null,
      role: isListener ? 'USER' : 'LISTENER',
      availability: counterpartyPresence,
      source: 'chat_header',
    };

    logChatDebug('profileOpenAttempt', {
      sessionId,
      counterpartyUserId,
      role: profileData.role,
      availability: counterpartyPresence,
    });

    if (!counterpartyUserId) {
      Alert.alert('Profile unavailable', 'Profile details are missing for this conversation.');
      return;
    }

    if (isListener) {
      Alert.alert(
        profileData.name,
        `Role: ${profileData.role}\nStatus: ${formatPresenceLabel(counterpartyPresence)}`,
      );
      return;
    }

    navigation.navigate('MainDrawer', {
      screen: 'Profile',
      params: {
        profileMode: 'counterparty',
        profileData,
      },
    });
  }, [
    counterpartyPresence,
    counterpartyUserId,
    host?.avatar,
    host?.name,
    host?.profileImageUrl,
    isListener,
    navigation,
    sessionId,
  ]);

  const onReportCounterparty = useCallback(async () => {
    if (!sessionId || !counterpartyUserId) {
      Alert.alert('Report failed', 'Unable to identify the user to report.');
      return;
    }

    logChatDebug('reportActionTriggered', {
      sessionId,
      counterpartyUserId,
    });

    try {
      await apiClient.post('/chat/report', {
        sessionId,
        reportedUserId: counterpartyUserId,
        reason: 'Inappropriate behavior reported from chat menu',
      });
      logChatDebug('reportActionSuccess', {
        sessionId,
        counterpartyUserId,
      });
      Alert.alert('Report submitted', 'Thanks. Our team will review this report.');
    } catch (error) {
      logChatDebug('reportActionFailed', {
        sessionId,
        counterpartyUserId,
        message: error?.response?.data?.message || error?.message || 'Unknown error',
      });
      if (!isUnauthorizedApiError(error)) {
        Alert.alert('Report failed', 'Unable to submit report right now. Please try again.');
      }
    }
  }, [counterpartyUserId, sessionId]);

  const onOpenMenu = () => {
    Alert.alert(title, 'Choose an action for this conversation.', [
      {
        text: isConversationMuted ? 'Unmute' : 'Mute',
        onPress: () => {
          onToggleConversationMute().catch(() => {});
        },
      },
      {
        text: isCounterpartyBlocked ? 'Unblock' : 'Block',
        style: isCounterpartyBlocked ? 'default' : 'destructive',
        onPress: () => {
          onToggleBlockedUser().catch(() => {});
        },
      },
      {
        text: 'Call history',
        onPress: () => {
          onOpenCallHistory().catch(() => {});
        },
      },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          onReportCounterparty().catch(() => {});
        },
      },
      { text: 'End chat', style: 'destructive', onPress: onEndChat },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <LinearGradient colors={['#08040F', '#12071A', '#1A0A24']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          enabled
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerMain}
              activeOpacity={0.9}
              onPress={onOpenCounterpartyProfile}
            >
              <Image source={avatar} style={styles.headerAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.headerName}>{title}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, sessionStatus === 'ACTIVE' || remoteTyping ? styles.statusDotOn : styles.statusDotOff]} />
                  <Text style={styles.headerStatus}>{subtitle}</Text>
                </View>
              </View>
            </TouchableOpacity>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => onStartCallByType('audio')} activeOpacity={0.85}><Ionicons name="call-outline" size={18} color={theme.colors.textPrimary} /></TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => onStartCallByType('video')} activeOpacity={0.85}><Ionicons name="videocam-outline" size={18} color={theme.colors.textPrimary} /></TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={onOpenMenu} activeOpacity={0.85}><Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textPrimary} /></TouchableOpacity>
            </View>
          </View>

          {lowBalanceWarning ? <View style={styles.warning}><Ionicons name="alert-circle" size={16} color={theme.colors.warning} /><Text style={styles.warningText}>{lowBalanceWarning}</Text></View> : null}
          {isSuspended ? (
            <View style={styles.suspensionWarning}>
              <Ionicons name="ban" size={16} color="#FF5F7A" />
              <Text style={styles.suspensionWarningText}>
                {formatSuspendedUntil(suspendedUntil)
                  ? `Suspended until ${formatSuspendedUntil(suspendedUntil)}`
                  : SUSPENSION_MESSAGE}
              </Text>
            </View>
          ) : null}

          <View style={styles.chatSurface}>
            <View style={styles.pattern}>
              {PATTERN.map((item, index) => <View key={`pattern-${index}`} style={[styles.patternBubble, { top: item.t, left: item.l, width: item.s, height: item.s, borderRadius: item.s / 2 }]} />)}
            </View>

            <FlatList
              ref={flatListRef}
              style={styles.messageListView}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const mine = item?.senderId === currentUserId;
                return (
                  <View style={[styles.messageWrap, mine ? styles.messageWrapMine : styles.messageWrapOther]}>
                    <View style={[styles.messageBubble, mine ? styles.messageMine : styles.messageOther]}>
                      <Text style={styles.messageText}>{item?.content || ''}</Text>
                      <Text style={styles.messageTime}>{time(item?.createdAt)}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={<View style={styles.emptyWrap}><Text style={styles.emptyText}>Start conversation...</Text><Text style={styles.emptySub}>{sessionStatus === 'ACTIVE' ? 'Send a message to begin.' : 'Messages will appear here as soon as the chat goes live.'}</Text></View>}
              ListFooterComponent={remoteTyping ? <View style={styles.typingWrap}><View style={styles.typingBubble}><Text style={styles.typingText}>{title} is typing...</Text></View></View> : <View style={{ height: 8 }} />}
              contentContainerStyle={[styles.messageList, !messages.length && !remoteTyping ? styles.messageListEmpty : null]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          </View>

          <View style={styles.footerMeta}>
            <Text style={styles.footerStatus}>{sessionStatus === 'ACTIVE' ? `Live for ${duration(elapsedSeconds)}` : subtitle}</Text>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              value={inputValue}
              onChangeText={onInputChange}
              placeholder="Message..."
              placeholderTextColor="rgba(255,255,255,0.34)"
              style={styles.input}
              multiline
              editable={!isSuspended}
              onFocus={() => {
                requestAnimationFrame(() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                });
              }}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!inputValue.trim() || isSuspended || isSendingMessage) && styles.sendBtnDisabled,
              ]}
              onPress={onSendMessage}
              activeOpacity={0.85}
              disabled={!inputValue.trim() || isSuspended || isSendingMessage}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 }, safeArea: { flex: 1 }, flex: { flex: 1, minHeight: 0, paddingHorizontal: 14, paddingBottom: 12 },
  header: { marginTop: 6, flexDirection: 'row', alignItems: 'center' }, headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center' }, headerAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: theme.colors.magenta, marginRight: 10 }, headerName: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' }, statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 }, statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 }, statusDotOn: { backgroundColor: theme.colors.success }, statusDotOff: { backgroundColor: 'rgba(255,255,255,0.28)' }, headerStatus: { color: theme.colors.textSecondary, fontSize: 12 },
  headerActions: { flexDirection: 'row', gap: 8 }, iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.borderSoft, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  warning: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,184,0,0.4)', backgroundColor: 'rgba(255,184,0,0.12)', paddingHorizontal: 12, paddingVertical: 8 }, warningText: { color: theme.colors.warning, fontSize: 13, flex: 1 },
  suspensionWarning: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,95,122,0.45)', backgroundColor: 'rgba(255,95,122,0.16)', paddingHorizontal: 12, paddingVertical: 8 },
  suspensionWarningText: { color: theme.colors.textPrimary, fontSize: 13, flex: 1 },
  chatSurface: { flex: 1, minHeight: 0, marginTop: 14, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(8,15,26,0.82)' }, pattern: { ...StyleSheet.absoluteFillObject }, patternBubble: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', backgroundColor: 'rgba(255,255,255,0.015)' },
  messageListView: { flex: 1, minHeight: 0 },
  messageList: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 18 }, messageListEmpty: { flexGrow: 1, justifyContent: 'center' }, messageWrap: { marginBottom: 10 }, messageWrapMine: { alignItems: 'flex-end' }, messageWrapOther: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 }, messageMine: { backgroundColor: 'rgba(255,42,163,0.24)', borderWidth: 1, borderColor: 'rgba(255,42,163,0.55)' }, messageOther: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  messageText: { color: theme.colors.textPrimary, fontSize: 14, lineHeight: 20 }, messageTime: { marginTop: 5, color: 'rgba(255,255,255,0.46)', fontSize: 11, alignSelf: 'flex-end' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }, emptyText: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' }, emptySub: { marginTop: 8, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  typingWrap: { alignItems: 'flex-start', marginTop: 6 }, typingBubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }, typingText: { color: theme.colors.textSecondary, fontSize: 12 },
  footerMeta: { marginTop: 10, alignItems: 'center' }, footerStatus: { color: theme.colors.textSecondary, fontSize: 12 },
  inputRow: { marginTop: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(9,10,20,0.95)', paddingLeft: 16, paddingRight: 8, paddingVertical: 8 }, input: { flex: 1, color: theme.colors.textPrimary, fontSize: 15, maxHeight: 100, paddingVertical: 6 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.magenta }, sendBtnDisabled: { opacity: 0.45 },
});

export default ChatSessionScreen;
