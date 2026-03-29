const authRoutes = require('../modules/auth/auth.routes');
const profileRoutes = require('../modules/profile/profile.routes');
const listenersRoutes = require('../modules/listeners/listeners.routes');
const walletRoutes = require('../modules/wallet/wallet.routes');
const referralRoutes = require('../modules/referral/referral.routes');
const chatRoutes = require('../modules/chat/chat.routes');
const callRoutes = require('../modules/call/call.routes');
const usageRoutes = require('../modules/usage/usage.routes');
const supportRoutes = require('../modules/support/support.routes');
const settingsRoutes = require('../modules/settings/settings.routes');
const appRoutes = require('../modules/app/app.routes');
const adminRoutes = require('../modules/admin/admin.routes');
const adminAuthRoutes = require('../modules/adminAuth/adminAuth.routes');
const agoraRoutes = require('../modules/agora/agora.routes');
const authService = require('../modules/auth/auth.service');

const router = require('express').Router();

// Compatibility endpoint for mobile clients calling /api/v1/auth/login-user with `code`.
router.post('/auth/login-user', async (req, res) => {
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
      message: 'User login successful',
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

// Compatibility endpoint for mobile clients calling /api/v1/auth/login-listener.
router.post('/auth/login-listener', async (req, res) => {
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
      message: 'Listener login successful',
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

router.use('/auth', authRoutes);
router.use('/me', profileRoutes);
router.use('/listeners', listenersRoutes);
router.use('/wallet', walletRoutes);
router.use('/referral', referralRoutes);
router.use('/chat', chatRoutes);
router.use('/call', callRoutes);
router.use('/usage', usageRoutes);
router.use('/support', supportRoutes);
router.use('/settings', settingsRoutes);
router.use('/app', appRoutes);
router.use('/admin', adminAuthRoutes);
router.use('/admin', adminRoutes);
router.use('/agora', agoraRoutes);

module.exports = router;
