const { z } = require('zod');

const createSupportTicketSchema = z.object({
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(5000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
});

module.exports = {
  createSupportTicketSchema,
};
