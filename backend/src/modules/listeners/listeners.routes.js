const express = require('express');
const controller = require('./listeners.controller');
const { validate } = require('../../middleware/validate');
const { authMiddleware } = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/roles');
const { listListenersQuerySchema, updateAvailabilitySchema } = require('./listeners.validator');

const router = express.Router();

router.get('/', validate(listListenersQuerySchema, 'query'), controller.getListeners);
router.get(
  '/me/dashboard',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  controller.getMyDashboard
);
router.get(
  '/me/availability',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  controller.getMyAvailability
);
router.post(
  '/me/availability',
  authMiddleware,
  allowRoles('LISTENER', 'ADMIN'),
  validate(updateAvailabilitySchema),
  controller.updateMyAvailability
);
router.get('/:id', controller.getListener);
router.get('/:id/availability', controller.getAvailability);

module.exports = router;
