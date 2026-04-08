const { prisma } = require('../../config/prisma');

const getSettings = async (userId) => {
  let settings = await prisma.userSetting.findUnique({ where: { userId } });

  if (!settings) {
    settings = await prisma.userSetting.create({
      data: {
        userId,
      },
    });
  }

  return settings;
};

const updateSettings = async (userId, payload) => {
  return prisma.userSetting.upsert({
    where: { userId },
    create: {
      userId,
      ...payload,
    },
    update: payload,
  });
};

module.exports = {
  getSettings,
  updateSettings,
};
