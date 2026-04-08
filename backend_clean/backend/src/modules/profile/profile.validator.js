const { z } = require('zod');

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  profileImageUrl: z.string().url().optional(),
  email: z.string().email().optional(),
});

module.exports = {
  updateProfileSchema,
};
