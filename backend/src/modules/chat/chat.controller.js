const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const chatService = require('./chat.service');

const requestChat = asyncHandler(async (req, res) => {
  const data = await chatService.requestChat({
    userId: req.user.id,
    listenerId: req.body.listenerId,
  });

  return successResponse(res, data, 'Chat request sent');
});

const acceptChat = asyncHandler(async (req, res) => {
  const data = await chatService.acceptChat({
    listenerId: req.user.id,
    sessionId: req.params.sessionId,
  });

  return successResponse(res, data, 'Chat accepted');
});

const rejectChat = asyncHandler(async (req, res) => {
  const data = await chatService.rejectChat({
    listenerId: req.user.id,
    sessionId: req.params.sessionId,
  });

  return successResponse(res, data, 'Chat rejected');
});

const endChat = asyncHandler(async (req, res) => {
  const data = await chatService.endChat({
    actorId: req.user.id,
    sessionId: req.params.sessionId,
    endReason: req.body.endReason,
  });

  return successResponse(res, data, 'Chat session ended');
});

const getSessions = asyncHandler(async (req, res) => {
  const data = await chatService.listChatSessions({
    userId: req.user.id,
    role: req.user.role,
    ...req.query,
  });

  return successResponse(res, data);
});

const getMessages = asyncHandler(async (req, res) => {
  const data = await chatService.getChatMessages({
    userId: req.user.id,
    sessionId: req.params.sessionId,
  });

  return successResponse(res, data);
});

const refreshChatToken = asyncHandler(async (req, res) => {
  const data = await chatService.renewChatToken({
    actorId: req.user.id,
    sessionId: req.params.sessionId,
  });

  return successResponse(res, data, 'Chat token refreshed');
});

module.exports = {
  requestChat,
  acceptChat,
  rejectChat,
  endChat,
  refreshChatToken,
  getSessions,
  getMessages,
};
