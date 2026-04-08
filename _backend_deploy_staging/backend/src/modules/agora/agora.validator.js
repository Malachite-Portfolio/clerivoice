const { z } = require('zod');

const rtcTokenSchema = z.object({
  sessionId: z.string().min(10),
  role: z.enum(['publisher', 'subscriber', 'audience', 'admin']).default('publisher'),
  expirySeconds: z.coerce.number().int().min(60).max(86400).optional(),
});

const chatTokenSchema = z.object({
  sessionId: z.string().min(10),
  expirySeconds: z.coerce.number().int().min(60).max(86400).optional(),
});

module.exports = {
  rtcTokenSchema,
  chatTokenSchema,
};
