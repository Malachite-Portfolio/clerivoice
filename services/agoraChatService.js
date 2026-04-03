import { AUTH_DEBUG_ENABLED } from '../constants/api';

let agoraChatSdk = null;
let agoraChatLoadError = null;

try {
  agoraChatSdk = require('react-native-agora-chat');
} catch (error) {
  agoraChatLoadError = error;
}

const ChatClient = agoraChatSdk?.ChatClient || null;
const ChatMessage = agoraChatSdk?.ChatMessage || null;
const ChatMessageChatType = agoraChatSdk?.ChatMessageChatType || {
  PeerChat: 0,
};
const ChatOptions = agoraChatSdk?.ChatOptions || null;

let chatClient = null;
let isInitialized = false;
let connectionListener = null;
let messageListener = null;
let activeUserId = null;

const logAgoraChat = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[AgoraChat] ${label}`, payload);
};

const isAgoraChatNativeAvailable = () =>
  Boolean(ChatClient && ChatMessage && ChatOptions);

const createNativeUnavailableError = () => {
  const error = new Error(
    'Agora chat native module is unavailable. Verify release native linking and app initialization.',
  );
  error.code = 'AGORA_CHAT_NATIVE_UNAVAILABLE';
  return error;
};

const getChatClient = () => {
  if (!isAgoraChatNativeAvailable()) {
    return null;
  }

  if (!chatClient) {
    chatClient = ChatClient.getInstance();
  }

  return chatClient;
};

const clearChatListeners = () => {
  const client = getChatClient();
  if (!isInitialized || !client) {
    return;
  }

  if (connectionListener) {
    client.removeConnectionListener(connectionListener);
    connectionListener = null;
  }

  if (messageListener) {
    client.chatManager.removeMessageListener(messageListener);
    messageListener = null;
  }
};

export const initAgoraChatSession = async ({
  appKey,
  userId,
  token,
  onMessagesReceived,
  onTokenWillExpire,
  onTokenDidExpire,
}) => {
  if (!appKey || !token || !userId) {
    return { connected: false, reason: 'MISSING_CHAT_CONFIG' };
  }

  if (!isAgoraChatNativeAvailable()) {
    logAgoraChat('nativeUnavailable', {
      hasChatClient: Boolean(ChatClient),
      hasChatMessage: Boolean(ChatMessage),
      hasChatOptions: Boolean(ChatOptions),
      message: agoraChatLoadError?.message || null,
    });
    return {
      connected: false,
      reason: 'AGORA_CHAT_NATIVE_UNAVAILABLE',
      message: agoraChatLoadError?.message || null,
    };
  }

  const client = getChatClient();
  if (!client) {
    return { connected: false, reason: 'AGORA_CHAT_NATIVE_UNAVAILABLE' };
  }

  if (!isInitialized) {
    await client.init(
      new ChatOptions({
        appKey,
        autoLogin: false,
        debugModel: !!__DEV__,
      }),
    );
    isInitialized = true;
  }

  const normalizedUserId = String(userId);

  if (activeUserId && activeUserId !== normalizedUserId) {
    try {
      await client.logout(false);
    } catch (_error) {
      // Ignore stale session logout errors.
    }
  }

  clearChatListeners();

  connectionListener = {
    onTokenWillExpire: () => onTokenWillExpire?.(),
    onTokenDidExpire: () => onTokenDidExpire?.(),
  };
  client.addConnectionListener(connectionListener);

  messageListener = {
    onMessagesReceived: (messages) => {
      onMessagesReceived?.(messages || []);
    },
  };
  client.chatManager.addMessageListener(messageListener);

  await client.loginWithToken(normalizedUserId, String(token));
  activeUserId = normalizedUserId;

  return { connected: true };
};

export const sendAgoraTextMessage = async ({ targetUserId, text }) => {
  if (!isAgoraChatNativeAvailable()) {
    throw createNativeUnavailableError();
  }

  const client = getChatClient();
  if (!isInitialized || !client) {
    throw new Error('Agora chat is not initialized.');
  }

  const message = ChatMessage.createTextMessage(
    String(targetUserId),
    String(text),
    ChatMessageChatType.PeerChat,
  );

  await client.chatManager.sendMessage(message);
  return message;
};

export const renewAgoraChatToken = async (token) => {
  if (!isInitialized || !token) {
    return;
  }

  const client = getChatClient();
  if (!client) {
    return;
  }

  await client.renewAgoraToken(String(token));
};

export const leaveAgoraChatSession = async () => {
  const client = getChatClient();
  if (!isInitialized || !client) {
    return;
  }

  clearChatListeners();

  try {
    await client.logout(false);
  } catch (_error) {
    // Ignore logout errors during screen teardown.
  } finally {
    activeUserId = null;
  }
};
