const express = require('express');
const { validate } = require('../../middleware/validate');
const { authRateLimiter } = require('../../middleware/rateLimiter');
const { authMiddleware } = require('../../middleware/auth');
const controller = require('./auth.controller');
const {
  sendOtpSchema,
  verifyOtpSchema,
  loginUserSchema,
  loginSchema,
  loginListenerSchema,
  refreshSchema,
  logoutSchema,
} = require('./auth.validator');

const router = express.Router();

router.post('/send-otp', authRateLimiter, validate(sendOtpSchema), controller.sendOtp);
router.post('/verify-otp', authRateLimiter, validate(verifyOtpSchema), controller.verifyOtp);
router.post('/login-user', authRateLimiter, validate(loginUserSchema), controller.loginUser);
router.post('/login', authRateLimiter, validate(loginSchema), controller.login);
router.post(
  '/login-listener',
  authRateLimiter,
  validate(loginListenerSchema),
  controller.loginListener
);
router.post('/refresh', authRateLimiter, validate(refreshSchema), controller.refresh);
router.post('/logout', authMiddleware, validate(logoutSchema), controller.logout);

module.exports = router;
