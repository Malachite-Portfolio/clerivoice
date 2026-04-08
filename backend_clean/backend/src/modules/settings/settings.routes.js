const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const controller = require('./settings.controller');
const { updateSettingsSchema } = require('./settings.validator');

const router = express.Router();

router.get('/', authMiddleware, controller.getSettings);
router.patch('/', authMiddleware, validate(updateSettingsSchema), controller.patchSettings);

module.exports = router;
