const { z } = require('zod');

const callRequestSchema = z.object({
  listenerId: z.string().min(10),
});

const callActionSchema = z.object({
  reason: z.string().max(200).optional(),
});

const callEndSchema = z.object({
  endReason: z
    .enum(['USER_ENDED', 'LISTENER_ENDED', 'CANCELLED', 'INSUFFICIENT_BALANCE', 'ERROR'])
    .optional(),
});

const callTokenRefreshSchema = z.object({});

module.exports = {
  callRequestSchema,
  callActionSchema,
  callEndSchema,
  callTokenRefreshSchema,
};
