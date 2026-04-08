const dayjs = require('dayjs');
const { prisma } = require('../../config/prisma');
const { logger } = require('../../config/logger');
const { AppError } = require('../../utils/appError');
const sessionGuardService = require('../../services/sessionGuard.service');
const pushNotificationService = require('../../services/pushNotification.service');
const {
  emitHostStatusChanged,
  emitEvent,
  SYNC_EVENTS,
} = require('../../services/realtimeSync.service');
const agoraService = require('../../services/agora/AgoraService');

let io = null;
let billingManager = null;

const FINAL_CALL_STATES = new Set(['ENDED', 'CANCELLED', 'REJECTED', 'MISSED']);
const LISTABLE_CALL_STATUSES = new Set([
  'REQUESTED',
  'RINGING',
  'ACTIVE',
  'ENDED',
  'MISSED',
  'REJECTED',
  'CANCELLED',
]);
const VALID_CALL_TYPES = new Set(['audio', 'video']);
const configuredRingingTimeoutMs = Number(process.env.CALL_RINGING_TIMEOUT_MS || 35000);
const CALL_RINGING_TIMEOUT_MS = Number.isFinite(configuredRingingTimeoutMs)
  ? Math.max(10000, configuredRingingTimeoutMs)
  : 35000;
const configuredAcceptedConnectTimeoutMs = Number(
  process.env.CALL_ACCEPTED_CONNECT_TIMEOUT_MS || 30000,
);
const CALL_ACCEPTED_CONNECT_TIMEOUT_MS = Number.isFinite(configuredAcceptedConnectTimeoutMs)
  ? Math.max(10000, configuredAcceptedConnectTimeoutMs)
  : 30000;
const pendingRingingTimeouts = new Map();

const normalizeCallType = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (VALID_CALL_TYPES.has(normalized)) {
    return normalized;
  }

  return 'audio';
};

const resolveCallTypeFromSessionId = async (sessionId) => {
  if (!sessionId) {
    return 'audio';
  }

  const requestEvent = await prisma.callEvent.findFirst({
    where: {
      sessionId,
      eventType: 'call_request',
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      payload: true,
    },
  });

  return normalizeCallType(requestEvent?.payload?.callType);
};

const setRealtimeDependencies = ({ socketServer, sessionBillingManager }) => {
  io = socketServer;
  billingManager = sessionBillingManager;
};

const getCallChannelName = (sessionId) => agoraService.buildCallChannelName(sessionId);

const emitCallRealtime = (session, eventName, payload) => {
  if (!io || !session) {
    return;
  }

  io.to(`user:${session.userId}`).emit(eventName, payload);
  io.to(`user:${session.listenerId}`).emit(eventName, payload);
};

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

const clearPendingRingingTimeout = (sessionId, reason = 'unknown') => {
  const key = String(sessionId || '');
  if (!key) {
    return;
  }

  const timeout = pendingRingingTimeouts.get(key);
  if (timeout) {
    clearTimeout(timeout);
    pendingRingingTimeouts.delete(key);
    logger.info('[CallTimeout] cleared ringing timeout', {
      sessionId: key,
      reason,
    });
  }
};

