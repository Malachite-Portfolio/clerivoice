const express = require('express');
const authRoutes = require('./authRoutes');
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

const router = express.Router();

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

