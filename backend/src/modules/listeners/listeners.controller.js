const { StatusCodes } = require('http-status-codes');
const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const listenerService = require('./listeners.service');

const getListeners = asyncHandler(async (req, res) => {
  const data = await listenerService.listListeners(req.query);
  return successResponse(res, data);
});

const getListener = asyncHandler(async (req, res) => {
  const data = await listenerService.getListenerById(req.params.id);
  if (!data) {
    return errorResponse(res, 'Listener not found', 'LISTENER_NOT_FOUND', StatusCodes.NOT_FOUND);
  }

  return successResponse(res, data);
});

const getAvailability = asyncHandler(async (req, res) => {
  const data = await listenerService.getListenerAvailability(req.params.id);

  if (!data) {
    return errorResponse(res, 'Listener not found', 'LISTENER_NOT_FOUND', StatusCodes.NOT_FOUND);
  }

  return successResponse(res, data);
});

module.exports = {
  getListeners,
  getListener,
  getAvailability,
};
