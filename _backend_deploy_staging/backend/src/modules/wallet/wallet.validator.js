const { z } = require('zod');

const walletHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z
    .enum([
      'RECHARGE',
      'REFERRAL_BONUS',
      'CALL_DEBIT',
      'CHAT_DEBIT',
      'REFUND',
      'ADMIN_CREDIT',
      'ADMIN_DEBIT',
      'PROMO_CREDIT',
    ])
    .optional(),
});

const createOrderSchema = z.object({
  planId: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().positive().optional(),
  couponCode: z.string().max(30).optional(),
  paymentMethod: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional(),
});

const verifyPaymentSchema = z.object({
  orderId: z.string().min(10),
  gatewayPaymentId: z.string().min(3),
  gatewaySignature: z.string().optional(),
  method: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional(),
});

const applyCouponSchema = z.object({
  couponCode: z.string().min(2).max(30),
  amount: z.coerce.number().positive(),
});

const withdrawalHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const withdrawalRequestSchema = z.object({
  amount: z.coerce.number().positive(),
  note: z.string().max(300).optional(),
});

module.exports = {
  walletHistoryQuerySchema,
  createOrderSchema,
  verifyPaymentSchema,
  applyCouponSchema,
  withdrawalHistoryQuerySchema,
  withdrawalRequestSchema,
};
