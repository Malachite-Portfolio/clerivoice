const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const withdrawalService = require('./withdrawal.service');

const createWithdrawal = asyncHandler(async (req, res) => {
  const data = await withdrawalService.createListenerWithdrawalRequest({
    userId: req.user.id,
    amount: req.body.amount,
    bankName: req.body.bankName,
    accountHolderName: req.body.accountHolderName,
    accountNumber: req.body.accountNumber,
    accountNumberLast4: req.body.accountNumberLast4,
    ifscCode: req.body.ifscCode,
    note: req.body.note,
  });

  return successResponse(res, data, 'Withdrawal request submitted');
});

const listMyWithdrawals = asyncHandler(async (req, res) => {
  const data = await withdrawalService.listListenerWithdrawals(req.user.id, req.query);
  return successResponse(res, data);
});

const getMyWithdrawalById = asyncHandler(async (req, res) => {
  const data = await withdrawalService.getListenerWithdrawalById({
    userId: req.user.id,
    withdrawalId: req.params.id,
  });

  return successResponse(res, data);
});

module.exports = {
  createWithdrawal,
  listMyWithdrawals,
  getMyWithdrawalById,
};
