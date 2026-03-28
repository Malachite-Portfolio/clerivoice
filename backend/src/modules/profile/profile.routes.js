const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const controller = require('./profile.controller');
const { updateProfileSchema } = require('./profile.validator');

const router = express.Router();

router.get('/', authMiddleware, controller.getMe);
router.patch('/', authMiddleware, validate(updateProfileSchema), controller.patchMe);
router.delete('/', authMiddleware, controller.deleteMe);

module.exports = router;
