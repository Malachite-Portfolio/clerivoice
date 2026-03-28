const { z } = require('zod');

const chatRequestSchema = z.object({
  listenerId: z.string().min(10),
});

const chatActionSchema = z.object({
  reason: z.string().max(200).optional(),
});

const chatEndSchema = z.object({
  endReason: z
    .enum(['USER_ENDED', 'LISTENER_ENDED', 'CANCELLED', 'INSUFFICIENT_BALANCE', 'ERROR'])
    .optional(),
});

const chatTokenRefreshSchema = z.object({});

const chatSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['REQUESTED', 'ACTIVE', 'ENDED', 'CANCELLED', 'REJECTED']).optional(),
});

module.exports = {
  chatRequestSchema,
  chatActionSchema,
  chatEndSchema,
  chatTokenRefreshSchema,
  chatSessionsQuerySchema,
};
