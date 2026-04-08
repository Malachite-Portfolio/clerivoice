const { prisma } = require('../../config/prisma');
const { logger } = require('../../config/logger');
const { AppError } = require('../../utils/appError');
const sessionGuardService = require('../../services/sessionGuard.service');
const privacyModerationService = require('../../services/privacyModeration.service');
const pushNotificationService = require('../../services/pushNotification.service');
const {
  emitHostStatusChanged,
  emitEvent,
  SYNC_EVENTS,
} = require('../../services/realtimeSync.service');
const agoraService = require('../../services/agora/AgoraService');

let io = null;
let billingManager = null;

const FINAL_CHAT_STATES = new Set(['ENDED', 'CANCELLED', 'REJECTED']);
const CHAT_STATES_THAT_REQUIRE_MESSAGE_CLEAR = new Set(['ENDED', 'CANCELLED', 'REJECTED']);

const setRealtimeDependencies = ({ socketServer, sessionBillingManager }) => {
  io = socketServer;
  billingManager = sessionBillingManager;
};

const getChatChannelName = (sessionId) => agoraService.buildChatChannelName(sessionId);

const emitChatRealtime = (session, eventName, payload) => {
  if (!io || !session) {
    return;
  }

  io.to(`user:${session.userId}`).emit(eventName, payload);
  io.to(`user:${session.listenerId}`).emit(eventName, payload);
};

const assertChatParticipant = (session, userId) => {
  if (session.userId !== userId && session.listenerId !== userId) {
    throw new AppError('You are not part of this chat session', 403, 'CHAT_ACCESS_DENIED');
  }
};

const setListenerOnline = async (listenerId, reason) => {
  await prisma.listenerProfile.updateMany({
    where: { userId: listenerId },
    data: { availability: 'ONLINE' },
  });

  const listenerProfile = await prisma.listenerProfile.findUnique({
    where: { userId: listenerId },
    select: { isEnabled: true, updatedAt: true, availability: true },
  });

  emitHostStatusChanged({
    listenerId,
    status: listenerProfile?.availability || 'ONLINE',
    availability: listenerProfile?.availability || 'ONLINE',
    isEnabled: listenerProfile?.isEnabled ?? true,
    updatedAt: listenerProfile?.updatedAt || null,
    reason,
  });
};

const resolveChatRole = (session, actorId) => {
  if (actorId === session.listenerId) {
    return 'LISTENER';
  }
  return 'USER';
};

const finalizeChatSession = async ({
  session,
  status,
  endReason,
  reasonCode,
  endedBy,
  force = false,
  restoreListenerAvailability = true,
}) => {
  if (FINAL_CHAT_STATES.has(session.status)) {
    logger.info('[Chat] finalize skipped, session already final', {
      sessionId: session.id,
      status: session.status,
      requestedStatus: status,
      endReason,
      endedBy: endedBy || null,
    });
    return session;
  }

  if (!force) {
    assertChatParticipant(session, endedBy);
  }

  const updated = await prisma.chatSession.update({
    where: { id: session.id },
    data: {
      status,
      endedAt: new Date(),
      endReason,
    },
  });

  let clearedMessageCount = 0;
  if (CHAT_STATES_THAT_REQUIRE_MESSAGE_CLEAR.has(String(status || '').toUpperCase())) {
    const deleted = await prisma.chatMessage.deleteMany({
      where: {
        sessionId: session.id,
      },
    });
    clearedMessageCount = Number(deleted?.count || 0);
    logger.info('[Chat] session messages cleared after finalization', {
      sessionId: session.id,
      status,
      endReason,
      clearedMessageCount,
    });
  }

  if (billingManager) {
    billingManager.stopChatBilling(session.id);
  }

  if (restoreListenerAvailability) {
    await setListenerOnline(session.listenerId, reasonCode || 'CHAT_ENDED');
  }

  const payload = {
    sessionId: session.id,
    channelName: getChatChannelName(session.id),
    endReason,
    reasonCode: reasonCode || null,
    endedBy: endedBy || 'SYSTEM',
    totalAmount: Number(updated.totalAmount || 0),
    billedMinutes: updated.billedMinutes,
    messagesCleared: clearedMessageCount > 0,
    clearedMessageCount,
  };

  if (io) {
    if (reasonCode === 'LOW_BALANCE') {
      emitChatRealtime(session, 'chat_end_due_to_low_balance', payload);
    }
    emitChatRealtime(session, 'chat_ended', payload);
    emitChatRealtime(session, 'session_ended', {
      ...payload,
      sessionType: 'chat',
    });
  }

  logger.info('[Chat] session finalized', {
    sessionId: session.id,
    status,
    endReason,
    endedBy: endedBy || 'SYSTEM',
    reasonCode: reasonCode || null,
    clearedMessageCount,
  });

  return updated;
};

