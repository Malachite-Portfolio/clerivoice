const { prisma } = require('../../config/prisma');

const listListeners = async ({ page, limit, availability, category, language }) => {
  const skip = (page - 1) * limit;

  const where = {
    isEnabled: true,
    user: {
      status: 'ACTIVE',
      deletedAt: null,
    },
    ...(availability ? { availability } : {}),
    ...(category ? { category } : {}),
    ...(language ? { languages: { has: language } } : {}),
  };

  const [items, total, syncMeta] = await Promise.all([
    prisma.listenerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            profileImageUrl: true,
          },
        },
      },
      orderBy: [{ availability: 'asc' }, { rating: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.listenerProfile.count({ where }),
    prisma.listenerProfile.aggregate({
      where,
      _max: { updatedAt: true },
    }),
  ]);

  const latestSyncTimestamp = syncMeta?._max?.updatedAt
    ? new Date(syncMeta._max.updatedAt).getTime()
    : Date.now();

  return {
    items,
    syncVersion: latestSyncTimestamp,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getListenerById = async (listenerId) => {
  return prisma.listenerProfile.findUnique({
    where: { userId: listenerId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          profileImageUrl: true,
          status: true,
        },
      },
    },
  });
};

const getListenerAvailability = async (listenerId) => {
  const profile = await prisma.listenerProfile.findUnique({
    where: { userId: listenerId },
    select: {
      userId: true,
      availability: true,
      isEnabled: true,
      callRatePerMinute: true,
      chatRatePerMinute: true,
      updatedAt: true,
    },
  });

  return profile;
};

module.exports = {
  listListeners,
  getListenerById,
  getListenerAvailability,
};
