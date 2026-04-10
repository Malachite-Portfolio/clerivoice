const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const adminService = require('./admin.service');

const listUsers = asyncHandler(async (req, res) => {
  const data = await adminService.listUsers(req.query);
  return successResponse(res, data);
});

const listListeners = asyncHandler(async (req, res) => {
  const data = await adminService.listListeners(req.query);
  return successResponse(res, data);
});

const updateListenerRates = asyncHandler(async (req, res) => {
  const data = await adminService.updateListenerRates({
    listenerId: req.params.id,
    adminId: req.user.id,
    ...req.body,
  });
  return successResponse(res, data, 'Listener rates updated');
});

const createListenerByAdmin = asyncHandler(async (req, res) => {
  const data = await adminService.createListenerByAdmin({
    adminId: req.user.id,
    ...req.body,
  });
  return successResponse(res, data, 'Listener created successfully', 201);
});

const getListenerPricingHistory = asyncHandler(async (req, res) => {
  const data = await adminService.getListenerPricingHistory({
    listenerId: req.params.id,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });
  return successResponse(res, data);
});

const updateListenerStatus = asyncHandler(async (req, res) => {
  const data = await adminService.updateListenerStatus({
    listenerId: req.params.id,
    payload: req.body,
  });
  return successResponse(res, data, 'Listener status updated');
});

const updateListenerVisibility = asyncHandler(async (req, res) => {
  const data = await adminService.updateListenerVisibility({
    listenerId: req.params.id,
    visible: req.body.visible,
  });
  return successResponse(res, data, 'Listener visibility updated');
});

const removeListenerSoft = asyncHandler(async (req, res) => {
  const data = await adminService.removeListenerSoft({
    listenerId: req.params.id,
    adminId: req.user.id,
    reason: req.body.reason,
  });
  return successResponse(res, data, 'Listener removed successfully');
});

const listWalletLedger = asyncHandler(async (req, res) => {
  const data = await adminService.listWalletLedger({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    userId: req.query.userId,
  });
  return successResponse(res, data);
});

const listWithdrawals = asyncHandler(async (req, res) => {
  const data = await adminService.listWithdrawals(req.query);
  return successResponse(res, data);
});

const getWithdrawalById = asyncHandler(async (req, res) => {
  const data = await adminService.getWithdrawalById({
    withdrawalId: req.params.id,
  });
  return successResponse(res, data);
});

const updateWithdrawalStatus = asyncHandler(async (req, res) => {
  const data = await adminService.updateWithdrawalStatus({
    withdrawalId: req.params.id,
    adminId: req.user.id,
    ...req.body,
  });
  return successResponse(res, data, 'Withdrawal status updated');
});

const updateWithdrawalAdminNote = asyncHandler(async (req, res) => {
  const data = await adminService.updateWithdrawalAdminNote({
    withdrawalId: req.params.id,
    adminId: req.user.id,
    adminNote: req.body.adminNote,
  });
  return successResponse(res, data, 'Withdrawal admin note updated');
});

const updateWithdrawalTransactionReference = asyncHandler(async (req, res) => {
  const data = await adminService.updateWithdrawalTransactionReference({
    withdrawalId: req.params.id,
    adminId: req.user.id,
    transactionReference: req.body.transactionReference,
  });
  return successResponse(res, data, 'Withdrawal transaction reference updated');
});

const listChatSessions = asyncHandler(async (req, res) => {
  const data = await adminService.listChatSessions({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });
  return successResponse(res, data);
});

const listCallSessions = asyncHandler(async (req, res) => {
  const data = await adminService.listCallSessions({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });
  return successResponse(res, data);
});

const forceEndSession = asyncHandler(async (req, res) => {
  const data = await adminService.forceEndSession({
    sessionId: req.params.id,
    adminId: req.user.id,
    reason: req.body.reason,
    sessionType: req.body.sessionType,
  });
  return successResponse(res, data, 'Session ended successfully');
});

const manualWalletAdjustment = asyncHandler(async (req, res) => {
  const data = await adminService.manualWalletAdjustment({
    ...req.body,
    adminId: req.user.id,
  });
  return successResponse(res, data, 'Wallet adjusted successfully');
});

const listRechargePlans = asyncHandler(async (_req, res) => {
  const data = await adminService.listRechargePlans();
  return successResponse(res, { plans: data });
});

const createRechargePlan = asyncHandler(async (req, res) => {
  const data = await adminService.createRechargePlan(req.body);
  return successResponse(res, data, 'Recharge plan created');
});

const updateRechargePlan = asyncHandler(async (req, res) => {
  const data = await adminService.updateRechargePlan({
    id: Number(req.params.id),
    payload: req.body,
  });
  return successResponse(res, data, 'Recharge plan updated');
});

const getReferralRule = asyncHandler(async (_req, res) => {
  const data = await adminService.getReferralRule();
  return successResponse(res, data);
});

const updateReferralRule = asyncHandler(async (req, res) => {
  const data = await adminService.updateReferralRule(req.body);
  return successResponse(res, data, 'Referral rule updated');
});

const listReferrals = asyncHandler(async (req, res) => {
  const data = await adminService.listReferrals(req.query);
  return successResponse(res, data);
});

const listSupportTickets = asyncHandler(async (req, res) => {
  const data = await adminService.listSupportTickets(req.query);
  return successResponse(res, data);
});

const updateSupportTicket = asyncHandler(async (req, res) => {
  const data = await adminService.updateSupportTicket({
    ticketId: req.params.id,
    adminId: req.user.id,
    ...req.body,
  });
  return successResponse(res, data, 'Support ticket updated');
});

module.exports = {
  listUsers,
  listListeners,
  createListenerByAdmin,
  getListenerPricingHistory,
  updateListenerRates,
  updateListenerStatus,
  updateListenerVisibility,
  removeListenerSoft,
  listWalletLedger,
  listWithdrawals,
  getWithdrawalById,
  updateWithdrawalStatus,
  updateWithdrawalAdminNote,
  updateWithdrawalTransactionReference,
  listChatSessions,
  listCallSessions,
  forceEndSession,
  manualWalletAdjustment,
  listRechargePlans,
  createRechargePlan,
  updateRechargePlan,
  getReferralRule,
  updateReferralRule,
  listReferrals,
  listSupportTickets,
  updateSupportTicket,
};
