import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { AGORA_CHAT_APP_KEY } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import AppLogo from '../components/AppLogo';
import {
  connectRealtimeSocket,
  emitWithAck,
  getRealtimeSocket,
} from '../services/realtimeSocket';
import {
  endChatSession,
  getChatMessages,
  refreshChatToken,
} from '../services/sessionApi';
import {
  initAgoraChatSession,
  leaveAgoraChatSession,
  renewAgoraChatToken,
} from '../services/agoraChatService';

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const ChatSessionScreen = ({ navigation, route }) => {
  const { session: authSession } = useAuth();
  const payload = route?.params?.chatPayload;
  const host = route?.params?.host;
  const sessionId = payload?.session?.id;
  const [sessionStatus, setSessionStatus] = useState(payload?.session?.status || 'REQUESTED');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lowBalanceWarning, setLowBalanceWarning] = useState('');
  const [isChatReady, setIsChatReady] = useState(false);
  const [targetUserId, setTargetUserId] = useState(null);
  const timerRef = useRef(null);
  const sessionEndedRef = useRef(false);
  const lastAgoraTokenRef = useRef(payload?.agora?.token || '');

  const currentUserId = authSession?.user?.id;
  const isListener = authSession?.user?.role === 'LISTENER';

  useEffect(() => {
    const userId = payload?.session?.userId;
    const listenerId = payload?.session?.listenerId;

    if (!currentUserId) {
      return;
    }

    if (currentUserId === userId) {
      setTargetUserId(listenerId || host?.listenerId || host?.userId || null);
      return;
    }

    setTargetUserId(userId || host?.userId || null);
  }, [currentUserId, host?.listenerId, host?.userId, payload?.session?.listenerId, payload?.session?.userId]);

  const title = useMemo(() => host?.name || 'Support Chat', [host?.name]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, [stopTimer]);

  const appendMessage = useCallback((message) => {
    if (!message?.id) {
      return;
    }

    setMessages((prev) => {
      if (prev.some((item) => item.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  const handleSessionEnded = useCallback(
    (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId || sessionEndedRef.current) {
        return;
      }

      sessionEndedRef.current = true;
      stopTimer();
      setSessionStatus('ENDED');

      if (eventPayload?.reasonCode === 'LOW_BALANCE') {
        Alert.alert(
          'Insufficient Balance',
          'You do not have sufficient balance. Please recharge your wallet to continue.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        navigation.goBack();
      }
    },
    [navigation, sessionId, stopTimer],
  );

  useEffect(() => {
    if (!sessionId || !authSession?.accessToken) {
      Alert.alert('Chat unavailable', 'Unable to start chat session right now.');
      navigation.goBack();
      return undefined;
    }

    let socket = getRealtimeSocket();
    if (!socket) {
      socket = connectRealtimeSocket(authSession.accessToken);
    }

    const bootstrap = async () => {
      try {
        const history = await getChatMessages(sessionId);
        setMessages(history?.messages || []);
        const sessionMeta = history?.session;
        if (currentUserId && sessionMeta) {
          if (currentUserId === sessionMeta.userId) {
            setTargetUserId(sessionMeta.listenerId || null);
          } else {
            setTargetUserId(sessionMeta.userId || null);
          }
        }
      } catch (_error) {
        setMessages([]);
      }

      try {
        let chatToken = payload?.agora?.token;
        let chatAppKey =
          payload?.agora?.appKey ||
          payload?.agora?.appId ||
          AGORA_CHAT_APP_KEY;

        if (!chatToken) {
          const refreshed = await refreshChatToken(sessionId);
          chatToken = refreshed?.agora?.token;
          chatAppKey =
            refreshed?.agora?.appKey ||
            refreshed?.agora?.appId ||
            chatAppKey;
        }

        const chatInit = await initAgoraChatSession({
          appKey: chatAppKey,
          userId: currentUserId,
          token: chatToken,
          onMessagesReceived: () => {
            // Backend socket remains source-of-truth for persisted message stream.
          },
          onTokenWillExpire: async () => {
            try {
              const refreshed = await refreshChatToken(sessionId);
              lastAgoraTokenRef.current = refreshed?.agora?.token || lastAgoraTokenRef.current;
              if (refreshed?.agora?.token) {
                await renewAgoraChatToken(refreshed.agora.token);
              }
            } catch (_error) {
              // Backend will end session if token refresh fails during active chat.
            }
          },
          onTokenDidExpire: async () => {
            try {
              const refreshed = await refreshChatToken(sessionId);
              lastAgoraTokenRef.current = refreshed?.agora?.token || lastAgoraTokenRef.current;
              if (refreshed?.agora?.token) {
                await renewAgoraChatToken(refreshed.agora.token);
              }
            } catch (_error) {
              // Let session lifecycle events drive UI if token cannot be renewed.
            }
          },
        });

        setIsChatReady(Boolean(chatInit?.connected));
      } catch (_error) {
        setIsChatReady(false);
      }
    };

    const onChatAccepted = (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) {
        return;
      }
      setSessionStatus('ACTIVE');
      startTimer();
    };

    const onChatStarted = (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) {
        return;
      }
      setSessionStatus('ACTIVE');
      startTimer();
    };

    const onChatMessage = (message) => {
      if (message?.sessionId !== sessionId) {
        return;
      }
      appendMessage(message);
    };

    const onLowBalanceWarning = (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) {
        return;
      }
      setLowBalanceWarning(
        eventPayload?.message || 'Low balance. Please recharge to avoid disconnection.',
      );
    };

    bootstrap();

    socket.on('chat_accepted', onChatAccepted);
    socket.on('chat_started', onChatStarted);
    socket.on('chat_message', onChatMessage);
    socket.on('chat_low_balance_warning', onLowBalanceWarning);
    socket.on('chat_end_due_to_low_balance', handleSessionEnded);
    socket.on('chat_ended', handleSessionEnded);

    socket.emit('join_chat_session', { sessionId });

    if (payload?.session?.status === 'ACTIVE') {
      onChatStarted({ sessionId });
    }

    return () => {
      socket.off('chat_accepted', onChatAccepted);
      socket.off('chat_started', onChatStarted);
      socket.off('chat_message', onChatMessage);
      socket.off('chat_low_balance_warning', onLowBalanceWarning);
      socket.off('chat_end_due_to_low_balance', handleSessionEnded);
      socket.off('chat_ended', handleSessionEnded);
      stopTimer();
      leaveAgoraChatSession().catch(() => {});
    };
  }, [
    appendMessage,
    authSession?.accessToken,
    currentUserId,
    handleSessionEnded,
    navigation,
    payload?.agora?.token,
    payload?.session?.status,
    sessionId,
    startTimer,
    stopTimer,
  ]);

  const onSendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !targetUserId) {
      return;
    }

    if (sessionStatus !== 'ACTIVE') {
      Alert.alert('Chat not active', 'Please wait for host to accept your chat request.');
      return;
    }

    try {
      const sent = await emitWithAck('chat_message', {
        sessionId,
        receiverId: targetUserId,
        content: trimmed,
        messageType: 'text',
      });
      appendMessage(sent);
      setInputValue('');
    } catch (error) {
      if (error?.code === 'INSUFFICIENT_BALANCE') {
        Alert.alert(
          'Insufficient Balance',
          'You do not have sufficient balance. Please recharge your wallet to continue.',
        );
      } else {
        Alert.alert('Message failed', error?.message || 'Unable to send message right now.');
      }
    }
  };

  const onEndChat = async () => {
    const endReason = isListener ? 'LISTENER_ENDED' : 'USER_ENDED';
    try {
      await endChatSession(sessionId, endReason);
      await emitWithAck('chat_ended', { sessionId, endReason }).catch(() => {});
    } catch (_error) {
      // Keep teardown flow resilient even when network call fails.
    } finally {
      stopTimer();
      await leaveAgoraChatSession().catch(() => {});
      navigation.goBack();
    }
  };

  const renderMessage = ({ item }) => {
    const isMine = item?.senderId === currentUserId;
    return (
      <View
        style={[
          styles.messageBubble,
          isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
        ]}
      >
        <Text style={styles.messageText}>{item?.content || ''}</Text>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#05020D', '#0B0316', '#180523']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={onEndChat} activeOpacity={0.85}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerTitleWrap}>
              <AppLogo size="xs" withCard={false} style={styles.headerLogo} />
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.headerSubtitle}>
                {sessionStatus === 'ACTIVE'
                  ? `Live - ${formatDuration(elapsedSeconds)}`
                  : 'Waiting for host response...'}
              </Text>
            </View>

            <TouchableOpacity style={styles.headerButton} onPress={onEndChat} activeOpacity={0.85}>
              <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {lowBalanceWarning ? (
            <View style={styles.warningBox}>
              <Ionicons name="alert-circle" size={16} color={theme.colors.warning} />
              <Text style={styles.warningText}>{lowBalanceWarning}</Text>
            </View>
          ) : null}

          {!isChatReady ? (
            <Text style={styles.infoBanner}>
              Agora chat not configured on client yet. Socket messaging is active.
            </Text>
          ) : null}

          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.inputRow}>
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="Type your message..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.input}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={onSendMessage} activeOpacity={0.85}>
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  header: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 10,
    alignItems: 'center',
  },
  headerLogo: {
    marginBottom: 4,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 1,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  warningBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    borderColor: 'rgba(255, 184, 0, 0.4)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  warningText: {
    color: theme.colors.warning,
    fontSize: 13,
    flexShrink: 1,
  },
  infoBanner: {
    marginTop: 10,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontSize: 12,
  },
  messagesContent: {
    paddingTop: 16,
    paddingBottom: 20,
    gap: 8,
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  messageBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 42, 163, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.6)',
  },
  messageBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  messageText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.magenta,
  },
});

export default ChatSessionScreen;

