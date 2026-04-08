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
      'WITHDRAWAL_LOCK',
      'WITHDRAWAL_REFUND',
      'WITHDRAWAL_PAYOUT',
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
  status: z
    .enum(['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'PAYMENT_DONE'])
    .optional(),
});

const withdrawalRequestSchema = z.object({
  amount: z.coerce.number().positive(),
  bankName: z.string().trim().min(2).max(120),
  accountHolderName: z.string().trim().min(2).max(120),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,34}$/)
    .optional(),
  accountNumberLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .optional(),
  ifscCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  note: z.string().max(300).optional(),
}).superRefine((value, context) => {
  if (!value.accountNumber && !value.accountNumberLast4) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either accountNumber or accountNumberLast4 is required',
      path: ['accountNumber'],
    });
  }
});

const withdrawalIdParamsSchema = z.object({
  id: z.string().min(10),
});

module.exports = {
  walletHistoryQuerySchema,
  createOrderSchema,
  verifyPaymentSchema,
  applyCouponSchema,
  withdrawalHistoryQuerySchema,
  withdrawalRequestSchema,
  withdrawalIdParamsSchema,
};
