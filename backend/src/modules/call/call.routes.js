const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const controller = require('./call.controller');
const {
  callRequestSchema,
  callActionSchema,
  callEndSchema,
  callTokenRefreshSchema,
} = require('./call.validator');

const router = express.Router();

router.post('/request', authMiddleware, validate(callRequestSchema), controller.requestCall);
router.post(
  '/:sessionId/accept',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  validate(callActionSchema),
  controller.acceptCall
);
router.post(
  '/:sessionId/reject',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  validate(callActionSchema),
  controller.rejectCall
);
router.post('/:sessionId/end', authMiddleware, validate(callEndSchema), controller.endCall);
router.post(
  '/:sessionId/token',
  authMiddleware,
  validate(callTokenRefreshSchema),
  controller.refreshCallToken
);
router.get('/sessions', authMiddleware, controller.getCallSessions);

module.exports = router;
