const express = require('express');
const { validate } = require('../../middleware/validate');
const { authRateLimiter } = require('../../middleware/rateLimiter');
const { authMiddleware } = require('../../middleware/auth');
const controller = require('./auth.controller');
const {
  sendOtpSchema,
  verifyOtpSchema,
  loginUserSchema,
  listenerSendOtpSchema,
  listenerVerifyOtpSchema,
  loginSchema,
  loginListenerSchema,
  refreshSchema,
  logoutSchema,
} = require('./auth.validator');

const router = express.Router();

router.post('/send-otp', authRateLimiter, validate(sendOtpSchema), controller.sendOtp);
router.post(
  '/send-listener-otp',
  authRateLimiter,
  validate(listenerSendOtpSchema),
  controller.sendListenerOtp
);
router.post('/verify-otp', authRateLimiter, validate(verifyOtpSchema), controller.verifyOtp);
router.post(
  '/verify-listener-otp',
  authRateLimiter,
  validate(listenerVerifyOtpSchema),
  controller.verifyListenerOtp
);
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
