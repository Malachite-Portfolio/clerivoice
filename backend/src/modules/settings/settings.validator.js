const { z } = require('zod');

const updateSettingsSchema = z.object({
  language: z.string().max(10).optional(),
  allowPush: z.boolean().optional(),
  allowSms: z.boolean().optional(),
  anonymousMode: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});

module.exports = {
  updateSettingsSchema,
};
