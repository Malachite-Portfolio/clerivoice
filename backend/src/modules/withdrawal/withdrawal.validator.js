const { z } = require('zod');

const withdrawalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'PAYMENT_DONE'])
    .optional(),
});

const createWithdrawalSchema = z
  .object({
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
  })
  .superRefine((value, context) => {
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
  withdrawalListQuerySchema,
  createWithdrawalSchema,
  withdrawalIdParamsSchema,
};
