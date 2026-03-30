const router = require('express').Router();
const moduleAuthRoutes = require('../modules/auth/auth.routes');
const authService = require('../modules/auth/auth.service');
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
    const demoOtpBypass =
      String(process.env.DEMO_USER_OTP_BYPASS).toLowerCase() === 'true';
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

    if (demoOtpBypass && String(incomingCode) === '123456') {
      const phone = req.body?.phone || 'demo';
      return res.status(200).json({
        success: true,
        message: 'Demo login success',
        token: 'demo-token',
        user: {
          id: 'demo-user',
          phone,
        },
        // Keep existing frontend compatibility (authApi expects response.data.data)
        data: {
          user: {
            id: 'demo-user',
            phone,
            role: 'USER',
            status: 'ACTIVE',
            displayName: 'Demo User',
          },
          accessToken: 'demo-token',
          refreshToken: 'demo-refresh-token',
          demoMode: true,
        },
      });
    }

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

// LISTENER LOGIN (compatibility route for /api/v1/auth/login-listener)
router.post('/login-listener', async (req, res) => {
  try {
    const demoListenerBypass =
      String(process.env.DEMO_LISTENER_LOGIN_BYPASS).toLowerCase() === 'true';

    const incomingListenerId =
      req.body?.listenerId ||
      req.body?.phone ||
      req.body?.email ||
      req.body?.phoneOrEmail;

    const incomingPassword = String(req.body?.password || '').trim();

    logger.info('[AuthCompat] login-listener request received', {
      keys: Object.keys(req.body || {}),
      identity: maskIdentity(incomingListenerId),
      hasPassword: Boolean(incomingPassword),
      ipAddress: req.ip,
    });

    if (
      demoListenerBypass &&
      String(incomingListenerId) === '000000101' &&
      incomingPassword === '12345678'
    ) {
      return res.status(200).json({
        success: true,
        message: 'Demo listener login success',
        data: {
          listener: {
            id: 'listener-demo-1',
            listenerId: '000000101',
            name: 'Demo Listener',
            role: 'LISTENER',
            status: 'ACTIVE',
          },
          // Keep existing frontend compatibility (client expects data.user)
          user: {
            id: 'listener-demo-1',
            phone: null,
            email: null,
            displayName: 'Demo Listener',
            role: 'LISTENER',
            status: 'ACTIVE',
            listenerProfile: {
              availability: 'ONLINE',
              isEnabled: true,
            },
          },
          accessToken: 'demo-listener-token',
          refreshToken: 'demo-listener-refresh-token',
          demoMode: true,
        },
      });
    }

    const { listenerId, phone, email, phoneOrEmail, password, deviceId, deviceInfo } = req.body || {};
    const listenerIdentity = listenerId || phone || email || phoneOrEmail;

    if (!listenerIdentity) {
      return res.status(400).json({
        success: false,
        message: 'Listener ID, phone, or email is required',
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
