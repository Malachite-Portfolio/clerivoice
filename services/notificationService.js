import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AUTH_DEBUG_ENABLED, EXPO_PUSH_PROJECT_ID } from '../constants/api';
import { getCurrentRouteSnapshot } from '../navigation/navigationRef';
import { isConversationMuted, isUserBlocked } from './chatInteractionPrefs';

let currentAppState = AppState.currentState || 'active';
let lastHandledNotificationId = null;

const logNotificationDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[NotificationService] ${label}`, payload);
};

const getCurrentSessionIdForRoute = (route) => {
  if (!route) {
    return null;
  }

  if (route.name === 'ChatSession') {
    return route.params?.chatPayload?.session?.id || null;
  }

  if (route.name === 'CallSession') {
    return (
      route.params?.callPayload?.session?.id ||
      route.params?.incomingRequest?.sessionId ||
      null
    );
  }

  return null;
};

export const shouldUseInAppChatBanner = (notification) => {
  if (currentAppState !== 'active') {
    return false;
  }

  const data = notification?.request?.content?.data || {};
  const route = getCurrentRouteSnapshot();
  const currentSessionId = getCurrentSessionIdForRoute(route);

  return (
    data?.type === 'chat_message' &&
    route?.name === 'ChatSession' &&
    currentSessionId === data?.sessionId
  );
};

const shouldSuppressForegroundNotification = (notification) => {
  if (currentAppState !== 'active') {
    return false;
  }

  const data = notification?.request?.content?.data || {};

  if (data?.type === 'incoming_call') {
    return true;
  }

  if (shouldUseInAppChatBanner(notification)) {
    return true;
  }

  return false;
};

const resolveReceiverUserIdFromNotificationData = (data = {}) => {
  const senderRole = String(data?.senderRole || '').trim().toUpperCase();

  if (senderRole === 'LISTENER') {
    return data?.userId || null;
  }

  if (senderRole === 'USER') {
    return data?.listenerId || null;
  }

  return data?.receiverId || data?.userId || data?.listenerId || null;
};

const shouldSuppressByInteractionPreferences = async (notification) => {
  const data = notification?.request?.content?.data || {};
  const normalizedType = String(data?.type || '').trim().toLowerCase();

  if (normalizedType === 'chat_message') {
    const currentUserId = resolveReceiverUserIdFromNotificationData(data);
    const counterpartyId = data?.senderId || null;
    if (!currentUserId || !counterpartyId) {
      return false;
    }

    const muted = await isConversationMuted({
      currentUserId,
      counterpartyId,
    });

    if (muted) {
      logNotificationDebug('notificationSuppressedByMute', {
        currentUserId,
        counterpartyId,
        type: normalizedType,
        sessionId: data?.sessionId || null,
      });
    }

    return muted;
  }

  if (normalizedType === 'incoming_call') {
    const requesterId = data?.requesterId || null;
    const currentUserId = data?.listenerId || null;
    if (!currentUserId || !requesterId) {
      return false;
    }

    const blocked = await isUserBlocked({
      currentUserId,
      counterpartyId: requesterId,
    });

    if (blocked) {
      logNotificationDebug('notificationSuppressedByBlock', {
        currentUserId,
        counterpartyId: requesterId,
        type: normalizedType,
        sessionId: data?.sessionId || null,
      });
    }

    return blocked;
  }

  return false;
};

try {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const suppress = shouldSuppressForegroundNotification(notification);
      const suppressByPrefs = await shouldSuppressByInteractionPreferences(notification);
      const shouldSuppress = suppress || suppressByPrefs;

      logNotificationDebug('notificationReceivedForeground', {
        suppress: shouldSuppress,
        type: notification?.request?.content?.data?.type || null,
        sessionId: notification?.request?.content?.data?.sessionId || null,
        appState: currentAppState,
        routeName: getCurrentRouteSnapshot()?.name || null,
      });

      return {
        shouldShowAlert: !shouldSuppress,
        shouldShowBanner: !shouldSuppress,
        shouldShowList: !shouldSuppress,
        shouldPlaySound: !shouldSuppress,
        shouldSetBadge: false,
      };
    },
  });
} catch (error) {
  logNotificationDebug('notificationHandlerSetupFailed', {
    message: error?.message || 'Unknown error',
  });
}

const buildChatNavigationIntent = (data) => {
  const senderId = data?.senderId || null;
  const senderRole = String(data?.senderRole || '').trim().toUpperCase();

  return {
    routeName: 'ChatSession',
    params: {
      chatPayload: {
        session: {
          id: data?.sessionId,
          status: 'ACTIVE',
          userId: data?.userId || null,
          listenerId: data?.listenerId || null,
        },
        agora: null,
      },
      host: {
        name: data?.senderName || 'Conversation',
        avatar: data?.senderAvatar || null,
        userId: senderRole === 'USER' ? senderId : null,
        listenerId: senderRole === 'LISTENER' ? senderId : null,
      },
    },
  };
};

const buildIncomingCallNavigationIntent = (data) => ({
  routeName: 'CallSession',
  params: {
    incomingRequest: {
      sessionId: data?.sessionId,
      callType:
        String(data?.callType || '').trim().toLowerCase() === 'video'
          ? 'video'
          : 'audio',
      requester: {
        id: data?.requesterId || null,
        displayName: data?.requesterName || 'Incoming call',
        profileImageUrl: data?.requesterAvatar || null,
      },
      ratePerMinute: Number(data?.ratePerMinute || 0),
      requestedAt: data?.requestedAt || new Date().toISOString(),
    },
    host: {
      name: data?.requesterName || 'Incoming call',
      avatar: data?.requesterAvatar || null,
      userId: data?.requesterId || null,
      sessionId: data?.sessionId || null,
    },
  },
});

export const buildNotificationNavigationIntent = (data = {}) => {
  const normalizedType = String(data?.type || '').trim().toLowerCase();

  if (normalizedType === 'chat_message' && data?.sessionId) {
    return buildChatNavigationIntent(data);
  }

  if (normalizedType === 'incoming_call' && data?.sessionId) {
    return buildIncomingCallNavigationIntent(data);
  }

  return null;
};

const getResponseIdentifier = (response) =>
  response?.notification?.request?.identifier || response?.actionIdentifier || null;

export const handleNotificationResponse = (response, onIntent) => {
  const responseId = getResponseIdentifier(response);

  if (responseId && responseId === lastHandledNotificationId) {
    return false;
  }

  const data = response?.notification?.request?.content?.data || {};
  const intent = buildNotificationNavigationIntent(data);

  if (!intent) {
    return false;
  }

  lastHandledNotificationId = responseId || lastHandledNotificationId;

  logNotificationDebug('notificationTap', {
    type: data?.type || null,
    sessionId: data?.sessionId || null,
    routeName: intent.routeName,
  });

  onIntent?.(intent);
  return true;
};

export const consumeInitialNotificationResponseAsync = async (onIntent) => {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) {
    return false;
  }

  return handleNotificationResponse(response, onIntent);
};

export const registerNotificationListeners = ({
  onNotificationReceived,
  onNotificationResponse,
}) => {
  const receiveSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification?.request?.content?.data || {};

    logNotificationDebug('notificationReceivedListener', {
      type: data?.type || null,
      sessionId: data?.sessionId || null,
    });

    onNotificationReceived?.(notification);
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponse(response, onNotificationResponse);
  });

  return () => {
    receiveSubscription.remove();
    responseSubscription.remove();
  };
};

export const updateNotificationRuntimeState = ({ appState }) => {
  if (appState) {
    currentAppState = appState;
  }
};

export const registerForPushNotificationsAsync = async ({ appFlavor }) => {
  if (Platform.OS === 'android') {
    await Promise.all([
      Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 180, 120, 180],
      }),
      Notifications.setNotificationChannelAsync('calls', {
        name: 'Incoming Calls',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }),
    ]);
  }

  if (!Device.isDevice) {
    throw new Error('Push notifications require a physical device.');
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  logNotificationDebug('pushPermissionResult', {
    status: finalStatus,
  });

  if (finalStatus !== 'granted') {
    throw new Error('Push notification permission denied');
  }

  const projectId =
    Constants?.easConfig?.projectId ||
    Constants?.expoConfig?.extra?.eas?.projectId ||
    EXPO_PUSH_PROJECT_ID;

  let expoPushToken = null;
  try {
    expoPushToken = projectId
      ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
      : (await Notifications.getExpoPushTokenAsync()).data;
  } catch (error) {
    logNotificationDebug('pushTokenFailed', {
      appFlavor,
      hasProjectId: Boolean(projectId),
      message: error?.message || 'Unknown error',
    });
    throw new Error(
      'Unable to obtain push token. Configure EXPO_PUBLIC_EXPO_PROJECT_ID and Android push credentials.',
    );
  }

  logNotificationDebug('pushTokenRegistration', {
    appFlavor,
    hasProjectId: Boolean(projectId),
    hasToken: Boolean(expoPushToken),
  });

  return {
    expoPushToken,
    appFlavor,
    platform: Platform.OS,
    deviceId: Application.applicationId || null,
    deviceName: Device.modelName || Device.deviceName || null,
    deviceInfo: {
      brand: Device.brand || null,
      manufacturer: Device.manufacturer || null,
      osName: Device.osName || null,
      osVersion: Device.osVersion || null,
      appVersion: Application.nativeApplicationVersion || null,
    },
  };
};
