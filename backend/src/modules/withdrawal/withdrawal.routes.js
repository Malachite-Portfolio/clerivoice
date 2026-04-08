const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const controller = require('./withdrawal.controller');
const {
  withdrawalListQuerySchema,
  createWithdrawalSchema,
  withdrawalIdParamsSchema,
} = require('./withdrawal.validator');

const router = express.Router();

router.use(authMiddleware, allowRoles('LISTENER'));

router.post('/create', validate(createWithdrawalSchema), controller.createWithdrawal);
router.get('/my', validate(withdrawalListQuerySchema, 'query'), controller.listMyWithdrawals);
router.get('/:id', validate(withdrawalIdParamsSchema, 'params'), controller.getMyWithdrawalById);

module.exports = router;
