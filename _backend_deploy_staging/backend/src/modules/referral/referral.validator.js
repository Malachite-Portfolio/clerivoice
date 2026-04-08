const { z } = require('zod');

const applyReferralCodeSchema = z.object({
  referralCode: z.string().min(4).max(20),
});

module.exports = {
  applyReferralCodeSchema,
};