const requestChat = async ({ userId, listenerId }) => {
  const check = await sessionGuardService.canStartChat({
    userId,
    listenerId,
    actorId: userId,
  });

  const session = await prisma.chatSession.create({
    data: {
      userId,
      listenerId,
      status: 'ACTIVE',
      startedAt: new Date(),
      ratePerMinute: check.listener.chatRatePerMinute,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          profileImageUrl: true,
        },
      },
      listener: {
        select: {
          id: true,
          displayName: true,
          profileImageUrl: true,
          listenerProfile: {
            select: {
              availability: true,
            },
          },
        },
      },
    },
  });

  const channelName = getChatChannelName(session.id);
  const agora = agoraService.generateChatToken({
    userId,
  });

  const listenerState = await prisma.listenerProfile.update({
    where: { userId: session.listenerId },
    data: { availability: 'BUSY' },
  });

  emitHostStatusChanged({
    listenerId: session.listenerId,
    status: 'BUSY',
    availability: 'BUSY',
    isEnabled: listenerState.isEnabled,
    updatedAt: listenerState.updatedAt,
    reason: 'CHAT_ACTIVE',
  });

  if (billingManager) {
    billingManager.startChatBilling(session.id, { runImmediately: true });
  }

  emitChatRealtime(session, 'chat_started', {
    sessionId: session.id,
    channelName,
    status: session.status,
    startedAt: session.startedAt,
    requester: session.user,
    listener: session.listener,
    ratePerMinute: Number(session.ratePerMinute),
  });

  return {
    session: {
      ...session,
      channelName,
    },
    agora,
    eligibility: {
      current_balance: check.current_balance,
      required_minimum_balance: check.required_minimum_balance,
      listener_rate: check.listener_rate,
      estimated_minutes_remaining: check.estimated_minutes_remaining,
      action_required: check.action_required,
    },
  };
};

const acceptChat = async ({ listenerId, sessionId }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  if (session.listenerId !== listenerId) {
    throw new AppError('Only listener can accept this chat', 403, 'CHAT_ACCEPT_FORBIDDEN');
  }

  if (session.status !== 'REQUESTED') {
    throw new AppError('Chat session is not in requested state', 400, 'INVALID_CHAT_STATE');
  }

  try {
    await sessionGuardService.canStartChat({
      userId: session.userId,
      listenerId: session.listenerId,
      actorId: listenerId,
    });
  } catch (error) {
    await finalizeChatSession({
      session,
      status: 'CANCELLED',
      endReason: 'CANCELLED',
      reasonCode: 'CHAT_ACTIVATION_BLOCKED',
      endedBy: listenerId,
      force: true,
    });
    throw error;
  }

  const updated = await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      status: 'ACTIVE',
      startedAt: new Date(),
    },
  });

  const listenerState = await prisma.listenerProfile.update({
    where: { userId: session.listenerId },
    data: { availability: 'BUSY' },
  });

  emitHostStatusChanged({
    listenerId: session.listenerId,
    status: 'BUSY',
    availability: 'BUSY',
    isEnabled: listenerState.isEnabled,
    updatedAt: listenerState.updatedAt,
    reason: 'CHAT_ACTIVE',
  });

  if (billingManager) {
    billingManager.startChatBilling(sessionId, { runImmediately: true });
  }

  const channelName = getChatChannelName(sessionId);
  const listenerAgora = agoraService.generateChatToken({
    userId: listenerId,
  });

  if (io) {
    emitChatRealtime(session, 'chat_accepted', {
      sessionId,
      channelName,
      status: updated.status,
      startedAt: updated.startedAt,
    });

    emitChatRealtime(session, 'chat_started', {
      sessionId,
      channelName,
      startedAt: updated.startedAt,
    });
  }

  return {
    session: {
      ...updated,
      channelName,
    },
    agora: listenerAgora,
  };
};

