const { prisma } = require('../config/prisma');
const { env } = require('../config/env');
const { logger } = require('../config/logger');

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

const isExpoPushToken = (value) => {
  const token = String(value || '').trim();
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
};

const chunk = (items, size) => {
  const result = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
};

const roleToAppFlavor = (role) => (String(role || '').trim().toUpperCase() === 'LISTENER' ? 'listener' : 'user');

const shouldAllowPushForUser = async (userId) => {
  const settings = await prisma.userSetting.findUnique({
    where: { userId },
    select: { allowPush: true },
  });

  return settings?.allowPush !== false;
};

const registerPushDevice = async ({
  userId,
  expoPushToken,
  appFlavor,
  platform = 'android',
  deviceId,
  deviceName,
  deviceInfo,
}) => {
  if (!userId || !isExpoPushToken(expoPushToken)) {
    return null;
  }

  const normalizedToken = String(expoPushToken).trim();
  const normalizedFlavor = String(appFlavor || '').trim().toLowerCase() === 'listener' ? 'listener' : 'user';

  return prisma.pushDevice.upsert({
    where: {
      expoPushToken: normalizedToken,
    },
    create: {
      userId,
      expoPushToken: normalizedToken,
      appFlavor: normalizedFlavor,
      platform,
      deviceId: deviceId || null,
      deviceName: deviceName || null,
      deviceInfo: deviceInfo || null,
      isActive: true,
      lastSeenAt: new Date(),
    },
    update: {
      userId,
      appFlavor: normalizedFlavor,
      platform,
      deviceId: deviceId || null,
      deviceName: deviceName || null,
      deviceInfo: deviceInfo || null,
      isActive: true,
      lastSeenAt: new Date(),
    },
  });
};

const unregisterPushDevice = async ({ userId, expoPushToken }) => {
  if (!userId || !isExpoPushToken(expoPushToken)) {
    return { count: 0 };
  }

  return prisma.pushDevice.updateMany({
    where: {
      userId,
      expoPushToken: String(expoPushToken).trim(),
    },
    data: {
      isActive: false,
      lastSeenAt: new Date(),
    },
  });
};

const getActivePushDevices = async ({ userId, appFlavor }) => {
  if (!userId) {
    return [];
  }

  const allowPush = await shouldAllowPushForUser(userId);
  if (!allowPush) {
    return [];
  }

  return prisma.pushDevice.findMany({
    where: {
      userId,
      isActive: true,
      ...(appFlavor ? { appFlavor } : {}),
    },
    select: {
      id: true,
      expoPushToken: true,
      appFlavor: true,
      platform: true,
    },
  });
};

const markInvalidTokensInactive = async (tickets = []) => {
  const invalidTokens = tickets
    .filter((ticket) => ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered')
    .map((ticket) => String(ticket?.details?.expoPushToken || ticket?.to || '').trim())
    .filter(Boolean);

  if (!invalidTokens.length) {
    return;
  }

  await prisma.pushDevice.updateMany({
    where: {
      expoPushToken: {
        in: invalidTokens,
      },
    },
    data: {
      isActive: false,
      lastSeenAt: new Date(),
    },
  });
};

const sendExpoPushMessages = async (messages = []) => {
  if (!env.PUSH_NOTIFICATIONS_ENABLED || !messages.length) {
    return [];
  }

  const headers = {
    Accept: 'application/json',
    'Accept-encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };

  if (env.EXPO_PUSH_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`;
  }

  const allTickets = [];

  for (const batch of chunk(messages, 100)) {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });

    const payload = await response.json().catch(() => ({}));

    logger.info('[Push] send batch response', {
      ok: response.ok,
      status: response.status,
      count: batch.length,
      errors: Array.isArray(payload?.errors) ? payload.errors.length : 0,
    });

    if (!response.ok) {
      throw new Error(payload?.errors?.[0]?.message || 'Expo push send failed');
    }

    const tickets = Array.isArray(payload?.data) ? payload.data : [];
    tickets.forEach((ticket, index) => {
      if (ticket && !ticket.to && batch[index]?.to) {
        ticket.to = batch[index].to;
      }

      if (ticket?.details && !ticket.details.expoPushToken && batch[index]?.to) {
        ticket.details.expoPushToken = batch[index].to;
      }
    });

    allTickets.push(...tickets);
  }

  await markInvalidTokensInactive(allTickets);
  return allTickets;
};

const sendChatMessagePush = async ({
  receiverId,
  receiverRole,
  sessionId,
  messageId,
  senderId,
  senderName,
  senderAvatar,
  sessionUserId,
  sessionListenerId,
  preview,
}) => {
  const devices = await getActivePushDevices({
    userId: receiverId,
    appFlavor: roleToAppFlavor(receiverRole),
  });

  if (!devices.length) {
    logger.info('[Push] chat notification skipped - no devices', {
      receiverId,
      sessionId,
    });
    return [];
  }

  const messages = devices.map((device) => ({
    to: device.expoPushToken,
    title: senderName || 'New message',
    body: preview || 'You have a new message.',
    sound: 'default',
    priority: 'high',
    channelId: 'messages',
    data: {
      type: 'chat_message',
      sessionId,
      messageId,
      senderId,
      senderName,
      senderAvatar: senderAvatar || '',
      senderRole: String(receiverRole || '').trim().toUpperCase() === 'LISTENER' ? 'USER' : 'LISTENER',
      userId: sessionUserId,
      listenerId: sessionListenerId,
      preview: preview || '',
    },
  }));

  logger.info('[Push] chat notification queued', {
    receiverId,
    sessionId,
    deviceCount: messages.length,
  });

  return sendExpoPushMessages(messages);
};

const sendIncomingCallPush = async ({
  listenerId,
  sessionId,
  requesterId,
  requesterName,
  requesterAvatar,
  ratePerMinute,
  requestedAt,
  callType,
}) => {
  const normalizedCallType =
    String(callType || '').trim().toLowerCase() === 'video' ? 'video' : 'audio';

  const devices = await getActivePushDevices({
    userId: listenerId,
    appFlavor: 'listener',
  });

  if (!devices.length) {
    logger.info('[Push] call notification skipped - no devices', {
      listenerId,
      sessionId,
    });
    return [];
  }

  const messages = devices.map((device) => ({
    to: device.expoPushToken,
    title: requesterName || `Incoming ${normalizedCallType} call`,
    body:
      normalizedCallType === 'video'
        ? 'Tap to answer this live video call.'
        : 'Tap to answer this live call.',
    sound: 'default',
    priority: 'high',
    channelId: 'calls',
    data: {
      type: 'incoming_call',
      sessionId,
      callType: normalizedCallType,
      requesterId,
      requesterName,
      requesterAvatar: requesterAvatar || '',
      ratePerMinute: Number(ratePerMinute || 0),
      requestedAt: requestedAt || new Date().toISOString(),
    },
  }));

  logger.info('[Push] call notification queued', {
    listenerId,
    sessionId,
    deviceCount: messages.length,
  });

  return sendExpoPushMessages(messages);
};

module.exports = {
  registerPushDevice,
  unregisterPushDevice,
  sendChatMessagePush,
  sendIncomingCallPush,
};
