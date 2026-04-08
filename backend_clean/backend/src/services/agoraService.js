const baseAgoraService = require('./agora/AgoraService');
const { env } = require('../config/env');

const generateRtcToken = (
  channelName,
  uid,
  role = 'publisher',
  expirySeconds = env.AGORA_TOKEN_EXPIRE_SECONDS
) =>
  baseAgoraService.generateRtcToken({
    userId: uid,
    channelName,
    role,
    expirySeconds,
  });

const generateChatToken = (
  userId,
  expirySeconds = env.AGORA_TOKEN_EXPIRE_SECONDS
) =>
  baseAgoraService.generateChatToken({
    userId,
    expirySeconds,
  });

module.exports = {
  generateRtcToken,
  generateChatToken,
  buildCallChannelName: baseAgoraService.buildCallChannelName,
  buildChatChannelName: baseAgoraService.buildChatChannelName,
  toAgoraUid: baseAgoraService.toAgoraUid,
};
