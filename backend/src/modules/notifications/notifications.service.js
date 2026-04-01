const pushNotificationService = require('../../services/pushNotification.service');

const registerDevice = async ({ userId, payload }) => {
  return pushNotificationService.registerPushDevice({
    userId,
    ...payload,
  });
};

const unregisterDevice = async ({ userId, expoPushToken }) => {
  return pushNotificationService.unregisterPushDevice({
    userId,
    expoPushToken,
  });
};

module.exports = {
  registerDevice,
  unregisterDevice,
};
