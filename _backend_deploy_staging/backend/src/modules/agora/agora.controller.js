const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const agoraModuleService = require('./agora.service');

const createRtcToken = asyncHandler(async (req, res) => {
  const data = await agoraModuleService.issueRtcToken({
    requesterUserId: req.user.id,
    sessionId: req.body.sessionId,
    role: req.body.role,
    expirySeconds: req.body.expirySeconds,
  });

  return successResponse(res, data, 'RTC token generated');
});

const createChatToken = asyncHandler(async (req, res) => {
  const data = await agoraModuleService.issueChatToken({
    requesterUserId: req.user.id,
    sessionId: req.body.sessionId,
    expirySeconds: req.body.expirySeconds,
  });

  return successResponse(res, data, 'Chat token generated');
});

module.exports = {
  createRtcToken,
  createChatToken,
};
