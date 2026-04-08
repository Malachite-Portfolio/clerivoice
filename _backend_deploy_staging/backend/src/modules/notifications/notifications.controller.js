const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const notificationsService = require('./notifications.service');

const registerPushDevice = asyncHandler(async (req, res) => {
  const data = await notificationsService.registerDevice({
    userId: req.user.id,
    payload: req.body,
  });

  return successResponse(res, data, 'Push device registered');
});

const unregisterPushDevice = asyncHandler(async (req, res) => {
  const data = await notificationsService.unregisterDevice({
    userId: req.user.id,
    expoPushToken: req.body.expoPushToken,
  });

  return successResponse(res, data, 'Push device unregistered');
});

module.exports = {
  registerPushDevice,
  unregisterPushDevice,
};
