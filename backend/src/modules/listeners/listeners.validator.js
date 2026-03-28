const { z } = require('zod');

const listListenersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  availability: z.enum(['ONLINE', 'OFFLINE', 'BUSY']).optional(),
  category: z.string().optional(),
  language: z.string().optional(),
});

module.exports = {
  listListenersQuerySchema,
};
