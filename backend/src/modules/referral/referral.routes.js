const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const controller = require('./referral.controller');
const { applyReferralCodeSchema } = require('./referral.validator');

const router = express.Router();

router.get('/me', authMiddleware, controller.getMyReferral);
router.post('/apply-code', authMiddleware, validate(applyReferralCodeSchema), controller.applyCode);
router.get('/history', authMiddleware, controller.getHistory);
router.get('/faq', authMiddleware, controller.getFaq);

module.exports = router;
