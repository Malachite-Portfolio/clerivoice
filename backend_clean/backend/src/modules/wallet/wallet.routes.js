const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const controller = require('./wallet.controller');
const {
  walletHistoryQuerySchema,
  createOrderSchema,
  verifyPaymentSchema,
  applyCouponSchema,
  withdrawalHistoryQuerySchema,
  withdrawalRequestSchema,
} = require('./wallet.validator');

const router = express.Router();

router.get('/summary', authMiddleware, controller.getSummary);
router.get('/history', authMiddleware, validate(walletHistoryQuerySchema, 'query'), controller.getHistory);
router.get('/plans', authMiddleware, controller.getPlans);
router.get(
  '/withdrawal/config',
  authMiddleware,
  controller.getWithdrawalConfig
);
router.get(
  '/withdrawal/history',
  authMiddleware,
  validate(withdrawalHistoryQuerySchema, 'query'),
  controller.getWithdrawalHistory
);
router.post(
  '/withdrawal/request',
  authMiddleware,
  validate(withdrawalRequestSchema),
  controller.requestWithdrawal
);
router.post('/create-order', authMiddleware, validate(createOrderSchema), controller.createOrder);
router.post('/verify-payment', authMiddleware, validate(verifyPaymentSchema), controller.verifyPayment);
router.post('/apply-coupon', authMiddleware, validate(applyCouponSchema), controller.applyCoupon);

module.exports = router;
