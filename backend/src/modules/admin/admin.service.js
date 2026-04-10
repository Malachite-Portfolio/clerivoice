const { prisma } = require('../../config/prisma');
const bcrypt = require('bcrypt');
const walletService = require('../../services/wallet.service');
const callService = require('../call/call.service');
const chatService = require('../chat/chat.service');
const withdrawalService = require('../withdrawal/withdrawal.service');
const { AppError } = require('../../utils/appError');
const {
  SYNC_EVENTS,
  emitEvent,
  buildHostSyncPayload,
} = require('../../services/realtimeSync.service');

const normalizePhone = (phone) => {
  const input = String(phone || '').replace(/[\s()-]/g, '').trim();
  const digits = input.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  if (input.startsWith('+')) {
    return `+${digits}`;
  }

  return input;
};

const mapSupportStatus = (value) => String(value || '').trim().toLowerCase();
const mapSupportPriority = (value) => String(value || '').trim().toLowerCase();
const mapReferralStatus = (value) => String(value || '').trim().toLowerCase();

const toNumber = (value) => Number(value || 0);

const buildPagination = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

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

const listUsers = async ({ page, limit, status, search }) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { displayName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: true,
        listenerProfile: true,
        referralCode: {
          select: { code: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const userIds = items.map((item) => item.id);

  const [rechargeSums, spentSums] = userIds.length
    ? await Promise.all([
        prisma.walletTransaction.groupBy({
          by: ['userId'],
          where: {
            userId: { in: userIds },
            type: 'RECHARGE',
            status: 'SUCCESS',
          },
          _sum: { amount: true },
        }),
        prisma.walletTransaction.groupBy({
          by: ['userId'],
          where: {
            userId: { in: userIds },
            type: { in: ['CALL_DEBIT', 'CHAT_DEBIT'] },
            status: 'SUCCESS',
          },
          _sum: { amount: true },
        }),
      ])
    : [[], []];

  const rechargeByUser = new Map(
    rechargeSums.map((item) => [item.userId, toNumber(item._sum.amount)])
  );
  const spentByUser = new Map(
    spentSums.map((item) => [item.userId, toNumber(item._sum.amount)])
  );

  const enrichedItems = items.map((item) => ({
    ...item,
    referralCode: item.referralCode?.code || null,
    totalRecharge: rechargeByUser.get(item.id) || 0,
    totalSpent: spentByUser.get(item.id) || 0,
  }));

  return {
    items: enrichedItems,
    pagination: buildPagination({ page, limit, total }),
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
    pagination: buildPagination({ page, limit, total }),
  };
};

const createListenerByAdmin = async ({
  adminId,
  fullName,
  displayName,
  phone,
  email,
  password,
  bio,
  category,
  languages,
  experienceYears,
  callRatePerMinute,
  chatRatePerMinute,
  active,
  visibleInApp,
  availability,
}) => {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

  if (!normalizedPhone) {
    throw new AppError('Valid phone number is required', 400, 'INVALID_PHONE');
  }

  const hashedPassword = await bcrypt.hash(String(password), 10);

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
      },
      select: { id: true },
    });

    if (existing) {
      throw new AppError(
        'A user already exists with this phone or email',
        409,
        'USER_ALREADY_EXISTS'
      );
    }

    const user = await tx.user.create({
      data: {
        phone: normalizedPhone,
        email: normalizedEmail,
        passwordHash: hashedPassword,
        displayName: displayName || fullName,
        role: 'LISTENER',
        status: active ? 'ACTIVE' : 'BLOCKED',
        isPhoneVerified: true,
      },
    });

    const profile = await tx.listenerProfile.create({
      data: {
        userId: user.id,
        bio: bio || null,
        category: category || null,
        languages: Array.isArray(languages) ? languages : [],
        experienceYears,
        callRatePerMinute,
        chatRatePerMinute,
        availability: active ? availability : 'OFFLINE',
        isEnabled: Boolean(active && visibleInApp),
      },
      include: { user: true },
    });

    await tx.wallet.create({
      data: {
        userId: user.id,
        currency: 'INR',
      },
    });

    await tx.userSetting.create({
      data: {
        userId: user.id,
      },
    });

    await tx.listenerRateHistory.create({
      data: {
        listenerId: user.id,
        changedByAdminId: adminId,
        oldCallRatePerMinute: callRatePerMinute,
        newCallRatePerMinute: callRatePerMinute,
        oldChatRatePerMinute: chatRatePerMinute,
        newChatRatePerMinute: chatRatePerMinute,
        changeReason: 'LISTENER_CREATED',
      },
    });

    return profile;
  });

  const payload = buildHostSyncPayload(created, {
    reason: 'ADMIN_HOST_CREATED',
  });
  emitEvent(SYNC_EVENTS.HOST_UPDATED, payload);

  return created;
};

