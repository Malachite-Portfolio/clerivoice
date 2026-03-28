const { prisma } = require('../../config/prisma');

const getMyProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: true,
      settings: true,
      listenerProfile: true,
      referralCode: true,
    },
  });

  return user;
};

const updateMyProfile = async (userId, payload) => {
  return prisma.user.update({
    where: { id: userId },
    data: payload,
    include: {
      wallet: true,
      settings: true,
      listenerProfile: true,
      referralCode: true,
    },
  });
};

const softDeleteAccount = async (userId) => {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });

    await tx.authSession.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    await tx.listenerProfile.updateMany({
      where: { userId },
      data: {
        availability: 'OFFLINE',
        isEnabled: false,
      },
    });
  });
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  softDeleteAccount,
};
