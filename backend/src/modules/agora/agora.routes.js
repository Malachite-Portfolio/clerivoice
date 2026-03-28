const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const controller = require('./agora.controller');
const { rtcTokenSchema, chatTokenSchema } = require('./agora.validator');

const router = express.Router();

router.post('/rtc-token', authMiddleware, validate(rtcTokenSchema), controller.createRtcToken);
router.post('/chat-token', authMiddleware, validate(chatTokenSchema), controller.createChatToken);

module.exports = router;
