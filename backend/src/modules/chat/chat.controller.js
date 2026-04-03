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

const acceptChatDirect = asyncHandler(async (req, res) => {
  const data = await chatService.acceptChat({
    listenerId: req.user.id,
    sessionId: req.body.sessionId,
  });

  return successResponse(res, data, 'Chat accepted');
});

const rejectChat = asyncHandler(async (req, res) => {
  const data = await chatService.rejectChat({
    listenerId: req.user.id,
    sessionId: req.params.sessionId,
    reason: req.body.reason,
  });

  return successResponse(res, data, 'Chat rejected');
});

const rejectChatDirect = asyncHandler(async (req, res) => {
  const data = await chatService.rejectChat({
    listenerId: req.user.id,
    sessionId: req.body.sessionId,
    reason: req.body.reason,
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

const sendMessage = asyncHandler(async (req, res) => {
  const data = await chatService.sendMessage({
    sessionId: req.params.sessionId,
    senderId: req.user.id,
    receiverId: req.body.receiverId,
    content: req.body.content,
    messageType: req.body.messageType,
  });

  return successResponse(res, data, 'Message sent');
});

const reportUser = asyncHandler(async (req, res) => {
  const data = await chatService.reportUserInChat({
    reporterId: req.user.id,
    sessionId: req.body.sessionId,
    reportedUserId: req.body.reportedUserId,
    reason: req.body.reason,
  });

  return successResponse(res, data, 'Report submitted');
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
  acceptChatDirect,
  rejectChat,
  rejectChatDirect,
  endChat,
  refreshChatToken,
  getSessions,
  getMessages,
  sendMessage,
  reportUser,
};
