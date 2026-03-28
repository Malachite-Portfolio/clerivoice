const crypto = require('crypto');
const { RtcTokenBuilder, RtcRole, ChatTokenBuilder } = require('agora-token');
const { env } = require('../../config/env');
const { AppError } = require('../../utils/appError');

const DEFAULT_EXPIRY_SECONDS = Number(env.AGORA_TOKEN_EXPIRE_SECONDS || 3600);

const toUnixExpiry = (durationSeconds) =>
  Math.floor(Date.now() / 1000) + Number(durationSeconds || DEFAULT_EXPIRY_SECONDS);

const assertValidChannelName = (channelName) => {
  if (!channelName || typeof channelName !== 'string') {
    throw new AppError('Invalid Agora channel name', 400, 'INVALID_AGORA_CHANNEL');
  }
};

const toAgoraUid = (userId) => {
  const raw = String(userId || '').trim();
  if (!raw) {
    throw new AppError('Invalid Agora user id', 400, 'INVALID_AGORA_UID');
  }

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  const digest = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 8);
  const hashed = Number.parseInt(digest, 16);
  return Number.isFinite(hashed) && hashed > 0 ? hashed : 1;
};

const mapRtcRole = (role) => {
  const normalized = String(role || '').toLowerCase();

  if (normalized === 'subscriber' || normalized === 'audience') {
    return {
      value: RtcRole.SUBSCRIBER,
      label: 'subscriber',
    };
  }

  if (normalized === 'admin') {
    return {
      value: RtcRole.PUBLISHER,
      label: 'admin',
    };
  }

  return {
    value: RtcRole.PUBLISHER,
    label: 'publisher',
  };
};

const generateRtcToken = ({
  userId,
  channelName,
  role = 'publisher',
  expirySeconds = DEFAULT_EXPIRY_SECONDS,
}) => {
  assertValidChannelName(channelName);

  const uid = toAgoraUid(userId);
  const { value: rtcRole, label } = mapRtcRole(role);
  const expiresIn = Number(expirySeconds || DEFAULT_EXPIRY_SECONDS);

  const token = RtcTokenBuilder.buildTokenWithUid(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    rtcRole,
    expiresIn,
    expiresIn
  );
  if (!token) {
    throw new AppError('Failed to generate Agora RTC token', 500, 'AGORA_RTC_TOKEN_FAILED');
  }

  return {
    appId: env.AGORA_APP_ID,
    token,
    uid,
    channelName,
    role: label,
    expiresAt: new Date(toUnixExpiry(expiresIn) * 1000).toISOString(),
  };
};

const generateChatToken = ({ userId, expirySeconds = DEFAULT_EXPIRY_SECONDS }) => {
  const account = String(userId || '').trim();
  if (!account) {
    throw new AppError('Invalid Agora chat account', 400, 'INVALID_AGORA_CHAT_ACCOUNT');
  }

  const expiresIn = Number(expirySeconds || DEFAULT_EXPIRY_SECONDS);

  const token = ChatTokenBuilder.buildUserToken(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERTIFICATE,
    account,
    expiresIn
  );
  if (!token) {
    throw new AppError('Failed to generate Agora Chat token', 500, 'AGORA_CHAT_TOKEN_FAILED');
  }

  return {
    appId: env.AGORA_APP_ID,
    appKey: env.AGORA_CHAT_APP_KEY || env.AGORA_APP_ID,
    account,
    token,
    expiresAt: new Date(toUnixExpiry(expiresIn) * 1000).toISOString(),
  };
};

const buildCallChannelName = (sessionId) => `clarivoice_call_${String(sessionId)}`;
const buildChatChannelName = (sessionId) => `clarivoice_chat_${String(sessionId)}`;

module.exports = {
  generateRtcToken,
  generateChatToken,
  buildCallChannelName,
  buildChatChannelName,
  toAgoraUid,
};