const rejectChat = async ({ listenerId, sessionId, reason }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  if (session.listenerId !== listenerId) {
    throw new AppError('Only listener can reject this chat', 403, 'CHAT_REJECT_FORBIDDEN');
  }

  const updated = await finalizeChatSession({
    session,
    status: 'REJECTED',
    endReason: 'REJECTED',
    reasonCode: 'REJECTED_BY_LISTENER',
    endedBy: listenerId,
    force: true,
  });

  emitChatRealtime(session, 'chat_rejected', {
    sessionId,
    reason: reason || 'Chat rejected by listener',
  });

  return updated;
};

const endChat = async ({ actorId, sessionId, endReason = 'USER_ENDED' }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  const actorRole = resolveChatRole(session, actorId);
  const normalizedEndReason =
    endReason || (actorRole === 'LISTENER' ? 'LISTENER_ENDED' : 'USER_ENDED');

  const mappedStatus = session.status === 'REQUESTED' ? 'CANCELLED' : 'ENDED';

  return finalizeChatSession({
    session,
    status: mappedStatus,
    endReason: normalizedEndReason,
    reasonCode: actorRole === 'LISTENER' ? 'ENDED_BY_LISTENER' : 'ENDED_BY_USER',
    endedBy: actorId,
    force: false,
  });
};

const forceEndChatBySystem = async ({
  sessionId,
  endReason = 'CANCELLED',
  reasonCode = 'SYSTEM_ENDED',
  restoreListenerAvailability = true,
}) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return null;
  }

  const mappedStatus = session.status === 'REQUESTED' ? 'CANCELLED' : 'ENDED';
  return finalizeChatSession({
    session,
    status: mappedStatus,
    endReason,
    reasonCode,
    endedBy: 'SYSTEM',
    force: true,
    restoreListenerAvailability,
  });
};

const renewChatToken = async ({ actorId, sessionId }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  assertChatParticipant(session, actorId);

  if (FINAL_CHAT_STATES.has(session.status)) {
    throw new AppError('Chat session is already ended', 400, 'CHAT_ALREADY_ENDED');
  }

  return {
    sessionId,
    channelName: getChatChannelName(sessionId),
    agora: agoraService.generateChatToken({
      userId: actorId,
    }),
  };
};

