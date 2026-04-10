const { z } = require('zod');

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
};

const normalizeUpperOptional = (value) => {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toUpperCase() : undefined;
};

const adminPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(120).optional(),
  status: z
    .preprocess((value) => {
      const normalized = normalizeUpperOptional(value);
      if (!normalized) {
        return undefined;
      }
      if (normalized === 'SUSPENDED') {
        return 'BLOCKED';
      }
      return normalized;
    }, z.enum(['ACTIVE', 'BLOCKED', 'DELETED']).optional()),
});

const updateListenerRatesSchema = z.object({
  callRatePerMinute: z.coerce.number().positive(),
  chatRatePerMinute: z.coerce.number().positive(),
  reason: z.string().trim().max(300).optional(),
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

const adminSupportTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  status: z.preprocess(
    (value) => normalizeUpperOptional(value),
    z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional()
  ),
  priority: z.preprocess(
    (value) => {
      const normalized = normalizeUpperOptional(value);
      if (!normalized) {
        return undefined;
      }
      if (normalized === 'CRITICAL') {
        return 'HIGH';
      }
      return normalized;
    },
    z.enum(['LOW', 'MEDIUM', 'HIGH']).optional()
  ),
  search: z.string().trim().max(200).optional(),
});

const supportTicketIdParamsSchema = z.object({
  id: z.string().min(10),
});

const updateSupportTicketSchema = z.object({
  status: z.preprocess(
    (value) => normalizeUpperOptional(value),
    z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional()
  ),
  priority: z.preprocess(
    (value) => {
      const normalized = normalizeUpperOptional(value);
      if (!normalized) {
        return undefined;
      }
      if (normalized === 'CRITICAL') {
        return 'HIGH';
      }
      return normalized;
    },
    z.enum(['LOW', 'MEDIUM', 'HIGH']).optional()
  ),
  assignedTo: z.string().trim().max(120).optional(),
  reply: z.string().trim().max(3000).optional(),
});

const adminReferralListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  status: z.preprocess(
    (value) => normalizeUpperOptional(value),
    z.enum(['INVITED', 'SIGNED_UP', 'QUALIFIED', 'REWARDED', 'EXPIRED']).optional()
  ),
  search: z.string().trim().max(200).optional(),
});

const adminSessionEndParamsSchema = z.object({
  id: z.string().min(10),
});

const adminForceEndSessionSchema = z.object({
  reason: z.string().trim().min(2).max(120).default('FORCE_ENDED_BY_ADMIN'),
  sessionType: z.enum(['auto', 'call', 'chat']).default('auto'),
});

const createListenerByAdminSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(20),
  email: z
    .preprocess(
      (value) => normalizeOptionalString(value),
      z.string().email().max(120).optional()
    ),
  password: z.string().min(6).max(128),
  bio: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(120).optional(),
  languages: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  experienceYears: z.coerce.number().int().min(0).max(80).default(0),
  callRatePerMinute: z.coerce.number().positive().default(15),
  chatRatePerMinute: z.coerce.number().positive().default(10),
  active: z.boolean().default(true),
  visibleInApp: z.boolean().default(true),
  availability: z.enum(['ONLINE', 'OFFLINE', 'BUSY']).default('OFFLINE'),
});

const listenerPricingHistoryParamsSchema = z.object({
  id: z.string().min(10),
});

const listenerPricingHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
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
  adminSupportTicketsQuerySchema,
  supportTicketIdParamsSchema,
  updateSupportTicketSchema,
  adminReferralListQuerySchema,
  adminSessionEndParamsSchema,
  adminForceEndSessionSchema,
  createListenerByAdminSchema,
  listenerPricingHistoryParamsSchema,
  listenerPricingHistoryQuerySchema,
};
