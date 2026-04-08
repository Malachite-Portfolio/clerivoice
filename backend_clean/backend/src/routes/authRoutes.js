const router = require('express').Router();
const moduleAuthRoutes = require('../modules/auth/auth.routes');
const authService = require('../modules/auth/auth.service');
const { firebaseLogin } = require('../controllers/firebaseLoginController');
const { logger } = require('../config/logger');

const maskIdentity = (value) => {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.includes('@')) {
    const [name, domain] = input.split('@');
    return `${name.slice(0, 2)}***@${domain || ''}`;
  }
  if (input.length <= 4) return '****';
  return `${input.slice(0, 2)}***${input.slice(-2)}`;
};

// USER LOGIN (compatibility route for /api/v1/auth/login-user)
const loginUserCompat = async (req, res) => {
  try {
    const incomingCode =
      req.body?.code ||
      req.body?.otp ||
      req.body?.otpCode ||
      req.body?.verificationCode ||
      req.body?.pin;

    logger.info('[AuthCompat] login-user request received', {
      keys: Object.keys(req.body || {}),
      phone: maskIdentity(req.body?.phone),
      hasOtp: Boolean(String(incomingCode || '').trim()),
      ipAddress: req.ip,
    });

    const { phone, code: bodyCode, otp, otpCode, verificationCode, pin, displayName, referralCode, deviceId, deviceInfo } = req.body || {};
    const normalizedOtp = String(
      otp || bodyCode || otpCode || verificationCode || pin || ''
    ).trim();

    if (!phone || !normalizedOtp) {
      return res.status(400).json({
        success: false,
        message: 'Phone and code are required',
      });
    }

    const data = await authService.loginUserWithOtp({
      phone,
      otp: normalizedOtp,
      displayName,
      referralCode,
      deviceId,
      deviceInfo,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(200).json({
      success: true,
      message: 'User logged in',
      data,
    });
  } catch (error) {
    logger.warn('[AuthCompat] login-user failed', {
      code: error?.code || 'LOGIN_FAILED',
      statusCode: error?.statusCode || 500,
      message: error?.message || 'Login failed',
    });
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'LOGIN_FAILED',
      message: error?.message || 'Login failed',
    });
  }
};

router.post('/login-user', loginUserCompat);
router.post('/firebase-login', firebaseLogin);

// LISTENER LOGIN (compatibility route for /api/v1/auth/login-listener)
router.post('/login-listener', async (req, res) => {
  try {
    const incomingListenerId =
      req.body?.listenerId ||
      req.body?.phone ||
      req.body?.email ||
      req.body?.phoneOrEmail;

    const incomingPassword = String(req.body?.password || '').trim();
    const incomingOtp = String(
      req.body?.otp ||
        req.body?.code ||
        req.body?.otpCode ||
        req.body?.verificationCode ||
        req.body?.pin ||
        ''
    ).trim();

    logger.info('[AuthCompat] login-listener request received', {
      keys: Object.keys(req.body || {}),
      identity: maskIdentity(incomingListenerId),
      hasPassword: Boolean(incomingPassword),
      hasOtp: Boolean(incomingOtp),
      ipAddress: req.ip,
    });

    const { listenerId, phone, email, phoneOrEmail, password, deviceId, deviceInfo } = req.body || {};
    const listenerIdentity = listenerId || phone || email || phoneOrEmail;

    if (!listenerIdentity) {
      return res.status(400).json({
        success: false,
        message: 'Listener ID, phone, or email is required',
      });
    }

    if (incomingOtp) {
      const data = await authService.verifyListenerOtp({
        phone: listenerIdentity,
        otp: incomingOtp,
        purpose: req.body?.purpose || 'LOGIN',
        deviceId,
        deviceInfo,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(200).json({
        success: true,
        message: 'Listener logged in',
        data,
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required',
      });
    }

    const data = await authService.loginListenerWithPassword({
      listenerIdentity,
      password,
      deviceId,
      deviceInfo,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(200).json({
      success: true,
      message: 'Listener logged in',
      data,
    });
  } catch (error) {
    logger.warn('[AuthCompat] login-listener failed', {
      code: error?.code || 'LISTENER_LOGIN_FAILED',
      statusCode: error?.statusCode || 500,
      message: error?.message || 'Listener login failed',
    });
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'LISTENER_LOGIN_FAILED',
      message: error?.message || 'Listener login failed',
    });
  }
});

// Keep existing auth module routes (/send-otp, /verify-otp, /refresh, /logout, etc.).
router.use('/', moduleAuthRoutes);

module.exports = router;
