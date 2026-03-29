const { prisma } = require('../../config/prisma');
const { AppError } = require('../../utils/appError');
const { emitHostStatusChanged } = require('../../services/realtimeSync.service');

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

const updateListenerAvailability = async ({ listenerId, availability }) => {
  const listener = await prisma.listenerProfile.findUnique({
    where: { userId: listenerId },
    include: {
      user: {
        select: {
          id: true,
          status: true,
          displayName: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!listener || !listener.user) {
    throw new AppError('Listener profile not found', 404, 'LISTENER_NOT_FOUND');
  }

  if (!listener.isEnabled || listener.user.status !== 'ACTIVE' || listener.user.deletedAt) {
    throw new AppError('Listener account is not available', 403, 'LISTENER_UNAVAILABLE');
  }

  const updated = await prisma.listenerProfile.update({
    where: { userId: listenerId },
    data: { availability },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  emitHostStatusChanged({
    listenerId,
    status: availability,
    availability,
    isEnabled: updated.isEnabled,
    updatedAt: updated.updatedAt,
    reason: 'LISTENER_SELF_STATUS',
  });

  return updated;
};

module.exports = {
  listListeners,
  getListenerById,
  getListenerAvailability,
  updateListenerAvailability,
};
