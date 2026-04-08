const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/prisma');
const { AppError } = require('../utils/appError');
const { INSUFFICIENT_BALANCE } = require('../constants/errors');

const ZERO = new Prisma.Decimal(0);

const toDecimal = (value) => new Prisma.Decimal(value);
const toNumber = (value) => Number(value || 0);

const ensureWallet = async (tx, userId) => {
  const existing = await tx.wallet.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  return tx.wallet.create({
    data: {
      userId,
      balance: ZERO,
      currency: 'INR',
    },
  });
};

const getSuggestedRechargePlans = async (tx) => {
  const plans = await tx.rechargePlan.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { amount: 'asc' },
    take: 3,
  });

  return plans.map((plan) => toNumber(plan.amount));
};

const lockWalletRow = async (tx, walletId) => {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
  return tx.wallet.findUnique({ where: { id: walletId } });
};

const buildTransactionRecord = ({
  userId,
  walletId,
  type,
  amount,
  status,
  balanceBefore,
  balanceAfter,
  relatedSessionId,
  relatedPaymentId,
  description,
  metadata,
  idempotencyKey,
}) => ({
  userId,
  walletId,
  type,
  amount,
  status,
  balanceBefore,
  balanceAfter,
  relatedSessionId,
  relatedPaymentId,
  description,
  metadata,
  idempotencyKey,
});

const creditWallet = async ({
  userId,
  amount,
  type,
  description,
  relatedSessionId = null,
  relatedPaymentId = null,
  metadata = null,
  idempotencyKey = null,
  status = 'SUCCESS',
  tx = null,
}) => {
  const amountDecimal = toDecimal(amount);
  if (amountDecimal.lte(ZERO)) {
    throw new AppError('Credit amount must be greater than zero', 400, 'INVALID_AMOUNT');
  }

  const prismaClient = tx || prisma;

  const execute = async (transactionClient) => {
    if (idempotencyKey) {
      const existing = await transactionClient.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    const wallet = await ensureWallet(transactionClient, userId);
    const lockedWallet = await lockWalletRow(transactionClient, wallet.id);

    const balanceBefore = toDecimal(lockedWallet.balance);
    const balanceAfter = balanceBefore.plus(amountDecimal);

    await transactionClient.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    return transactionClient.walletTransaction.create({
      data: buildTransactionRecord({
        userId,
        walletId: wallet.id,
        type,
        amount: amountDecimal,
        status,
        balanceBefore,
        balanceAfter,
        relatedSessionId,
        relatedPaymentId,
        description,
        metadata,
        idempotencyKey,
      }),
    });
  };

  return tx ? execute(prismaClient) : prismaClient.$transaction(execute);
};

const debitWallet = async ({
  userId,
  amount,
  type,
  description,
  relatedSessionId = null,
  relatedPaymentId = null,
  metadata = null,
  idempotencyKey = null,
  status = 'SUCCESS',
  tx = null,
}) => {
  const amountDecimal = toDecimal(amount);
  if (amountDecimal.lte(ZERO)) {
    throw new AppError('Debit amount must be greater than zero', 400, 'INVALID_AMOUNT');
  }

  const prismaClient = tx || prisma;

  const execute = async (transactionClient) => {
    if (idempotencyKey) {
      const existing = await transactionClient.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    const wallet = await ensureWallet(transactionClient, userId);
    const lockedWallet = await lockWalletRow(transactionClient, wallet.id);

    const balanceBefore = toDecimal(lockedWallet.balance);

    if (balanceBefore.lt(amountDecimal)) {
      const suggestedRechargePlans = await getSuggestedRechargePlans(transactionClient);
      throw new AppError(
        INSUFFICIENT_BALANCE.message,
        400,
        INSUFFICIENT_BALANCE.code,
        {
          currentBalance: toNumber(balanceBefore),
          requiredBalance: toNumber(amountDecimal),
          suggestedRechargePlans,
        }
      );
    }

    const balanceAfter = balanceBefore.minus(amountDecimal);

    await transactionClient.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    return transactionClient.walletTransaction.create({
      data: buildTransactionRecord({
        userId,
        walletId: wallet.id,
        type,
        amount: amountDecimal,
        status,
        balanceBefore,
        balanceAfter,
        relatedSessionId,
        relatedPaymentId,
        description,
        metadata,
        idempotencyKey,
      }),
    });
  };

  return tx ? execute(prismaClient) : prismaClient.$transaction(execute);
};

const getWalletByUserId = async (userId) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet) {
    return wallet;
  }

  return prisma.wallet.create({
    data: {
      userId,
      balance: ZERO,
      currency: 'INR',
    },
  });
};

const getRechargePlans = async () => {
  return prisma.rechargePlan.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { amount: 'asc' }],
  });
};

const getWalletHistory = async (userId, { page = 1, limit = 20, type = null } = {}) => {
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(type ? { type } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
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

const getWalletSummary = async (userId) => {
  const wallet = await getWalletByUserId(userId);
  const plans = await getRechargePlans();

  const [totalSpent, totalRecharged, referralEarned] = await Promise.all([
    prisma.walletTransaction.aggregate({
      where: {
        userId,
        status: 'SUCCESS',
        type: { in: ['CALL_DEBIT', 'CHAT_DEBIT', 'ADMIN_DEBIT'] },
      },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        userId,
        status: 'SUCCESS',
        type: { in: ['RECHARGE'] },
      },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        userId,
        status: 'SUCCESS',
        type: { in: ['REFERRAL_BONUS', 'PROMO_CREDIT'] },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    balance: toNumber(wallet.balance),
    currency: wallet.currency,
    plans: plans.map((plan) => toNumber(plan.amount)),
    totalSpent: toNumber(totalSpent._sum.amount),
    totalRecharged: toNumber(totalRecharged._sum.amount),
    referralEarned: toNumber(referralEarned._sum.amount),
  };
};

const estimateTalkTime = (balance, ratePerMinute) => {
  const balanceDecimal = toDecimal(balance);
  const rateDecimal = toDecimal(ratePerMinute);
  if (rateDecimal.lte(ZERO)) {
    return 0;
  }

  return Math.floor(toNumber(balanceDecimal.div(rateDecimal)));
};

module.exports = {
  toNumber,
  toDecimal,
  getWalletByUserId,
  getWalletSummary,
  getWalletHistory,
  getRechargePlans,
  creditWallet,
  debitWallet,
  estimateTalkTime,
};
