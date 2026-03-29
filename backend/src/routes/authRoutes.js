const router = require('express').Router();
const moduleAuthRoutes = require('../modules/auth/auth.routes');
const authService = require('../modules/auth/auth.service');

// USER LOGIN (compatibility route for /api/v1/auth/login-user)
router.post('/login-user', async (req, res) => {
  try {
    const { phone, code, otp, displayName, referralCode, deviceId, deviceInfo } = req.body || {};
    const normalizedOtp = String(otp || code || '').trim();

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
    console.error('login-user error:', error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'LOGIN_FAILED',
      message: error?.message || 'Login failed',
    });
  }
});

// LISTENER LOGIN (compatibility route for /api/v1/auth/login-listener)
router.post('/login-listener', async (req, res) => {
  try {
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
    console.error('login-listener error:', error);
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