const scheduleMissedCallTimeout = (
  sessionId,
  {
    timeoutMs = CALL_RINGING_TIMEOUT_MS,
    reasonCode = 'MISSED_CALL_TIMEOUT',
    statusGuards = ['REQUESTED', 'RINGING'],
    timeoutType = 'ringing',
  } = {},
) => {
  const key = String(sessionId || '');
  if (!key) {
    return;
  }

  clearPendingRingingTimeout(key, 'reschedule');

  const timeout = setTimeout(async () => {
    pendingRingingTimeouts.delete(key);

    try {
      const liveSession = await prisma.callSession.findUnique({
        where: { id: key },
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

      if (!liveSession || !statusGuards.includes(liveSession.status)) {
        return;
      }

      const callType = await resolveCallTypeFromSessionId(liveSession.id);
      await prisma.callEvent.create({
        data: {
          sessionId: liveSession.id,
          eventType: 'call_missed',
          payload: {
            reasonCode,
            callType,
            missedAt: new Date().toISOString(),
          },
        },
      });

      await finalizeCallSession({
        session: liveSession,
        status: 'MISSED',
        endReason: 'TIMEOUT',
        reasonCode,
        endedBy: 'SYSTEM',
        force: true,
      });

      const missedAt = new Date().toISOString();
      await Promise.allSettled([
        pushNotificationService.sendMissedCallPush({
          receiverId: liveSession.userId,
          receiverRole: 'USER',
          sessionId: liveSession.id,
          callerId: liveSession.listenerId,
          callerName: liveSession.listener?.displayName || 'Host',
          callerAvatar: liveSession.listener?.profileImageUrl || null,
          userId: liveSession.userId,
          listenerId: liveSession.listenerId,
          callType,
          missedAt,
        }),
        pushNotificationService.sendMissedCallPush({
          receiverId: liveSession.listenerId,
          receiverRole: 'LISTENER',
          sessionId: liveSession.id,
          callerId: liveSession.userId,
          callerName: liveSession.user?.displayName || 'User',
          callerAvatar: liveSession.user?.profileImageUrl || null,
          userId: liveSession.userId,
          listenerId: liveSession.listenerId,
          callType,
          missedAt,
        }),
      ]);

      logger.info('[CallTimeout] call marked missed after ringing timeout', {
        sessionId: liveSession.id,
        userId: liveSession.userId,
        listenerId: liveSession.listenerId,
        timeoutMs,
        timeoutType,
        reasonCode,
      });
    } catch (error) {
      logger.error('[CallTimeout] missed call timeout handling failed', {
        sessionId: key,
        timeoutType,
        reasonCode,
        message: error?.message || 'Unknown error',
      });
    }
  }, timeoutMs);

  pendingRingingTimeouts.set(key, timeout);
  logger.info('[CallTimeout] scheduled ringing timeout', {
    sessionId: key,
    timeoutMs,
    timeoutType,
    reasonCode,
  });
};

const hydrateCallSessionParticipants = async (session) => {
  if (!session?.id) {
    return session;
  }

  if (session?.user && session?.listener) {
    return session;
  }

  const hydrated = await prisma.callSession.findUnique({
    where: { id: session.id },
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

  return hydrated || session;
};

const emitMissedCallArtifacts = async ({
  session,
  reasonCode = 'MISSED',
  callerId = null,
  notifyUser = false,
  notifyListener = false,
}) => {
  const hydratedSession = await hydrateCallSessionParticipants(session);
  if (!hydratedSession?.id) {
    return;
  }

  const callType = await resolveCallTypeFromSessionId(hydratedSession.id);
  const missedAt = new Date().toISOString();

  await prisma.callEvent.create({
    data: {
      sessionId: hydratedSession.id,
      eventType: 'call_missed',
      payload: {
        reasonCode,
        callType,
        callerId: callerId || null,
        missedAt,
      },
    },
  });

  const pushTasks = [];

  if (notifyUser) {
    pushTasks.push(
      pushNotificationService.sendMissedCallPush({
        receiverId: hydratedSession.userId,
        receiverRole: 'USER',
        sessionId: hydratedSession.id,
        callerId: callerId || hydratedSession.listenerId,
        callerName: hydratedSession.listener?.displayName || 'Host',
        callerAvatar: hydratedSession.listener?.profileImageUrl || null,
        userId: hydratedSession.userId,
        listenerId: hydratedSession.listenerId,
        callType,
        missedAt,
      }),
    );
  }

  if (notifyListener) {
    pushTasks.push(
      pushNotificationService.sendMissedCallPush({
        receiverId: hydratedSession.listenerId,
        receiverRole: 'LISTENER',
        sessionId: hydratedSession.id,
        callerId: callerId || hydratedSession.userId,
        callerName: hydratedSession.user?.displayName || 'User',
        callerAvatar: hydratedSession.user?.profileImageUrl || null,
        userId: hydratedSession.userId,
        listenerId: hydratedSession.listenerId,
        callType,
        missedAt,
      }),
    );
  }

  await Promise.allSettled(pushTasks);

  if (io) {
    emitCallRealtime(hydratedSession, 'call_missed', {
      sessionId: hydratedSession.id,
      reasonCode,
      callType,
      callerId: callerId || null,
      missedAt,
    });
  }

  logger.info('[CallLifecycle] missed call artifacts emitted', {
    sessionId: hydratedSession.id,
    reasonCode,
    callerId: callerId || null,
    notifyUser,
    notifyListener,
  });
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
  clearPendingRingingTimeout(session?.id, 'finalize_call_session');

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

  const callType = await resolveCallTypeFromSessionId(session.id);

  const payload = {
    sessionId: session.id,
    channelName: getCallChannelName(session.id),
    callType,
    endReason,
    reasonCode: reasonCode || null,
    endedBy: endedBy || 'SYSTEM',
    durationSeconds,
    totalAmount: Number(updated.totalAmount || 0),
    billedMinutes: updated.billedMinutes,
  };

  if (io) {
    if (reasonCode === 'LOW_BALANCE') {
      emitCallRealtime(session, 'call_end_due_to_low_balance', payload);
    }
    emitCallRealtime(session, 'call_ended', payload);
    emitCallRealtime(session, 'session_ended', {
      ...payload,
      sessionType: 'call',
    });
  }

  return updated;
};

const requestCall = async ({ userId, listenerId, callType }) => {
  const check = await sessionGuardService.canStartCall({
    userId,
    listenerId,
    actorId: userId,
  });
  const normalizedCallType = normalizeCallType(callType);

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
        callType: normalizedCallType,
      },
    },
  });

  if (io) {
    io.to(`user:${listenerId}`).emit('call_request', {
      sessionId: session.id,
      channelName,
      callType: normalizedCallType,
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
      callType: normalizedCallType,
      listenerId,
    });
  }

  Promise.resolve()
    .then(() =>
      pushNotificationService.sendIncomingCallPush({
        listenerId,
        sessionId: session.id,
        requesterId: session.user?.id || userId,
        requesterName: session.user?.displayName || 'Incoming call',
        requesterAvatar: session.user?.profileImageUrl || null,
        ratePerMinute: Number(session.ratePerMinute),
        requestedAt: session.requestedAt?.toISOString?.() || new Date().toISOString(),
        callType: normalizedCallType,
      })
    )
    .catch((error) => {
      logger.warn('[Push] incoming call notification failed', {
        sessionId: session.id,
        listenerId,
        message: error?.message || 'Unknown error',
      });
    });

  logger.info('[Call] request created', {
    sessionId: session.id,
    userId,
    listenerId,
    channelName,
    status: session.status,
    callType: normalizedCallType,
  });
  logger.info('[CallLifecycle] call created', {
    sessionId: session.id,
    userId,
    listenerId,
    callType: normalizedCallType,
  });
  logger.info('[CallLifecycle] call ringing', {
    sessionId: session.id,
    status: session.status,
  });
  scheduleMissedCallTimeout(session.id);

  return {
    session: {
      ...session,
      channelName,
      callType: normalizedCallType,
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

  const existingAcceptedEvent = await prisma.callEvent.findFirst({
    where: {
      sessionId,
      eventType: 'call_accepted',
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (existingAcceptedEvent && ['RINGING', 'ACTIVE'].includes(session.status)) {
    const channelName = getCallChannelName(sessionId);
    const callType = await resolveCallTypeFromSessionId(sessionId);
    const listenerAgora = agoraService.generateRtcToken({
      userId: listenerId,
      channelName,
      role: 'publisher',
    });

    emitCallRealtime(session, 'call_accepted', {
      sessionId,
      channelName,
      callType,
      status: session.status,
    });

    scheduleMissedCallTimeout(sessionId, {
      timeoutMs: CALL_ACCEPTED_CONNECT_TIMEOUT_MS,
      reasonCode: 'CALL_ACCEPT_TIMEOUT',
      statusGuards: ['RINGING'],
      timeoutType: 'accepted_connect',
    });

    logger.info('[Call] acceptCall idempotent replay', {
      sessionId,
      listenerId,
      userId: session.userId,
      status: session.status,
      acceptedAt: existingAcceptedEvent.createdAt,
      callType,
    });

    return {
      session: {
        ...session,
        channelName,
        callType,
      },
      agora: listenerAgora,
    };
  }

  if (!['REQUESTED', 'RINGING'].includes(session.status)) {
    throw new AppError('Call session cannot be accepted now', 400, 'INVALID_CALL_STATE');
  }

  const updated =
    session.status === 'RINGING'
      ? session
      : await prisma.callSession.update({
          where: { id: sessionId },
          data: {
            status: 'RINGING',
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
    reason: 'CALL_ACCEPTED_PENDING_MEDIA',
  });

  const channelName = getCallChannelName(sessionId);
  const callType = await resolveCallTypeFromSessionId(sessionId);
  const listenerAgora = agoraService.generateRtcToken({
    userId: listenerId,
    channelName,
    role: 'publisher',
  });

  if (!existingAcceptedEvent) {
    await prisma.callEvent.create({
      data: {
        sessionId,
        eventType: 'call_accepted',
        payload: {
          listenerId,
          channelName,
          callType,
        },
      },
    });
  }

  emitCallRealtime(session, 'call_accepted', {
    sessionId,
    channelName,
    callType,
    status: updated.status,
  });

  logger.info('[Call] accepted', {
    sessionId,
    listenerId,
    userId: session.userId,
    channelName,
    status: updated.status,
    callType,
  });
  logger.info('[CallLifecycle] call accepted', {
    sessionId,
    listenerId,
    userId: session.userId,
    status: updated.status,
    callType,
  });
  scheduleMissedCallTimeout(sessionId, {
    timeoutMs: CALL_ACCEPTED_CONNECT_TIMEOUT_MS,
    reasonCode: 'CALL_ACCEPT_TIMEOUT',
    statusGuards: ['RINGING'],
    timeoutType: 'accepted_connect',
  });

  return {
    session: {
      ...updated,
      channelName,
      callType,
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
  clearPendingRingingTimeout(sessionId, 'reject_call');

  const updated = await finalizeCallSession({
    session,
    status: 'REJECTED',
    endReason: 'REJECTED',
    reasonCode: 'REJECTED_BY_LISTENER',
    endedBy: listenerId,
    force: true,
  });
  const callType = await resolveCallTypeFromSessionId(sessionId);

  await prisma.callEvent.create({
    data: {
      sessionId,
      eventType: 'call_rejected',
      payload: {
        callType,
        reasonCode: 'CALL_REJECTED',
        reason: reason || 'Call rejected',
      },
    },
  });

  emitCallRealtime(session, 'call_rejected', {
    sessionId,
    callType,
    reasonCode: 'CALL_REJECTED',
    reason: reason || 'Call rejected',
  });

  await emitMissedCallArtifacts({
    session,
    reasonCode: 'CALL_REJECTED',
    callerId: listenerId,
    notifyUser: true,
    notifyListener: false,
  });

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
  const endedBeforeConnection = session.status !== 'ACTIVE';
  clearPendingRingingTimeout(sessionId, 'end_call');

  const updated = await finalizeCallSession({
    session,
    status: session.status === 'ACTIVE' ? 'ENDED' : 'CANCELLED',
    endReason: normalizedEndReason,
    reasonCode: actorRole === 'LISTENER' ? 'ENDED_BY_LISTENER' : 'ENDED_BY_USER',
    endedBy: actorId,
    force: false,
  });

  if (endedBeforeConnection) {
    await emitMissedCallArtifacts({
      session,
      reasonCode:
        actorRole === 'LISTENER'
          ? 'CANCELLED_BY_LISTENER_BEFORE_CONNECT'
          : 'CANCELLED_BY_USER_BEFORE_CONNECT',
      callerId: actorId,
      notifyUser: actorRole === 'LISTENER',
      notifyListener: actorRole !== 'LISTENER',
    });
  }

  return updated;
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
    callType: await resolveCallTypeFromSessionId(sessionId),
    agora,
  };
};

const markCallParticipantJoined = async ({ actorId, sessionId }) => {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Call session not found', 404, 'CALL_SESSION_NOT_FOUND');
  }

  assertCallParticipant(session, actorId);

  if (FINAL_CALL_STATES.has(session.status)) {
    throw new AppError('Call session is already ended', 400, 'CALL_ALREADY_ENDED');
  }

  const eventType = `call_media_joined:${actorId}`;
  const existingEvent = await prisma.callEvent.findFirst({
    where: {
      sessionId,
      eventType,
    },
  });

  if (!existingEvent) {
    await prisma.callEvent.create({
      data: {
        sessionId,
        eventType,
        payload: {
          actorId,
          joinedAt: new Date().toISOString(),
        },
      },
    });
  }

  const joinedActors = new Set(
    (
      await prisma.callEvent.findMany({
        where: {
          sessionId,
          eventType: {
            in: [
              `call_media_joined:${session.userId}`,
              `call_media_joined:${session.listenerId}`,
            ],
          },
        },
        select: {
          eventType: true,
        },
      })
    ).map((item) => item.eventType.replace('call_media_joined:', ''))
  );

  logger.info('[Call] media joined', {
    sessionId,
    actorId,
    joinedActorIds: Array.from(joinedActors),
  });

  const acceptedEvent = await prisma.callEvent.findFirst({
    where: {
      sessionId,
      eventType: 'call_accepted',
    },
    select: {
      id: true,
      createdAt: true,
    },
  });
  const isCallAccepted = Boolean(acceptedEvent) || session.status === 'ACTIVE';

  if (!isCallAccepted) {
    logger.info('[Call] waiting for listener acceptance before activation', {
      sessionId,
      actorId,
      status: session.status,
      joinedActorIds: Array.from(joinedActors),
    });
    return {
      connected: false,
      session: {
        ...session,
        channelName: getCallChannelName(session.id),
        callType: await resolveCallTypeFromSessionId(session.id),
      },
      waitingForAccept: true,
    };
  }

  if (joinedActors.size < 2) {
    const callType = await resolveCallTypeFromSessionId(session.id);
    logger.info('[Call] waiting for both participants to join media', {
      sessionId,
      joinedActorIds: Array.from(joinedActors),
      acceptedAt: acceptedEvent?.createdAt || null,
    });
    return {
      connected: false,
      session: {
        ...session,
        channelName: getCallChannelName(session.id),
        callType,
      },
    };
  }

  const now = new Date();
  const callType = await resolveCallTypeFromSessionId(session.id);
  const shouldActivateSession = session.status !== 'ACTIVE';
  const updatedSession = shouldActivateSession
    ? await prisma.callSession.update({
        where: { id: sessionId },
        data: {
          status: 'ACTIVE',
          startedAt: session.startedAt || now,
          answeredAt: session.answeredAt || now,
        },
      })
    : session;

  if (shouldActivateSession) {
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
      billingManager.startCallBilling(sessionId, { runImmediately: true });
    }

    logger.info('[CallLifecycle] call connected', {
      sessionId,
      userId: session.userId,
      listenerId: session.listenerId,
      callType,
      joinedActorIds: Array.from(joinedActors),
      acceptedAt: acceptedEvent?.createdAt || null,
      status: 'ACTIVE',
    });

    emitCallRealtime(updatedSession, 'call_started', {
      sessionId,
      channelName: getCallChannelName(sessionId),
      callType,
      status: 'ACTIVE',
      startedAt: updatedSession.startedAt,
      answeredAt: updatedSession.answeredAt,
    });
  }

  return {
    connected: true,
    session: {
      ...updatedSession,
      channelName: getCallChannelName(updatedSession.id),
      callType,
    },
  };
};

const getCallSession = async ({ actorId, sessionId }) => {
  const session = await prisma.callSession.findUnique({
    where: { id: sessionId },
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

  if (!session) {
    throw new AppError('Call session not found', 404, 'CALL_SESSION_NOT_FOUND');
  }

  assertCallParticipant(session, actorId);

  const joinedEventTypes = [
    `call_media_joined:${session.userId}`,
    `call_media_joined:${session.listenerId}`,
  ];

  const events = await prisma.callEvent.findMany({
    where: {
      sessionId,
      eventType: {
        in: ['call_request', 'call_accepted', 'call_rejected', ...joinedEventTypes],
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      eventType: true,
      createdAt: true,
      payload: true,
    },
  });

  const callRequestEvent = events.find((event) => event.eventType === 'call_request') || null;
  const acceptedEvent = events.find((event) => event.eventType === 'call_accepted') || null;
  const rejectedEvent = events.find((event) => event.eventType === 'call_rejected') || null;
  const callType = normalizeCallType(callRequestEvent?.payload?.callType);
  const rejectedReasonCode = String(rejectedEvent?.payload?.reasonCode || '')
    .trim()
    .toUpperCase();
  const joinedActorIds = events
    .filter((event) => event.eventType.startsWith('call_media_joined:'))
    .map((event) => event.eventType.replace('call_media_joined:', ''));

  return {
    session: {
      ...session,
      channelName: getCallChannelName(session.id),
      callType,
    },
    realtime: {
      callType,
      isAccepted: Boolean(acceptedEvent) || session.status === 'ACTIVE',
      acceptedAt: acceptedEvent?.createdAt || null,
      isRejected:
        Boolean(rejectedEvent) ||
        ['REJECTED', 'CANCELLED', 'MISSED', 'ENDED'].includes(session.status),
      rejectedAt: rejectedEvent?.createdAt || null,
      rejectedReasonCode: rejectedReasonCode || null,
      joinedActorIds,
      hasUserJoinedMedia: joinedActorIds.includes(session.userId),
      hasListenerJoinedMedia: joinedActorIds.includes(session.listenerId),
    },
  };
};

const listCallSessions = async ({
  userId,
  role,
  page = 1,
  limit = 20,
  statuses = [],
  groupByUser = false,
}) => {
  const skip = (page - 1) * limit;
  const normalizedStatuses = (Array.isArray(statuses) ? statuses : [])
    .map((status) => String(status || '').trim().toUpperCase())
    .filter((status) => LISTABLE_CALL_STATUSES.has(status));
  const where = role === 'LISTENER' ? { listenerId: userId } : { userId };
  if (normalizedStatuses.length) {
    where.status = {
      in: normalizedStatuses,
    };
  }

  const fetchSessions = async ({ usePagination }) => {
    const sessions = await prisma.callSession.findMany({
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
      ...(usePagination ? { skip, take: limit } : {}),
    });

    const sessionIds = sessions.map((item) => item.id);
    const requestEvents = sessionIds.length
      ? await prisma.callEvent.findMany({
          where: {
            sessionId: { in: sessionIds },
            eventType: 'call_request',
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            sessionId: true,
            payload: true,
          },
        })
      : [];

    const callTypeBySessionId = new Map();
    requestEvents.forEach((event) => {
      if (!callTypeBySessionId.has(event.sessionId)) {
        callTypeBySessionId.set(
          event.sessionId,
          normalizeCallType(event?.payload?.callType),
        );
      }
    });

    return sessions.map((item) => ({
      ...item,
      channelName: getCallChannelName(item.id),
      callType: callTypeBySessionId.get(item.id) || 'audio',
    }));
  };

  if (!groupByUser) {
    const [items, total] = await Promise.all([
      fetchSessions({ usePagination: true }),
      prisma.callSession.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  const allItems = await fetchSessions({ usePagination: false });
  const groupedByCounterparty = new Map();
  const isListenerRole = String(role || '').trim().toUpperCase() === 'LISTENER';

  allItems.forEach((item) => {
    const counterparty = isListenerRole ? item.user : item.listener;
    const counterpartyId =
      counterparty?.id || (isListenerRole ? item.userId : item.listenerId);
    const groupKey = counterpartyId || `unknown:${item.id}`;
    const startedAt =
      item.startedAt || item.answeredAt || item.requestedAt || item.createdAt || null;
    const startedAtTime = startedAt ? new Date(startedAt).getTime() : 0;

    if (!groupedByCounterparty.has(groupKey)) {
      groupedByCounterparty.set(groupKey, {
        id: `group:${groupKey}`,
        user: counterparty || null,
        totalCalls: 0,
        totalDuration: 0,
        totalAmount: 0,
        lastCall: null,
        lastCallAt: 0,
      });
    }

    const group = groupedByCounterparty.get(groupKey);
    group.totalCalls += 1;
    group.totalDuration += Number(item.durationSeconds || 0);
    group.totalAmount += Number(item.totalAmount || 0);

    if (!group.lastCall || startedAtTime >= group.lastCallAt) {
      group.lastCall = item;
      group.lastCallAt = startedAtTime;
      group.user = counterparty || group.user;
    }
  });

  const groupedItems = Array.from(groupedByCounterparty.values())
    .map((group) => ({
      id: group.id,
      user: group.user,
      totalCalls: group.totalCalls,
      totalDuration: group.totalDuration,
      totalAmount: group.totalAmount,
      lastCall: group.lastCall,
      status: group.lastCall?.status || null,
      callType: group.lastCall?.callType || 'audio',
      startedAt:
        group.lastCall?.startedAt ||
        group.lastCall?.answeredAt ||
        group.lastCall?.requestedAt ||
        group.lastCall?.createdAt ||
        null,
      requestedAt:
        group.lastCall?.requestedAt || group.lastCall?.createdAt || null,
      durationSeconds: group.lastCall?.durationSeconds || 0,
      groupedByUser: true,
    }))
    .sort((left, right) => {
      const leftTime = left?.startedAt ? new Date(left.startedAt).getTime() : 0;
      const rightTime = right?.startedAt ? new Date(right.startedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  const pagedItems = groupedItems.slice(skip, skip + limit);

  return {
    items: pagedItems,
    pagination: {
      page,
      limit,
      total: groupedItems.length,
      totalPages: Math.ceil(groupedItems.length / limit),
    },
    groupedByUser: true,
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
  markCallParticipantJoined,
  getCallSession,
  listCallSessions,
  storeSignal,
  emitLowBalanceEnded,
  getCallChannelName,
};
