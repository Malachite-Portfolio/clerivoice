const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const controller = require('./chat.controller');
const {
  chatRequestSchema,
  chatEndSchema,
  chatActionSchema,
  chatBodyActionSchema,
  chatSessionsQuerySchema,
  chatSendMessageSchema,
  chatTokenRefreshSchema,
} = require('./chat.validator');

const router = express.Router();

router.post('/request', authMiddleware, validate(chatRequestSchema), controller.requestChat);
router.post(
  '/accept',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  validate(chatBodyActionSchema),
  controller.acceptChatDirect
);
router.post(
  '/reject',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  validate(chatBodyActionSchema),
  controller.rejectChatDirect
);
router.post(
  '/:sessionId/accept',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  validate(chatActionSchema),
  controller.acceptChat
);
router.post(
  '/:sessionId/reject',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  validate(chatActionSchema),
  controller.rejectChat
);
router.post('/:sessionId/end', authMiddleware, validate(chatEndSchema), controller.endChat);
router.post(
  '/:sessionId/token',
  authMiddleware,
  validate(chatTokenRefreshSchema),
  controller.refreshChatToken
);
router.get('/sessions', authMiddleware, validate(chatSessionsQuerySchema, 'query'), controller.getSessions);
router.get('/:sessionId/messages', authMiddleware, controller.getMessages);
router.post('/:sessionId/messages', authMiddleware, validate(chatSendMessageSchema), controller.sendMessage);

module.exports = router;
