import {
  ChatClient,
  ChatMessage,
  ChatMessageChatType,
  ChatOptions,
} from 'react-native-agora-chat';

const chatClient = ChatClient.getInstance();

let isInitialized = false;
let connectionListener = null;
let messageListener = null;
let activeUserId = null;

const clearChatListeners = () => {
  if (!isInitialized) {
    return;
  }

  if (connectionListener) {
    chatClient.removeConnectionListener(connectionListener);
    connectionListener = null;
  }

  if (messageListener) {
    chatClient.chatManager.removeMessageListener(messageListener);
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

  if (!isInitialized) {
    await chatClient.init(
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
      await chatClient.logout(false);
    } catch (_error) {
      // Ignore stale session logout errors.
    }
  }

  clearChatListeners();

  connectionListener = {
    onTokenWillExpire: () => onTokenWillExpire?.(),
    onTokenDidExpire: () => onTokenDidExpire?.(),
  };
  chatClient.addConnectionListener(connectionListener);

  messageListener = {
    onMessagesReceived: (messages) => {
      onMessagesReceived?.(messages || []);
    },
  };
  chatClient.chatManager.addMessageListener(messageListener);

  await chatClient.loginWithToken(normalizedUserId, String(token));
  activeUserId = normalizedUserId;

  return { connected: true };
};

export const sendAgoraTextMessage = async ({ targetUserId, text }) => {
  if (!isInitialized) {
    throw new Error('Agora chat is not initialized.');
  }

  const message = ChatMessage.createTextMessage(
    String(targetUserId),
    String(text),
    ChatMessageChatType.PeerChat,
  );

  await chatClient.chatManager.sendMessage(message);
  return message;
};

export const renewAgoraChatToken = async (token) => {
  if (!isInitialized || !token) {
    return;
  }
  await chatClient.renewAgoraToken(String(token));
};

export const leaveAgoraChatSession = async () => {
  if (!isInitialized) {
    return;
  }

  clearChatListeners();

  try {
    await chatClient.logout(false);
  } catch (_error) {
    // Ignore logout errors during screen teardown.
  } finally {
    activeUserId = null;
  }
};
