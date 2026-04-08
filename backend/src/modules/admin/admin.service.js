const { prisma } = require('../../config/prisma');
const walletService = require('../../services/wallet.service');
const callService = require('../call/call.service');
const chatService = require('../chat/chat.service');
const withdrawalService = require('../withdrawal/withdrawal.service');
const {
  SYNC_EVENTS,
  emitEvent,
  buildHostSyncPayload,
} = require('../../services/realtimeSync.service');

const forceEndActiveSessionsForListener = async ({ listenerId, reasonCode }) => {
  const [activeCallSessions, activeChatSessions] = await Promise.all([
    prisma.callSession.findMany({
      where: {
        listenerId,
        status: { in: ['ACTIVE', 'RINGING', 'REQUESTED'] },
      },
      select: { id: true },
    }),
    prisma.chatSession.findMany({
      where: {
        listenerId,
        status: { in: ['ACTIVE', 'REQUESTED'] },
      },
      select: { id: true },
    }),
  ]);

  await Promise.all([
    ...activeCallSessions.map((session) =>
      callService.forceEndCallBySystem({
        sessionId: session.id,
        endReason: 'CANCELLED',
        reasonCode,
        restoreListenerAvailability: false,
      })
    ),
    ...activeChatSessions.map((session) =>
      chatService.forceEndChatBySystem({
        sessionId: session.id,
        endReason: 'CANCELLED',
        reasonCode,
        restoreListenerAvailability: false,
      })
    ),
  ]);
};

const listUsers = async ({ page, limit }) => {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: true,
        listenerProfile: true,
      },
    }),
    prisma.user.count(),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const listListeners = async ({ page, limit }) => {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.listenerProfile.findMany({
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: true,
      },
    }),
    prisma.listenerProfile.count(),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const updateListenerRates = async ({ listenerId, callRatePerMinute, chatRatePerMinute }) => {
  const listener = await prisma.listenerProfile.update({
    where: { userId: listenerId },
    data: {
      callRatePerMinute,
      chatRatePerMinute,
    },
    include: { user: true },
  });

  const payload = buildHostSyncPayload(listener);
  emitEvent(SYNC_EVENTS.PRICING_UPDATED, payload);
  emitEvent(SYNC_EVENTS.HOST_UPDATED, payload);

  return listener;
};

const updateListenerStatus = async ({ listenerId, payload }) => {
  const shouldForceOffline =
    payload.userStatus && payload.userStatus !== 'ACTIVE';

  const shouldForceEndSessions =
    shouldForceOffline ||
    payload.isEnabled === false ||
    payload.availability === 'OFFLINE';

  const data = {
    ...(payload.isEnabled !== undefined ? { isEnabled: payload.isEnabled } : {}),
    ...(payload.availability ? { availability: payload.availability } : {}),
    ...(shouldForceOffline ? { isEnabled: false, availability: 'OFFLINE' } : {}),
  };

  const listener = await prisma.$transaction(async (tx) => {
    if (payload.userStatus) {
      await tx.user.update({
        where: { id: listenerId },
        data: { status: payload.userStatus },
      });
    }

    return tx.listenerProfile.update({
      where: { userId: listenerId },
      data,
      include: { user: true },
    });
  });

  const syncPayload = buildHostSyncPayload(listener, {
    reason: 'ADMIN_STATUS_UPDATE',
  });

  if (shouldForceEndSessions) {
    await forceEndActiveSessionsForListener({
      listenerId,
      reasonCode: 'HOST_DISABLED_BY_ADMIN',
    });
  }

  emitEvent(SYNC_EVENTS.HOST_STATUS_CHANGED, syncPayload);
  emitEvent(SYNC_EVENTS.HOST_UPDATED, syncPayload);

  return listener;
};

const updateListenerVisibility = async ({ listenerId, visible }) => {
  if (!visible) {
    await forceEndActiveSessionsForListener({
      listenerId,
      reasonCode: 'HOST_HIDDEN_BY_ADMIN',
    });
  }

  const listener = await prisma.listenerProfile.update({
    where: { userId: listenerId },
    data: {
      isEnabled: visible,
      ...(visible ? {} : { availability: 'OFFLINE' }),
    },
    include: { user: true },
  });

  const syncPayload = buildHostSyncPayload(listener, {
    reason: visible ? 'ADMIN_SHOW_HOST' : 'ADMIN_HIDE_HOST',
    visible,
  });

  emitEvent(SYNC_EVENTS.HOST_STATUS_CHANGED, syncPayload);
  emitEvent(SYNC_EVENTS.HOST_UPDATED, syncPayload);

  return listener;
};

