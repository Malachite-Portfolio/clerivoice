const { z } = require('zod');

const adminPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

const updateListenerRatesSchema = z.object({
  callRatePerMinute: z.coerce.number().positive(),
  chatRatePerMinute: z.coerce.number().positive(),
});

const updateListenerStatusSchema = z.object({
  isEnabled: z.boolean().optional(),
  availability: z.enum(['ONLINE', 'OFFLINE', 'BUSY']).optional(),
  userStatus: z.enum(['ACTIVE', 'BLOCKED', 'DELETED']).optional(),
});

const updateListenerVisibilitySchema = z.object({
  visible: z.boolean(),
});

const removeListenerSchema = z.object({
  reason: z.string().max(240).optional(),
});

const manualWalletAdjustmentSchema = z.object({
  userId: z.string().min(10),
  action: z.enum(['CREDIT', 'DEBIT']),
  amount: z.coerce.number().positive(),
  reason: z.string().min(3).max(300),
});

const createRechargePlanSchema = z.object({
  amount: z.coerce.number().positive(),
  talktime: z.coerce.number().positive(),
  label: z.string().max(80).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

const updateRechargePlanSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  talktime: z.coerce.number().positive().optional(),
  label: z.string().max(80).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

const updateReferralRuleSchema = z.object({
  inviterReward: z.coerce.number().nonnegative(),
  referredReward: z.coerce.number().nonnegative(),
  qualifyingAmount: z.coerce.number().positive(),
});

const withdrawalIdParamsSchema = z.object({
  id: z.string().min(10),
});

const withdrawalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  status: z
    .enum(['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'PAYMENT_DONE'])
    .optional(),
  listenerId: z.string().min(10).optional(),
});

const updateWithdrawalStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'IN_PROGRESS', 'PAYMENT_DONE']),
  adminNote: z.string().max(1000).optional(),
  transactionReference: z.string().max(120).optional(),
});

const updateWithdrawalAdminNoteSchema = z.object({
  adminNote: z.string().trim().min(1).max(1000),
});

const updateWithdrawalTransactionReferenceSchema = z.object({
  transactionReference: z.string().trim().min(3).max(120),
});

module.exports = {
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
};
