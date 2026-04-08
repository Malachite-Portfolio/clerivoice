const { prisma } = require('../../config/prisma');
const sessionGuardService = require('../../services/sessionGuard.service');
const agoraService = require('../../services/agoraService');
const { AppError } = require('../../utils/appError');

const COMBINED_GUARD_MESSAGE =
  'You do not have sufficient balance or this host is currently unavailable.';

const FINAL_CALL_STATES = new Set(['ENDED', 'CANCELLED', 'REJECTED', 'MISSED']);
const FINAL_CHAT_STATES = new Set(['ENDED', 'CANCELLED', 'REJECTED']);

const wrapGuardError = (error) => {
  if (['HOST_BUSY', 'HOST_OFFLINE'].includes(error?.code)) {
    throw error;
  }

  if (['INSUFFICIENT_BALANCE', 'HOST_UNAVAILABLE'].includes(error?.code)) {
    throw new AppError(
      COMBINED_GUARD_MESSAGE,
      400,
      'INSUFFICIENT_BALANCE_OR_HOST_UNAVAILABLE',
      error?.data || null
    );
  }

  throw error;
};

const assertCallParticipant = (session, requesterUserId) => {
  if (session.userId !== requesterUserId && session.listenerId !== requesterUserId) {
    throw new AppError('You are not part of this call session.', 403, 'CALL_ACCESS_DENIED');
  }
};

const assertChatParticipant = (session, requesterUserId) => {
  if (session.userId !== requesterUserId && session.listenerId !== requesterUserId) {
    throw new AppError('You are not part of this chat session.', 403, 'CHAT_ACCESS_DENIED');
  }
};

const issueRtcToken = async ({
  requesterUserId,
  sessionId,
  role = 'publisher',
  expirySeconds,
}) => {
  const session = await prisma.callSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError('Call session not found.', 404, 'CALL_SESSION_NOT_FOUND');
  }

  assertCallParticipant(session, requesterUserId);

  if (FINAL_CALL_STATES.has(session.status)) {
    throw new AppError('Call session is already ended.', 400, 'CALL_ALREADY_ENDED');
  }

  // Session guard runs at session start and again for still-pending requests.
  if (['REQUESTED', 'RINGING'].includes(session.status)) {
    try {
      await sessionGuardService.canStartCall({
        userId: session.userId,
        listenerId: session.listenerId,
        actorId: requesterUserId,
      });
    } catch (error) {
      wrapGuardError(error);
    }
  }

  const channelName = agoraService.buildCallChannelName(session.id);
  const generated = agoraService.generateRtcToken(
    channelName,
    requesterUserId,
    role,
    expirySeconds
  );

  return {
    sessionId: session.id,
    appId: generated.appId,
    token: generated.token,
    channelName: generated.channelName,
    uid: String(generated.uid),
    role: generated.role,
    expiresAt: generated.expiresAt,
  };
};

const issueChatToken = async ({
  requesterUserId,
  sessionId,
  expirySeconds,
}) => {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError('Chat session not found.', 404, 'CHAT_SESSION_NOT_FOUND');
  }

  assertChatParticipant(session, requesterUserId);

  if (FINAL_CHAT_STATES.has(session.status)) {
    throw new AppError('Chat session is already ended.', 400, 'CHAT_ALREADY_ENDED');
  }

  // Session guard runs at session start and again for still-pending requests.
  if (session.status === 'REQUESTED') {
    try {
      await sessionGuardService.canStartChat({
        userId: session.userId,
        listenerId: session.listenerId,
        actorId: requesterUserId,
      });
    } catch (error) {
      wrapGuardError(error);
    }
  }

  const generated = agoraService.generateChatToken(requesterUserId, expirySeconds);

  return {
    sessionId: session.id,
    appId: generated.appId,
    appKey: generated.appKey,
    token: generated.token,
    userId: generated.account,
    expiresAt: generated.expiresAt,
  };
};

module.exports = {
  issueRtcToken,
  issueChatToken,
};