const removeListenerSoft = async ({ listenerId, adminId, reason }) => {
  await forceEndActiveSessionsForListener({
    listenerId,
    reasonCode: 'HOST_REMOVED_BY_ADMIN',
  });

  const listener = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: listenerId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        blockedReason: reason || 'Removed by admin',
      },
    });

    const updatedProfile = await tx.listenerProfile.update({
      where: { userId: listenerId },
      data: {
        isEnabled: false,
        availability: 'OFFLINE',
      },
      include: { user: true },
    });

    await tx.authSession.updateMany({
      where: { userId: listenerId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    return {
      ...updatedProfile,
      user: updatedUser,
    };
  });

  emitEvent(SYNC_EVENTS.HOST_DELETED, {
    listenerId,
    reason: reason || 'Removed by admin',
    removedBy: adminId,
    syncVersion: Date.now(),
  });

  emitEvent(SYNC_EVENTS.HOST_UPDATED, buildHostSyncPayload(listener, { removed: true }));

  return listener;
};

const listWalletLedger = async ({ page, limit, userId }) => {
  const skip = (page - 1) * limit;
  const where = userId ? { userId } : {};

  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, phone: true, displayName: true },
        },
      },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const listWithdrawals = async ({ page = 1, limit = 20, status, listenerId }) => {
  return withdrawalService.listAdminWithdrawals({
    page,
    limit,
    status,
    listenerId,
  });
};

const getWithdrawalById = async ({ withdrawalId }) => {
  return withdrawalService.getAdminWithdrawalById({ withdrawalId });
};

const updateWithdrawalStatus = async ({
  adminId,
  withdrawalId,
  status,
  adminNote,
  transactionReference,
}) =>
  withdrawalService.updateWithdrawalStatus({
    adminId,
    withdrawalId,
    status,
    adminNote,
    transactionReference,
  });

const updateWithdrawalAdminNote = async ({
  adminId,
  withdrawalId,
  adminNote,
}) =>
  withdrawalService.updateWithdrawalAdminNote({
    adminId,
    withdrawalId,
    adminNote,
  });

const updateWithdrawalTransactionReference = async ({
  adminId,
  withdrawalId,
  transactionReference,
}) =>
  withdrawalService.updateWithdrawalTransactionReference({
    adminId,
    withdrawalId,
    transactionReference,
  });

const listChatSessions = async ({ page, limit }) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.chatSession.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, displayName: true } },
        listener: { select: { id: true, displayName: true } },
      },
    }),
    prisma.chatSession.count(),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const listCallSessions = async ({ page, limit }) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.callSession.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, displayName: true } },
        listener: { select: { id: true, displayName: true } },
      },
    }),
    prisma.callSession.count(),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const manualWalletAdjustment = async ({ userId, action, amount, reason, adminId }) => {
  let transaction;
  if (action === 'CREDIT') {
    transaction = await walletService.creditWallet({
      userId,
      amount,
      type: 'ADMIN_CREDIT',
      description: reason,
      metadata: { adminId, action },
      idempotencyKey: `admin-credit:${adminId}:${userId}:${Date.now()}`,
    });
  } else {
    transaction = await walletService.debitWallet({
      userId,
      amount,
      type: 'ADMIN_DEBIT',
      description: reason,
      metadata: { adminId, action },
      idempotencyKey: `admin-debit:${adminId}:${userId}:${Date.now()}`,
    });
  }

  emitEvent(SYNC_EVENTS.WALLET_UPDATED, {
    userId,
    balance: Number(transaction.balanceAfter),
    source: 'admin_adjustment',
    syncVersion: Date.now(),
  });

  return transaction;
};

const listRechargePlans = async () => {
  return prisma.rechargePlan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { amount: 'asc' }],
  });
};

const createRechargePlan = async (payload) => {
  return prisma.rechargePlan.create({ data: payload });
};

const updateRechargePlan = async ({ id, payload }) => {
  return prisma.rechargePlan.update({
    where: { id },
    data: payload,
  });
};

const getReferralRule = async () => {
  let rule = await prisma.referralRewardRule.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (!rule) {
    rule = await prisma.referralRewardRule.create({
      data: {
        name: 'default_referral_rule',
        inviterReward: 55,
        referredReward: 50,
        qualifyingAmount: 500,
        isActive: true,
      },
    });
  }

  return rule;
};

const updateReferralRule = async ({ inviterReward, referredReward, qualifyingAmount }) => {
  const current = await getReferralRule();
  const updatedRule = await prisma.referralRewardRule.update({
    where: { id: current.id },
    data: {
      inviterReward,
      referredReward,
      qualifyingAmount,
      isActive: true,
    },
  });

  emitEvent(SYNC_EVENTS.REFERRAL_UPDATED, {
    inviterReward: Number(updatedRule.inviterReward),
    referredReward: Number(updatedRule.referredReward),
    qualifyingAmount: Number(updatedRule.qualifyingAmount),
    syncVersion: Date.now(),
  });

  return updatedRule;
};

module.exports = {
  listUsers,
  listListeners,
  updateListenerRates,
  updateListenerStatus,
  updateListenerVisibility,
  removeListenerSoft,
  listWalletLedger,
  listWithdrawals,
  getWithdrawalById,
  updateWithdrawalStatus,
  updateWithdrawalAdminNote,
  updateWithdrawalTransactionReference,
  listChatSessions,
  listCallSessions,
  manualWalletAdjustment,
  listRechargePlans,
  createRechargePlan,
  updateRechargePlan,
  getReferralRule,
  updateReferralRule,
};
