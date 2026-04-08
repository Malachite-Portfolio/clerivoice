const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const referralService = require('./referral.service');

const getMyReferral = asyncHandler(async (req, res) => {
  const data = await referralService.getMyReferralInfo(req.user.id);
  return successResponse(res, data);
});

const applyCode = asyncHandler(async (req, res) => {
  const data = await referralService.applyReferralCode({
    referredUserId: req.user.id,
    referralCode: req.body.referralCode,
  });

  return successResponse(res, data, 'Referral code applied successfully');
});

const getHistory = asyncHandler(async (req, res) => {
  const data = await referralService.getReferralHistory(req.user.id);
  return successResponse(res, data);
});

const getFaq = asyncHandler(async (_req, res) => {
  const data = await referralService.getReferralFaq();
  return successResponse(res, { faq: data });
});

module.exports = {
  getMyReferral,
  applyCode,
  getHistory,
  getFaq,
};
