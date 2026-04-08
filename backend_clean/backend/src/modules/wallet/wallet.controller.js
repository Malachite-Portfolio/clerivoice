const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const walletService = require('./wallet.service');

const getSummary = asyncHandler(async (req, res) => {
  const data = await walletService.getWalletSummary(req.user.id);
  return successResponse(res, data);
});

const getHistory = asyncHandler(async (req, res) => {
  const data = await walletService.getWalletHistory(req.user.id, req.query);
  return successResponse(res, data);
});

const getPlans = asyncHandler(async (_req, res) => {
  const data = await walletService.getWalletPlans();
  return successResponse(res, { plans: data });
});

const getWithdrawalConfig = asyncHandler(async (req, res) => {
  const data = await walletService.getWithdrawalConfig(req.user.id);
  return successResponse(res, data);
});

const getWithdrawalHistory = asyncHandler(async (req, res) => {
  const data = await walletService.getWithdrawalHistory(req.user.id, req.query);
  return successResponse(res, data);
});

const requestWithdrawal = asyncHandler(async (req, res) => {
  const data = await walletService.requestWithdrawal({
    userId: req.user.id,
    amount: req.body.amount,
    note: req.body.note,
  });

  return successResponse(res, data, 'Withdrawal request submitted');
});

const createOrder = asyncHandler(async (req, res) => {
  const data = await walletService.createOrder({
    userId: req.user.id,
    ...req.body,
  });

  return successResponse(res, data, 'Payment order created successfully');
});

const verifyPayment = asyncHandler(async (req, res) => {
  const data = await walletService.verifyPayment({
    userId: req.user.id,
    ...req.body,
  });

  return successResponse(res, data, 'Payment verified successfully');
});

const applyCoupon = asyncHandler(async (req, res) => {
  const data = await walletService.evaluateCoupon(req.body);

  return successResponse(res, {
    valid: data.valid,
    discountAmount: data.discountAmount,
    payableAmount: data.payableAmount,
    reason: data.reason,
    coupon: data.coupon
      ? {
          code: data.coupon.code,
          description: data.coupon.description,
        }
      : null,
  });
});

module.exports = {
  getSummary,
  getHistory,
  getPlans,
  getWithdrawalConfig,
  getWithdrawalHistory,
  requestWithdrawal,
  createOrder,
  verifyPayment,
  applyCoupon,
};
