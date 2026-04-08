const express = require('express');
const { validate } = require('../../middleware/validate');
const { authRateLimiter } = require('../../middleware/rateLimiter');
const { authMiddleware } = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/roles');
const controller = require('./adminAuth.controller');
const {
  loginSchema,
  refreshSchema,
  logoutSchema,
} = require('../auth/auth.validator');

const router = express.Router();

router.post('/auth/login', authRateLimiter, validate(loginSchema), controller.login);
router.post('/auth/refresh', authRateLimiter, validate(refreshSchema), controller.refresh);
router.post('/auth/logout', validate(logoutSchema), controller.logout);
router.get('/me', authMiddleware, allowRoles('ADMIN'), controller.me);

module.exports = router;
