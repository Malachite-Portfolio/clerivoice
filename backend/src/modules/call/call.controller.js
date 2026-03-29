const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const callService = require('./call.service');

const requestCall = asyncHandler(async (req, res) => {
  const data = await callService.requestCall({
    userId: req.user.id,
    listenerId: req.body.listenerId,
  });

  return successResponse(res, data, 'Call request sent');
});

const acceptCall = asyncHandler(async (req, res) => {
  const data = await callService.acceptCall({
    listenerId: req.user.id,
    sessionId: req.params.sessionId,
  });

  return successResponse(res, data, 'Call accepted');
});

const acceptCallDirect = asyncHandler(async (req, res) => {
  const data = await callService.acceptCall({
    listenerId: req.user.id,
    sessionId: req.body.sessionId,
  });

  return successResponse(res, data, 'Call accepted');
});

const rejectCall = asyncHandler(async (req, res) => {
  const data = await callService.rejectCall({
    listenerId: req.user.id,
    sessionId: req.params.sessionId,
    reason: req.body.reason,
  });

  return successResponse(res, data, 'Call rejected');
});

const rejectCallDirect = asyncHandler(async (req, res) => {
  const data = await callService.rejectCall({
    listenerId: req.user.id,
    sessionId: req.body.sessionId,
    reason: req.body.reason,
  });

  return successResponse(res, data, 'Call rejected');
});

const endCall = asyncHandler(async (req, res) => {
  const data = await callService.endCall({
    actorId: req.user.id,
    sessionId: req.params.sessionId,
    endReason: req.body.endReason,
  });

  return successResponse(res, data, 'Call ended');
});

const getCallSessions = asyncHandler(async (req, res) => {
  const data = await callService.listCallSessions({
    userId: req.user.id,
    role: req.user.role,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });

  return successResponse(res, data);
});

const refreshCallToken = asyncHandler(async (req, res) => {
  const data = await callService.renewCallToken({
    actorId: req.user.id,
    sessionId: req.params.sessionId,
  });

  return successResponse(res, data, 'Call token refreshed');
});

module.exports = {
  requestCall,
  acceptCall,
  acceptCallDirect,
  rejectCall,
  rejectCallDirect,
  endCall,
  getCallSessions,
  refreshCallToken,
};
