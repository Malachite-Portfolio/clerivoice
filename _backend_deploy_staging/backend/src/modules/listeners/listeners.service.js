const { prisma } = require('../../config/prisma');
const { AppError } = require('../../utils/appError');
const { emitHostStatusChanged } = require('../../services/realtimeSync.service');

const toNumber = (value) => Number(value || 0);

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

  if (
    profile &&
    String(profile.availability || '').trim().toUpperCase() === 'BUSY'
  ) {
    const [activeCallCount, activeChatCount] = await Promise.all([
      prisma.callSession.count({
        where: {
          listenerId,
          status: {
            in: ['REQUESTED', 'RINGING', 'ACTIVE'],
          },
        },
      }),
      prisma.chatSession.count({
        where: {
          listenerId,
          status: 'ACTIVE',
        },
      }),
    ]);

    if (activeCallCount === 0 && activeChatCount === 0) {
      const recovered = await prisma.listenerProfile.update({
        where: { userId: listenerId },
        data: {
          availability: 'ONLINE',
        },
        select: {
          userId: true,
          availability: true,
          isEnabled: true,
          callRatePerMinute: true,
          chatRatePerMinute: true,
          updatedAt: true,
        },
      });

      emitHostStatusChanged({
        listenerId,
        status: 'ONLINE',
        availability: 'ONLINE',
        isEnabled: recovered.isEnabled,
        updatedAt: recovered.updatedAt,
        reason: 'STALE_BUSY_RECOVERED',
      });

      return recovered;
    }
  }

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

const mapRecentSession = (session, type) => {
  const counterparty = type === 'chat' ? session.user : session.user;
  const timestamp =
    session.endedAt ||
    session.startedAt ||
    session.answeredAt ||
    session.requestedAt ||
    session.createdAt;

  return {
    id: session.id,
    type,
    status: session.status,
    timestamp,
    totalAmount: toNumber(session.totalAmount),
    billedMinutes: session.billedMinutes,
    durationSeconds: type === 'call' ? session.durationSeconds : null,
    counterparty: {
      id: counterparty?.id || session.userId,
      displayName: counterparty?.displayName || 'Anonymous User',
      profileImageUrl: counterparty?.profileImageUrl || null,
    },
  };
};

const getListenerDashboard = async (listenerId) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    profile,
    wallet,
    totalEarned,
    todayEarned,
    totalChats,
    totalCalls,
    activeChats,
    activeCalls,
    recentChatSessions,
    recentCallSessions,
    recentEarnings,
  ] = await Promise.all([
    prisma.listenerProfile.findUnique({
      where: { userId: listenerId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            profileImageUrl: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    }),
    prisma.wallet.findUnique({
      where: { userId: listenerId },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        userId: listenerId,
        type: 'ADMIN_CREDIT',
        status: 'SUCCESS',
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        userId: listenerId,
        type: 'ADMIN_CREDIT',
        status: 'SUCCESS',
        createdAt: {
          gte: todayStart,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.chatSession.count({
      where: {
        listenerId,
      },
    }),
    prisma.callSession.count({
      where: {
        listenerId,
      },
    }),
    prisma.chatSession.count({
      where: {
        listenerId,
        status: 'ACTIVE',
      },
    }),
    prisma.callSession.count({
      where: {
        listenerId,
        status: {
          in: ['RINGING', 'ACTIVE'],
        },
      },
    }),
    prisma.chatSession.findMany({
      where: {
        listenerId,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            profileImageUrl: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 5,
    }),
    prisma.callSession.findMany({
      where: {
        listenerId,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            profileImageUrl: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 5,
    }),
    prisma.walletTransaction.findMany({
      where: {
        userId: listenerId,
        type: 'ADMIN_CREDIT',
        status: 'SUCCESS',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 8,
    }),
  ]);

  if (!profile || !profile.user) {
    throw new AppError('Listener profile not found', 404, 'LISTENER_NOT_FOUND');
  }

  const recentSessions = [
    ...recentChatSessions.map((item) => mapRecentSession(item, 'chat')),
    ...recentCallSessions.map((item) => mapRecentSession(item, 'call')),
  ]
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
    .slice(0, 8);

  return {
    listener: {
      id: profile.userId,
      displayName: profile.user.displayName,
      profileImageUrl: profile.user.profileImageUrl,
      availability: profile.availability,
      isEnabled: profile.isEnabled,
      chatRatePerMinute: toNumber(profile.chatRatePerMinute),
      callRatePerMinute: toNumber(profile.callRatePerMinute),
    },
    balance: toNumber(wallet?.balance || 0),
    currency: wallet?.currency || 'INR',
    totalEarned: toNumber(totalEarned._sum.amount),
    todayEarned: toNumber(todayEarned._sum.amount),
    activeChats,
    activeCalls,
    totalChats,
    totalCalls,
    recentSessions,
    recentEarnings: recentEarnings.map((item) => ({
      id: item.id,
      amount: toNumber(item.amount),
      balanceAfter: toNumber(item.balanceAfter),
      createdAt: item.createdAt,
      description: item.description,
      relatedSessionId: item.relatedSessionId,
      source: item?.metadata?.source || null,
      sessionType: item?.metadata?.sessionType || null,
    })),
  };
};

module.exports = {
  listListeners,
  getListenerById,
  getListenerAvailability,
  updateListenerAvailability,
  getListenerDashboard,
};
