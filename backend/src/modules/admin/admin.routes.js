const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const controller = require('./admin.controller');
const {
  adminPaginationSchema,
  updateListenerRatesSchema,
  updateListenerStatusSchema,
  updateListenerVisibilitySchema,
  removeListenerSchema,
  manualWalletAdjustmentSchema,
  createRechargePlanSchema,
  updateRechargePlanSchema,
  updateReferralRuleSchema,
  withdrawalIdParamsSchema,
  withdrawalListQuerySchema,
  updateWithdrawalStatusSchema,
  updateWithdrawalAdminNoteSchema,
  updateWithdrawalTransactionReferenceSchema,
  adminSupportTicketsQuerySchema,
  supportTicketIdParamsSchema,
  updateSupportTicketSchema,
  adminReferralListQuerySchema,
  adminSessionEndParamsSchema,
  adminForceEndSessionSchema,
  createListenerByAdminSchema,
  listenerPricingHistoryParamsSchema,
  listenerPricingHistoryQuerySchema,
} = require('./admin.validator');

const router = express.Router();

router.use(authMiddleware, allowRoles('ADMIN'));

router.get('/users', validate(adminPaginationSchema, 'query'), controller.listUsers);
router.get('/listeners', validate(adminPaginationSchema, 'query'), controller.listListeners);
router.post('/listeners', validate(createListenerByAdminSchema), controller.createListenerByAdmin);
router.get(
  '/listeners/:id/pricing-history',
  validate(listenerPricingHistoryParamsSchema, 'params'),
  validate(listenerPricingHistoryQuerySchema, 'query'),
  controller.getListenerPricingHistory
);
router.patch('/listeners/:id/rates', validate(updateListenerRatesSchema), controller.updateListenerRates);
router.patch('/listeners/:id/status', validate(updateListenerStatusSchema), controller.updateListenerStatus);
router.patch('/listeners/:id/visibility', validate(updateListenerVisibilitySchema), controller.updateListenerVisibility);
router.post('/listeners/:id/remove', validate(removeListenerSchema), controller.removeListenerSoft);

router.get('/wallet/ledger', controller.listWalletLedger);
router.post('/wallet/adjust', validate(manualWalletAdjustmentSchema), controller.manualWalletAdjustment);
router.get('/withdrawals', validate(withdrawalListQuerySchema, 'query'), controller.listWithdrawals);
router.get('/withdrawals/:id', validate(withdrawalIdParamsSchema, 'params'), controller.getWithdrawalById);
router.patch('/withdrawal/:id/status', validate(withdrawalIdParamsSchema, 'params'), validate(updateWithdrawalStatusSchema), controller.updateWithdrawalStatus);
router.patch('/withdrawal/:id/note', validate(withdrawalIdParamsSchema, 'params'), validate(updateWithdrawalAdminNoteSchema), controller.updateWithdrawalAdminNote);
router.patch('/withdrawal/:id/reference', validate(withdrawalIdParamsSchema, 'params'), validate(updateWithdrawalTransactionReferenceSchema), controller.updateWithdrawalTransactionReference);
router.patch('/withdrawals/:id/status', validate(withdrawalIdParamsSchema, 'params'), validate(updateWithdrawalStatusSchema), controller.updateWithdrawalStatus);
router.patch('/withdrawals/:id/admin-note', validate(withdrawalIdParamsSchema, 'params'), validate(updateWithdrawalAdminNoteSchema), controller.updateWithdrawalAdminNote);
router.patch('/withdrawals/:id/transaction-reference', validate(withdrawalIdParamsSchema, 'params'), validate(updateWithdrawalTransactionReferenceSchema), controller.updateWithdrawalTransactionReference);

router.get('/sessions/chat', validate(adminPaginationSchema, 'query'), controller.listChatSessions);
router.get('/sessions/call', validate(adminPaginationSchema, 'query'), controller.listCallSessions);
router.post(
  '/sessions/:id/end',
  validate(adminSessionEndParamsSchema, 'params'),
  validate(adminForceEndSessionSchema),
  controller.forceEndSession
);
router.patch(
  '/sessions/:id/end',
  validate(adminSessionEndParamsSchema, 'params'),
  validate(adminForceEndSessionSchema),
  controller.forceEndSession
);

router.get('/recharge-plans', controller.listRechargePlans);
router.post('/recharge-plans', validate(createRechargePlanSchema), controller.createRechargePlan);
router.patch('/recharge-plans/:id', validate(updateRechargePlanSchema), controller.updateRechargePlan);

router.get('/referral-rule', controller.getReferralRule);
router.patch('/referral-rule', validate(updateReferralRuleSchema), controller.updateReferralRule);
router.get('/referrals', validate(adminReferralListQuerySchema, 'query'), controller.listReferrals);

router.get('/support/tickets', validate(adminSupportTicketsQuerySchema, 'query'), controller.listSupportTickets);
router.patch(
  '/support/tickets/:id',
  validate(supportTicketIdParamsSchema, 'params'),
  validate(updateSupportTicketSchema),
  controller.updateSupportTicket
);
router.put(
  '/support/tickets/:id',
  validate(supportTicketIdParamsSchema, 'params'),
  validate(updateSupportTicketSchema),
  controller.updateSupportTicket
);

module.exports = router;