const getListenerPricingHistory = async ({ listenerId, page, limit }) => {
  const skip = (page - 1) * limit;

  const exists = await prisma.listenerProfile.findUnique({
    where: { userId: listenerId },
    select: { userId: true },
  });

  if (!exists) {
    throw new AppError('Listener profile not found', 404, 'LISTENER_NOT_FOUND');
  }

  const [items, total] = await Promise.all([
    prisma.listenerRateHistory.findMany({
      where: { listenerId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        changedByAdmin: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
      },
    }),
    prisma.listenerRateHistory.count({
      where: { listenerId },
    }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      hostId: item.listenerId,
      changedBy:
        item.changedByAdmin?.displayName ||
        item.changedByAdmin?.email ||
        item.changedByAdmin?.phone ||
        'System',
      oldCallRate: toNumber(item.oldCallRatePerMinute),
      newCallRate: toNumber(item.newCallRatePerMinute),
      oldChatRate: toNumber(item.oldChatRatePerMinute),
      newChatRate: toNumber(item.newChatRatePerMinute),
      changedAt: item.createdAt,
      reason: item.changeReason || null,
    })),
    pagination: buildPagination({ page, limit, total }),
  };
};

const updateListenerRates = async ({
  listenerId,
  adminId,
  callRatePerMinute,
  chatRatePerMinute,
  reason,
}) => {
  const listener = await prisma.$transaction(async (tx) => {
    const existing = await tx.listenerProfile.findUnique({
      where: { userId: listenerId },
      select: {
        callRatePerMinute: true,
        chatRatePerMinute: true,
      },
    });

    if (!existing) {
      throw new AppError('Listener profile not found', 404, 'LISTENER_NOT_FOUND');
    }

    const updated = await tx.listenerProfile.update({
      where: { userId: listenerId },
      data: {
        callRatePerMinute,
        chatRatePerMinute,
      },
      include: { user: true },
    });

    await tx.listenerRateHistory.create({
      data: {
        listenerId,
        changedByAdminId: adminId,
        oldCallRatePerMinute: existing.callRatePerMinute,
        newCallRatePerMinute: callRatePerMinute,
        oldChatRatePerMinute: existing.chatRatePerMinute,
        newChatRatePerMinute: chatRatePerMinute,
        changeReason: reason || null,
      },
    });

    return updated;
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
    pagination: buildPagination({ page, limit, total }),
  };
};

const forceEndSession = async ({ sessionId, adminId, reason, sessionType = 'auto' }) => {
  const normalizedType = String(sessionType || 'auto').trim().toLowerCase();
  const reasonCode = String(reason || 'FORCE_ENDED_BY_ADMIN').trim();

  const tryForceEndCall = async () => {
    const callSession = await prisma.callSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });

    if (!callSession) {
      return null;
    }

    const updated = await callService.forceEndCallBySystem({
      sessionId,
      endReason: 'CANCELLED',
      reasonCode,
      restoreListenerAvailability: true,
    });

    return updated
      ? {
          sessionId: updated.id,
          sessionType: 'call',
          status: updated.status,
          endReason: updated.endReason,
          endedAt: updated.endedAt,
          endedByAdminId: adminId,
          reason: reasonCode,
        }
      : null;
  };

  const tryForceEndChat = async () => {
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });

    if (!chatSession) {
      return null;
    }

    const updated = await chatService.forceEndChatBySystem({
      sessionId,
      endReason: 'CANCELLED',
      reasonCode,
      restoreListenerAvailability: true,
    });

    return updated
      ? {
          sessionId: updated.id,
          sessionType: 'chat',
          status: updated.status,
          endReason: updated.endReason,
          endedAt: updated.endedAt,
          endedByAdminId: adminId,
          reason: reasonCode,
        }
      : null;
  };

  if (normalizedType === 'call') {
    const result = await tryForceEndCall();
    if (!result) {
      throw new AppError('Call session not found', 404, 'CALL_SESSION_NOT_FOUND');
    }
    return result;
  }

  if (normalizedType === 'chat') {
    const result = await tryForceEndChat();
    if (!result) {
      throw new AppError('Chat session not found', 404, 'CHAT_SESSION_NOT_FOUND');
    }
    return result;
  }

  const [callResult, chatResult] = await Promise.all([tryForceEndCall(), tryForceEndChat()]);
  const chosen = callResult || chatResult;

  if (!chosen) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  return chosen;
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

