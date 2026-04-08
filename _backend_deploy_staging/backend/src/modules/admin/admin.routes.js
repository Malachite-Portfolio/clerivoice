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
} = require('./admin.validator');

const router = express.Router();

router.use(authMiddleware, allowRoles('ADMIN'));

router.get('/users', validate(adminPaginationSchema, 'query'), controller.listUsers);
router.get('/listeners', validate(adminPaginationSchema, 'query'), controller.listListeners);
router.patch('/listeners/:id/rates', validate(updateListenerRatesSchema), controller.updateListenerRates);
router.patch('/listeners/:id/status', validate(updateListenerStatusSchema), controller.updateListenerStatus);
router.patch('/listeners/:id/visibility', validate(updateListenerVisibilitySchema), controller.updateListenerVisibility);
router.post('/listeners/:id/remove', validate(removeListenerSchema), controller.removeListenerSoft);

router.get('/wallet/ledger', controller.listWalletLedger);
router.post('/wallet/adjust', validate(manualWalletAdjustmentSchema), controller.manualWalletAdjustment);

router.get('/sessions/chat', validate(adminPaginationSchema, 'query'), controller.listChatSessions);
router.get('/sessions/call', validate(adminPaginationSchema, 'query'), controller.listCallSessions);

router.get('/recharge-plans', controller.listRechargePlans);
router.post('/recharge-plans', validate(createRechargePlanSchema), controller.createRechargePlan);
router.patch('/recharge-plans/:id', validate(updateRechargePlanSchema), controller.updateRechargePlan);

router.get('/referral-rule', controller.getReferralRule);
router.patch('/referral-rule', validate(updateReferralRuleSchema), controller.updateReferralRule);

module.exports = router;
