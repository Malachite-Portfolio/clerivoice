const { prisma } = require('../../config/prisma');

const createTicket = async ({ userId, subject, message, priority }) => {
  return prisma.supportTicket.create({
    data: {
      userId,
      subject,
      message,
      priority,
      status: 'OPEN',
    },
  });
};

module.exports = {
  createTicket,
};