const listReferrals = async ({ page = 1, limit = 20, status, search }) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { referralCode: { contains: search, mode: 'insensitive' } },
            { inviter: { is: { displayName: { contains: search, mode: 'insensitive' } } } },
            { inviter: { is: { phone: { contains: search, mode: 'insensitive' } } } },
            { referred: { is: { displayName: { contains: search, mode: 'insensitive' } } } },
            { referred: { is: { phone: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.referral.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        inviter: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
        referred: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
    }),
    prisma.referral.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      referralCode: item.referralCode,
      inviterName: item.inviter?.displayName || item.inviter?.phone || 'Unknown',
      invitedUserName: item.referred?.displayName || item.referred?.phone || 'Unknown',
      rewardStatus: mapReferralStatus(item.status),
      rewardAmount: toNumber(item.inviterRewardAmount) + toNumber(item.referredRewardAmount),
      qualifyingTransaction: item.qualifyingTransactionId || null,
      rewardedAt: item.rewardedAt || null,
      createdAt: item.createdAt,
      inviterUserId: item.inviterUserId,
      referredUserId: item.referredUserId,
    })),
    pagination: buildPagination({ page, limit, total }),
  };
};

const listSupportTickets = async ({ page = 1, limit = 20, status, priority, search }) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(search
      ? {
          OR: [
            { subject: { contains: search, mode: 'insensitive' } },
            { message: { contains: search, mode: 'insensitive' } },
            { user: { is: { displayName: { contains: search, mode: 'insensitive' } } } },
            { user: { is: { phone: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            role: true,
          },
        },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      userId: item.userId,
      userName: item.user?.displayName || item.user?.phone || 'Unknown',
      hostName:
        item.user?.role === 'LISTENER'
          ? item.user?.displayName || item.user?.phone || null
          : null,
      subject: item.subject,
      message: item.message,
      priority: mapSupportPriority(item.priority),
      status: mapSupportStatus(item.status),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      resolvedAt: item.resolvedAt,
    })),
    pagination: buildPagination({ page, limit, total }),
  };
};

const updateSupportTicket = async ({
  ticketId,
  adminId,
  status,
  priority,
  assignedTo,
  reply,
}) => {
  const existing = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          phone: true,
          role: true,
        },
      },
    },
  });

  if (!existing) {
    throw new AppError('Support ticket not found', 404, 'SUPPORT_TICKET_NOT_FOUND');
  }

  const trimmedReply = String(reply || '').trim();
  const replyBlock = trimmedReply
    ? `\n\n[Admin Reply ${new Date().toISOString()} by ${adminId}]\n${trimmedReply}`
    : '';

  const nextStatus = status || existing.status;
  const resolvedStatuses = new Set(['RESOLVED', 'CLOSED']);

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(trimmedReply ? { message: `${existing.message}${replyBlock}` } : {}),
      ...(resolvedStatuses.has(nextStatus)
        ? { resolvedAt: existing.resolvedAt || new Date() }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          phone: true,
          role: true,
        },
      },
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    userName: updated.user?.displayName || updated.user?.phone || 'Unknown',
    hostName:
      updated.user?.role === 'LISTENER'
        ? updated.user?.displayName || updated.user?.phone || null
        : null,
    subject: updated.subject,
    message: updated.message,
    priority: mapSupportPriority(updated.priority),
    status: mapSupportStatus(updated.status),
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    resolvedAt: updated.resolvedAt,
    schemaGaps: assignedTo
      ? ['SupportTicket.assignedTo is not present in current schema and was not persisted']
      : [],
  };
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
  createListenerByAdmin,
  getListenerPricingHistory,
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
  forceEndSession,
  manualWalletAdjustment,
  listRechargePlans,
  createRechargePlan,
  updateRechargePlan,
  listReferrals,
  listSupportTickets,
  updateSupportTicket,
  getReferralRule,
  updateReferralRule,
};
