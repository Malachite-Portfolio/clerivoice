const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const controller = require('./notifications.controller');
const {
  registerPushDeviceSchema,
  unregisterPushDeviceSchema,
} = require('./notifications.validator');

const router = express.Router();

router.post('/device', authMiddleware, validate(registerPushDeviceSchema), controller.registerPushDevice);
router.delete(
  '/device',
  authMiddleware,
  validate(unregisterPushDeviceSchema),
  controller.unregisterPushDevice
);

module.exports = router;