const listChatSessions = async ({ userId, role, page, limit, status }) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(status ? { status } : {}),
    ...(role === 'LISTENER' ? { listenerId: userId } : { userId }),
  };

  const [items, total] = await Promise.all([
    prisma.chatSession.findMany({
      where,
      include: {
        user: {
          select: { id: true, displayName: true, profileImageUrl: true },
        },
        listener: {
          select: {
            id: true,
            displayName: true,
            profileImageUrl: true,
            listenerProfile: {
              select: {
                availability: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.chatSession.count({ where }),
  ]);

  const enriched = items.map((item) => ({
    ...item,
    channelName: getChatChannelName(item.id),
  }));

  return {
    items: enriched,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getChatMessages = async ({ userId, sessionId }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  assertChatParticipant(session, userId);

  let messages = [];
  if (CHAT_STATES_THAT_REQUIRE_MESSAGE_CLEAR.has(String(session.status || '').toUpperCase())) {
    logger.info('[Chat] skipping ended session history fetch', {
      sessionId,
      status: session.status,
      requesterId: userId,
    });
  } else {
    messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  return {
    session: {
      ...session,
      channelName: getChatChannelName(session.id),
    },
    messages,
  };
};

const sendMessage = async ({ sessionId, senderId, receiverId, messageType = 'text', content }) => {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          displayName: true,
          profileImageUrl: true,
        },
      },
      listener: {
        select: {
          id: true,
          role: true,
          displayName: true,
          profileImageUrl: true,
        },
      },
    },
  });

  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  assertChatParticipant(session, senderId);

  // Contract: chat should not require an accept/reject handshake.
  // If legacy sessions still exist in REQUESTED state, auto-activate on first message.
  if (session.status === 'REQUESTED') {
    try {
      await sessionGuardService.canStartChat({
        userId: session.userId,
        listenerId: session.listenerId,
        actorId: senderId,
      });
    } catch (error) {
      await finalizeChatSession({
        session,
        status: 'CANCELLED',
        endReason: 'CANCELLED',
        reasonCode: 'CHAT_ACTIVATION_BLOCKED',
        endedBy: senderId,
        force: true,
      });
      throw error;
    }

    const activated = await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        status: 'ACTIVE',
        startedAt: session.startedAt || new Date(),
      },
    });

    const listenerState = await prisma.listenerProfile.update({
      where: { userId: session.listenerId },
      data: { availability: 'BUSY' },
    });

    emitHostStatusChanged({
      listenerId: session.listenerId,
      status: 'BUSY',
      availability: 'BUSY',
      isEnabled: listenerState.isEnabled,
      updatedAt: listenerState.updatedAt,
      reason: 'CHAT_ACTIVE',
    });

    if (billingManager) {
      billingManager.startChatBilling(session.id, { runImmediately: true });
    }

    emitChatRealtime(session, 'chat_started', {
      sessionId: session.id,
      channelName: getChatChannelName(session.id),
      status: 'ACTIVE',
      startedAt: activated.startedAt,
    });
  } else if (session.status !== 'ACTIVE') {
    throw new AppError('Chat session is not active', 400, 'CHAT_NOT_ACTIVE');
  }

  await privacyModerationService.assertNotSuspended({
    userId: senderId,
    action: 'SEND_CHAT_MESSAGE',
  });

  const moderation = privacyModerationService.detectRestrictedContent(content);
  if (moderation.blocked) {
    const suspension = await privacyModerationService.suspendForRestrictedContact({
      userId: senderId,
      sessionId,
      sessionType: 'CHAT',
      originalContent: content,
      detectedReasons: moderation.reasons,
    });

    throw new AppError(
      privacyModerationService.ACCOUNT_SUSPENSION_MESSAGE,
      403,
      'RESTRICTED_CONTACT_INFO',
      {
        sessionId,
        detectedReasons: moderation.reasons,
        suspendedUntil: suspension.suspendedUntil,
      },
    );
  }

  const message = await prisma.chatMessage.create({
    data: {
      sessionId,
      senderId,
      receiverId,
      messageType,
      content,
      status: 'DELIVERED',
    },
  });

  let suppressRealtimeForOfflineListener = false;
  if (receiverId === session.listenerId) {
    const listenerProfile = await prisma.listenerProfile.findUnique({
      where: { userId: session.listenerId },
      select: { availability: true },
    });
    suppressRealtimeForOfflineListener =
      String(listenerProfile?.availability || '')
        .trim()
        .toUpperCase() === 'OFFLINE';
  }

  let messageForDelivery = message;
  if (suppressRealtimeForOfflineListener) {
    messageForDelivery = await prisma.chatMessage.update({
      where: { id: message.id },
      data: {
        status: 'SENT',
      },
    });
  }

  if (io && !suppressRealtimeForOfflineListener) {
    io.to(`user:${receiverId}`).emit('chat_message', messageForDelivery);
    io.to(`session:chat:${sessionId}`).emit('chat_message', messageForDelivery);
  } else if (suppressRealtimeForOfflineListener) {
    logger.info('[Chat] realtime message delivery deferred for offline listener', {
      sessionId,
      receiverId,
      messageId: messageForDelivery.id,
    });
  }

  const senderProfile = senderId === session.userId ? session.user : session.listener;
  const receiverRole = receiverId === session.listenerId ? 'LISTENER' : 'USER';

  if (!suppressRealtimeForOfflineListener) {
    Promise.resolve()
      .then(() =>
        pushNotificationService.sendChatMessagePush({
          receiverId,
          receiverRole,
          sessionId,
          messageId: messageForDelivery.id,
          senderId,
          senderName: senderProfile?.displayName || 'New message',
          senderAvatar: senderProfile?.profileImageUrl || null,
          sessionUserId: session.userId,
          sessionListenerId: session.listenerId,
          preview: String(content || '').trim().slice(0, 120),
        })
      )
      .catch((error) => {
        logger.warn('[Push] chat message notification failed', {
          sessionId,
          receiverId,
          message: error?.message || 'Unknown error',
        });
      });
  }

  return messageForDelivery;
};

const markRead = async ({ sessionId, readerId, messageIds }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  assertChatParticipant(session, readerId);

  const where = {
    sessionId,
    receiverId: readerId,
    status: { not: 'READ' },
    ...(messageIds?.length ? { id: { in: messageIds } } : {}),
  };

  const updated = await prisma.chatMessage.updateMany({
    where,
    data: {
      status: 'READ',
      readAt: new Date(),
    },
  });

  if (io) {
    io.to(`session:chat:${sessionId}`).emit('chat_read', {
      sessionId,
      readerId,
      updatedCount: updated.count,
      messageIds,
    });
  }

  return updated;
};

const reportUserInChat = async ({ reporterId, sessionId, reportedUserId, reason }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  assertChatParticipant(session, reporterId);

  if (![session.userId, session.listenerId].includes(reportedUserId)) {
    throw new AppError('Reported user is not part of this chat session', 400, 'REPORT_TARGET_INVALID');
  }

  if (String(reporterId) === String(reportedUserId)) {
    throw new AppError('You cannot report yourself', 400, 'REPORT_TARGET_INVALID');
  }

  const safeReason = String(reason || '').trim();
  if (!safeReason) {
    throw new AppError('Report reason is required', 400, 'REPORT_REASON_REQUIRED');
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: reporterId,
      subject: 'Chat user report',
      message: `Session ${sessionId} report against ${reportedUserId}: ${safeReason}`,
      priority: 'HIGH',
      status: 'OPEN',
    },
  });

  logger.info('[Chat] report submitted', {
    sessionId,
    reporterId,
    reportedUserId,
    ticketId: ticket.id,
  });

  return {
    ticketId: ticket.id,
    sessionId,
    reportedUserId,
  };
};

const emitLowBalanceEnded = async (sessionId) => {
  const session = await forceEndChatBySystem({
    sessionId,
    endReason: 'INSUFFICIENT_BALANCE',
    reasonCode: 'LOW_BALANCE',
  });

  if (!session) {
    return;
  }

  emitEvent(SYNC_EVENTS.WALLET_UPDATED, {
    userId: session.userId,
    source: 'chat_low_balance_end',
    syncVersion: Date.now(),
  });
};

module.exports = {
  setRealtimeDependencies,
  requestChat,
  acceptChat,
  rejectChat,
  endChat,
  forceEndChatBySystem,
  renewChatToken,
  listChatSessions,
  getChatMessages,
  sendMessage,
  markRead,
  reportUserInChat,
  emitLowBalanceEnded,
  getChatChannelName,
};
