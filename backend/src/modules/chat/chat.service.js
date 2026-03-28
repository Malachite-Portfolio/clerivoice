const { prisma } = require('../../config/prisma');
const { AppError } = require('../../utils/appError');
const sessionGuardService = require('../../services/sessionGuard.service');
const {
  emitHostStatusChanged,
  emitEvent,
  SYNC_EVENTS,
} = require('../../services/realtimeSync.service');
const agoraService = require('../../services/agora/AgoraService');

let io = null;
let billingManager = null;

const FINAL_CHAT_STATES = new Set(['ENDED', 'CANCELLED', 'REJECTED']);

const setRealtimeDependencies = ({ socketServer, sessionBillingManager }) => {
  io = socketServer;
  billingManager = sessionBillingManager;
};

const getChatChannelName = (sessionId) => agoraService.buildChatChannelName(sessionId);

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
  };

  if (io) {
    if (reasonCode === 'LOW_BALANCE') {
      io.to(`session:chat:${session.id}`).emit('chat_end_due_to_low_balance', payload);
    }
    io.to(`session:chat:${session.id}`).emit('chat_ended', payload);
  }

  return updated;
};

const requestChat = async ({ userId, listenerId }) => {
  const check = await sessionGuardService.canStartChat({ userId, listenerId });

  const session = await prisma.chatSession.create({
    data: {
      userId,
      listenerId,
      status: 'REQUESTED',
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
        },
      },
    },
  });

  const channelName = getChatChannelName(session.id);
  const agora = agoraService.generateChatToken({
    userId,
  });

  if (io) {
    io.to(`user:${listenerId}`).emit('chat_request', {
      sessionId: session.id,
      channelName,
      userId,
      listenerId,
      ratePerMinute: Number(session.ratePerMinute),
      requestedAt: session.requestedAt,
    });
  }

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
    billingManager.startChatBilling(sessionId);
  }

  const channelName = getChatChannelName(sessionId);
  const listenerAgora = agoraService.generateChatToken({
    userId: listenerId,
  });

  if (io) {
    io.to(`session:chat:${sessionId}`).emit('chat_accepted', {
      sessionId,
      channelName,
      status: updated.status,
      startedAt: updated.startedAt,
    });

    io.to(`session:chat:${sessionId}`).emit('chat_started', {
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

const rejectChat = async ({ listenerId, sessionId }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  if (session.listenerId !== listenerId) {
    throw new AppError('Only listener can reject this chat', 403, 'CHAT_REJECT_FORBIDDEN');
  }

  return finalizeChatSession({
    session,
    status: 'REJECTED',
    endReason: 'REJECTED',
    reasonCode: 'REJECTED_BY_LISTENER',
    endedBy: listenerId,
    force: true,
  });
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
          select: { id: true, displayName: true, profileImageUrl: true },
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

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });

  return {
    session: {
      ...session,
      channelName: getChatChannelName(session.id),
    },
    messages,
  };
};

const sendMessage = async ({ sessionId, senderId, receiverId, messageType = 'text', content }) => {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  assertChatParticipant(session, senderId);

  if (session.status !== 'ACTIVE') {
    throw new AppError('Chat session is not active', 400, 'CHAT_NOT_ACTIVE');
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

  if (io) {
    io.to(`user:${receiverId}`).emit('chat_message', message);
    io.to(`session:chat:${sessionId}`).emit('chat_message', message);
  }

  return message;
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
  emitLowBalanceEnded,
  getChatChannelName,
};
