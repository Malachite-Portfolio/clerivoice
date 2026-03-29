const dayjs = require('dayjs');
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

const FINAL_CALL_STATES = new Set(['ENDED', 'CANCELLED', 'REJECTED', 'MISSED']);

const setRealtimeDependencies = ({ socketServer, sessionBillingManager }) => {
  io = socketServer;
  billingManager = sessionBillingManager;
};

const getCallChannelName = (sessionId) => agoraService.buildCallChannelName(sessionId);

const assertCallParticipant = (session, userId) => {
  if (session.userId !== userId && session.listenerId !== userId) {
    throw new AppError('You are not part of this call session', 403, 'CALL_ACCESS_DENIED');
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

const resolveSessionRole = (session, actorId) => {
  if (actorId === session.listenerId) {
    return 'LISTENER';
  }
  return 'USER';
};

const finalizeCallSession = async ({
  session,
  status,
  endReason,
  reasonCode,
  endedBy,
  force = false,
  restoreListenerAvailability = true,
}) => {
  if (FINAL_CALL_STATES.has(session.status)) {
    return session;
  }

  if (!force) {
    assertCallParticipant(session, endedBy);
  }

  const now = dayjs();
  const referenceStart = session.answeredAt
    ? dayjs(session.answeredAt)
    : dayjs(session.startedAt || now);
  const durationSeconds = Math.max(0, now.diff(referenceStart, 'second'));

  const updated = await prisma.callSession.update({
    where: { id: session.id },
    data: {
      status,
      endedAt: now.toDate(),
      endReason,
      durationSeconds,
    },
  });

  if (billingManager) {
    billingManager.stopCallBilling(session.id);
  }

  if (restoreListenerAvailability) {
    await setListenerOnline(session.listenerId, reasonCode || 'CALL_ENDED');
  }

  const payload = {
    sessionId: session.id,
    channelName: getCallChannelName(session.id),
    endReason,
    reasonCode: reasonCode || null,
    endedBy: endedBy || 'SYSTEM',
    durationSeconds,
    totalAmount: Number(updated.totalAmount || 0),
    billedMinutes: updated.billedMinutes,
  };

  if (io) {
    if (reasonCode === 'LOW_BALANCE') {
      io.to(`session:call:${session.id}`).emit('call_end_due_to_low_balance', payload);
    }
    io.to(`session:call:${session.id}`).emit('call_ended', payload);
    io.to(`session:call:${session.id}`).emit('session_ended', {
      ...payload,
      sessionType: 'call',
    });
  }

  return updated;
};

const requestCall = async ({ userId, listenerId }) => {
  const check = await sessionGuardService.canStartCall({ userId, listenerId });

  const session = await prisma.callSession.create({
    data: {
      userId,
      listenerId,
      status: 'RINGING',
      requestedAt: new Date(),
      ratePerMinute: check.listener.callRatePerMinute,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          profileImageUrl: true,
          phone: true,
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

  const channelName = getCallChannelName(session.id);
  const agora = agoraService.generateRtcToken({
    userId,
    channelName,
    role: 'publisher',
  });

  await prisma.callEvent.create({
    data: {
      sessionId: session.id,
      eventType: 'call_request',
      payload: {
        channelName,
        requestedBy: userId,
        listenerId,
      },
    },
  });

  if (io) {
    io.to(`user:${listenerId}`).emit('call_request', {
      sessionId: session.id,
      channelName,
      userId,
      listenerId,
      requester: session.user,
      listener: session.listener,
      ratePerMinute: Number(session.ratePerMinute),
      requestedAt: session.requestedAt,
    });

    io.to(`user:${userId}`).emit('call_ringing', {
      sessionId: session.id,
      channelName,
      listenerId,
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

const acceptCall = async ({ listenerId, sessionId }) => {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Call session not found', 404, 'CALL_SESSION_NOT_FOUND');
  }

  if (session.listenerId !== listenerId) {
    throw new AppError('Only listener can accept this call', 403, 'CALL_ACCEPT_FORBIDDEN');
  }

  if (!['REQUESTED', 'RINGING'].includes(session.status)) {
    throw new AppError('Call session cannot be accepted now', 400, 'INVALID_CALL_STATE');
  }

  try {
    await sessionGuardService.canStartCall({
      userId: session.userId,
      listenerId: session.listenerId,
    });
  } catch (error) {
    await finalizeCallSession({
      session,
      status: 'CANCELLED',
      endReason: 'CANCELLED',
      reasonCode: 'CALL_ACTIVATION_BLOCKED',
      endedBy: listenerId,
      force: true,
    });
    throw error;
  }

  const now = new Date();
  const updated = await prisma.callSession.update({
    where: { id: sessionId },
    data: {
      status: 'ACTIVE',
      startedAt: now,
      answeredAt: now,
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
    reason: 'CALL_ACTIVE',
  });

  if (billingManager) {
    billingManager.startCallBilling(sessionId);
  }

  const channelName = getCallChannelName(sessionId);
  const listenerAgora = agoraService.generateRtcToken({
    userId: listenerId,
    channelName,
    role: 'publisher',
  });

  if (io) {
    io.to(`session:call:${sessionId}`).emit('call_accepted', {
      sessionId,
      channelName,
      status: updated.status,
      answeredAt: updated.answeredAt,
    });

    io.to(`session:call:${sessionId}`).emit('call_started', {
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

const rejectCall = async ({ listenerId, sessionId, reason }) => {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Call session not found', 404, 'CALL_SESSION_NOT_FOUND');
  }

  if (session.listenerId !== listenerId) {
    throw new AppError('Only listener can reject this call', 403, 'CALL_REJECT_FORBIDDEN');
  }

  const updated = await finalizeCallSession({
    session,
    status: 'REJECTED',
    endReason: 'REJECTED',
    reasonCode: 'REJECTED_BY_LISTENER',
    endedBy: listenerId,
    force: true,
  });

  await prisma.callEvent.create({
    data: {
      sessionId,
      eventType: 'call_rejected',
      payload: { reason: reason || 'Rejected by listener' },
    },
  });

  if (io) {
    io.to(`session:call:${sessionId}`).emit('call_rejected', {
      sessionId,
      reason: reason || 'Call rejected by listener',
    });
  }

  return updated;
};

const endCall = async ({ actorId, sessionId, endReason = 'USER_ENDED' }) => {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Call session not found', 404, 'CALL_SESSION_NOT_FOUND');
  }

  const actorRole = resolveSessionRole(session, actorId);
  const normalizedEndReason =
    endReason || (actorRole === 'LISTENER' ? 'LISTENER_ENDED' : 'USER_ENDED');

  return finalizeCallSession({
    session,
    status: session.status === 'ACTIVE' ? 'ENDED' : 'CANCELLED',
    endReason: normalizedEndReason,
    reasonCode: actorRole === 'LISTENER' ? 'ENDED_BY_LISTENER' : 'ENDED_BY_USER',
    endedBy: actorId,
    force: false,
  });
};

const forceEndCallBySystem = async ({
  sessionId,
  endReason = 'CANCELLED',
  reasonCode = 'SYSTEM_ENDED',
  restoreListenerAvailability = true,
}) => {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return null;
  }

  return finalizeCallSession({
    session,
    status: session.status === 'ACTIVE' ? 'ENDED' : 'CANCELLED',
    endReason,
    reasonCode,
    endedBy: 'SYSTEM',
    force: true,
    restoreListenerAvailability,
  });
};

const renewCallToken = async ({ actorId, sessionId }) => {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Call session not found', 404, 'CALL_SESSION_NOT_FOUND');
  }

  assertCallParticipant(session, actorId);

  if (FINAL_CALL_STATES.has(session.status)) {
    throw new AppError('Call session is already ended', 400, 'CALL_ALREADY_ENDED');
  }

  const channelName = getCallChannelName(sessionId);
  const agora = agoraService.generateRtcToken({
    userId: actorId,
    channelName,
    role: 'publisher',
  });

  return {
    sessionId,
    channelName,
    agora,
  };
};

const listCallSessions = async ({ userId, role, page = 1, limit = 20 }) => {
  const skip = (page - 1) * limit;
  const where = role === 'LISTENER' ? { listenerId: userId } : { userId };

  const [items, total] = await Promise.all([
    prisma.callSession.findMany({
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
    prisma.callSession.count({ where }),
  ]);

  const enriched = items.map((item) => ({
    ...item,
    channelName: getCallChannelName(item.id),
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

const storeSignal = async ({ sessionId, senderId, signal }) => {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new AppError('Call session not found', 404, 'CALL_SESSION_NOT_FOUND');
  }

  assertCallParticipant(session, senderId);

  await prisma.callEvent.create({
    data: {
      sessionId,
      eventType: 'call_signal',
      payload: {
        senderId,
        signal,
      },
    },
  });

  if (io) {
    io.to(`session:call:${sessionId}`).emit('call_signal', {
      sessionId,
      senderId,
      signal,
    });
  }
};

const emitLowBalanceEnded = async (sessionId) => {
  const session = await forceEndCallBySystem({
    sessionId,
    endReason: 'INSUFFICIENT_BALANCE',
    reasonCode: 'LOW_BALANCE',
  });

  if (!session) {
    return;
  }

  emitEvent(SYNC_EVENTS.WALLET_UPDATED, {
    userId: session.userId,
    source: 'call_low_balance_end',
    syncVersion: Date.now(),
  });
};

module.exports = {
  setRealtimeDependencies,
  requestCall,
  acceptCall,
  rejectCall,
  endCall,
  forceEndCallBySystem,
  renewCallToken,
  listCallSessions,
  storeSignal,
  emitLowBalanceEnded,
  getCallChannelName,
};
