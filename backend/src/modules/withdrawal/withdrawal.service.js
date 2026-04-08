const { Prisma } = require('@prisma/client');
const { prisma } = require('../../config/prisma');
const { logger } = require('../../config/logger');
const { AppError } = require('../../utils/appError');

const ZERO = new Prisma.Decimal(0);
const configuredMinimumAmount = Number(process.env.MIN_WITHDRAWAL_AMOUNT || 5000);
const MIN_WITHDRAWAL_AMOUNT = Number.isFinite(configuredMinimumAmount)
  ? Math.max(1, configuredMinimumAmount)
  : 5000;

const ACTIVE_WITHDRAWAL_STATUSES = ['PENDING', 'APPROVED', 'IN_PROGRESS'];
const PAYMENT_TERMINAL_STATUSES = ['REJECTED', 'PAYMENT_DONE'];

const STATUS_TRANSITIONS = Object.freeze({
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PAYMENT_DONE'],
  REJECTED: [],
  PAYMENT_DONE: [],
});

const toDecimal = (value) => new Prisma.Decimal(value || 0);
const toNumber = (value) => Number(value || 0);

const normalizeString = (value) => String(value || '').trim();
const normalizeOptionalString = (value) => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = normalizeString(value);
  return trimmed || null;
};

const normalizeStatus = (value) => normalizeString(value).toUpperCase();
const normalizeIfscCode = (value) => normalizeString(value).toUpperCase();

const extractAccountLast4 = ({ accountNumber, accountNumberLast4 }) => {
  const accountDigits = String(accountNumber || '').replace(/\D/g, '');
  if (accountDigits.length >= 4) {
    return accountDigits.slice(-4);
  }

  const fallbackLast4 = normalizeString(accountNumberLast4);
  if (!fallbackLast4) {
    return '';
  }

  return fallbackLast4.slice(-4);
};

const assertListenerRole = (role) => {
  if (normalizeStatus(role) !== 'LISTENER') {
    throw new AppError(
      'Withdrawal is allowed only for listener accounts.',
      403,
      'WITHDRAWAL_NOT_ALLOWED_FOR_ROLE',
    );
  }
};

const assertAdminRole = (role) => {
  if (normalizeStatus(role) !== 'ADMIN') {
    throw new AppError('Only admins can manage withdrawals.', 403, 'ADMIN_REQUIRED');
  }
};

const ensureWalletLocked = async (tx, userId) => {
  const wallet = await tx.wallet.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      balance: ZERO,
      lockedWithdrawalBalance: ZERO,
      currency: 'INR',
    },
  });

  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;

  return tx.wallet.findUnique({ where: { id: wallet.id } });
};

const lockWithdrawalRequest = async (tx, withdrawalId) => {
  await tx.$queryRaw`SELECT id FROM "WithdrawalRequest" WHERE id = ${withdrawalId} FOR UPDATE`;
  return tx.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
  });
};

const mapWithdrawal = (record) => {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    listenerId: record.listenerId,
    amount: toNumber(record.amount),
    status: record.status,
    bankName: record.bankName,
    accountHolderName: record.accountHolderName,
    accountNumberLast4: record.accountNumberLast4,
    ifscCode: record.ifscCode,
    requestedAt: record.requestedAt,
    approvedAt: record.approvedAt,
    processingAt: record.processingAt,
    paidAt: record.paidAt,
    rejectedAt: record.rejectedAt,
    adminNote: record.adminNote,
    transactionReference: record.transactionReference,
    approvedByAdminId: record.approvedByAdminId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    listener: record.listener
      ? {
          id: record.listener.id,
          displayName: record.listener.displayName,
          phone: record.listener.phone,
        }
      : undefined,
    approvedByAdmin: record.approvedByAdmin
      ? {
          id: record.approvedByAdmin.id,
          displayName: record.approvedByAdmin.displayName,
          phone: record.approvedByAdmin.phone,
        }
      : undefined,
  };
};

const assertValidTransition = (currentStatus, targetStatus) => {
  const normalizedCurrent = normalizeStatus(currentStatus);
  const normalizedTarget = normalizeStatus(targetStatus);
  const allowedTargets = STATUS_TRANSITIONS[normalizedCurrent];

  if (!allowedTargets) {
    throw new AppError('Unknown current withdrawal status.', 400, 'WITHDRAWAL_STATUS_INVALID');
  }

  if (normalizedCurrent === normalizedTarget) {
    throw new AppError(
      'Withdrawal is already in this status.',
      400,
      'WITHDRAWAL_STATUS_ALREADY_SET',
      {
        status: normalizedCurrent,
      },
    );
  }

  if (!allowedTargets.includes(normalizedTarget)) {
    throw new AppError(
      `Invalid withdrawal status transition: ${normalizedCurrent} -> ${normalizedTarget}.`,
      400,
      'INVALID_WITHDRAWAL_STATUS_TRANSITION',
      {
        currentStatus: normalizedCurrent,
        requestedStatus: normalizedTarget,
        allowedTransitions: allowedTargets,
      },
    );
  }
};

const createWalletLedgerEntry = async ({
  tx,
  wallet,
  userId,
  type,
  amount,
  balanceBefore,
  balanceAfter,
  description,
  metadata,
  idempotencyKey,
}) =>
  tx.walletTransaction.create({
    data: {
      userId,
      walletId: wallet.id,
      type,
      status: 'SUCCESS',
      amount,
      balanceBefore,
      balanceAfter,
      description,
      metadata,
      idempotencyKey,
    },
  });

const getListenerWithdrawalConfig = async (userId) => {
  const [user, wallet, activeRequest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        phone: true,
        email: true,
      },
    }),
    prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: ZERO,
        lockedWithdrawalBalance: ZERO,
        currency: 'INR',
      },
    }),
    prisma.withdrawalRequest.findFirst({
      where: {
        listenerId: userId,
        status: { in: ACTIVE_WITHDRAWAL_STATUSES },
      },
      orderBy: { requestedAt: 'desc' },
    }),
  ]);

  if (!user) {
    throw new AppError('Account not found', 404, 'ACCOUNT_NOT_FOUND');
  }

  const isListener = normalizeStatus(user.role) === 'LISTENER';

  if (!isListener) {
    return {
      enabled: false,
      minimumAmount: MIN_WITHDRAWAL_AMOUNT,
      availableBalance: toNumber(wallet.balance),
      lockedWithdrawalBalance: toNumber(wallet.lockedWithdrawalBalance),
      currency: wallet.currency,
      reasonCode: 'WITHDRAWAL_NOT_ALLOWED_FOR_ROLE',
      reason: 'Withdrawal is available only for listeners.',
      activeRequest: null,
      hasPayoutMethod: false,
    };
  }

  return {
    enabled: true,
    minimumAmount: MIN_WITHDRAWAL_AMOUNT,
    availableBalance: toNumber(wallet.balance),
    lockedWithdrawalBalance: toNumber(wallet.lockedWithdrawalBalance),
    currency: wallet.currency,
    hasPayoutMethod: true,
    activeRequest: activeRequest
      ? {
          id: activeRequest.id,
          status: activeRequest.status,
          amount: toNumber(activeRequest.amount),
          requestedAt: activeRequest.requestedAt,
        }
      : null,
  };
};

const listListenerWithdrawals = async (userId, { page = 1, limit = 20, status } = {}) => {
  const normalizedStatus = status ? normalizeStatus(status) : null;
  const skip = (page - 1) * limit;

  const where = {
    listenerId: userId,
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  return {
    items: items.map(mapWithdrawal),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getListenerWithdrawalById = async ({ userId, withdrawalId }) => {
  const request = await prisma.withdrawalRequest.findFirst({
    where: {
      id: withdrawalId,
      listenerId: userId,
    },
  });

  if (!request) {
    throw new AppError('Withdrawal request not found', 404, 'WITHDRAWAL_NOT_FOUND');
  }

  return mapWithdrawal(request);
};

const createListenerWithdrawalRequest = async ({
  userId,
  amount,
  bankName,
  accountHolderName,
  accountNumber,
  accountNumberLast4,
  ifscCode,
  note,
}) => {
  const amountDecimal = toDecimal(amount);

  if (amountDecimal.lte(ZERO)) {
    throw new AppError('Withdrawal amount must be greater than zero.', 400, 'INVALID_AMOUNT');
  }

  if (amountDecimal.lt(toDecimal(MIN_WITHDRAWAL_AMOUNT))) {
    throw new AppError(
      `Minimum withdrawal amount is INR ${MIN_WITHDRAWAL_AMOUNT}.`,
      400,
      'WITHDRAWAL_MINIMUM_NOT_MET',
      {
        minimumAmount: MIN_WITHDRAWAL_AMOUNT,
      },
    );
  }

  const normalizedBankName = normalizeString(bankName);
  const normalizedAccountHolderName = normalizeString(accountHolderName);
  const normalizedIfscCode = normalizeIfscCode(ifscCode);
  const normalizedNote = normalizeOptionalString(note);
  const resolvedAccountLast4 = extractAccountLast4({
    accountNumber,
    accountNumberLast4,
  });

  if (!/^\d{4}$/.test(resolvedAccountLast4)) {
    throw new AppError(
      'Valid bank account details are required.',
      400,
      'INVALID_ACCOUNT_DETAILS',
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const listener = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (!listener) {
      throw new AppError('Listener account not found.', 404, 'LISTENER_NOT_FOUND');
    }

    assertListenerRole(listener.role);

    if (normalizeStatus(listener.status) !== 'ACTIVE') {
      throw new AppError(
        'Inactive listener account cannot request withdrawals.',
        403,
        'LISTENER_ACCOUNT_INACTIVE',
      );
    }

    const wallet = await ensureWalletLocked(tx, userId);
    const availableBefore = toDecimal(wallet.balance);
    const lockedBefore = toDecimal(wallet.lockedWithdrawalBalance);

    if (availableBefore.lt(amountDecimal)) {
      throw new AppError(
        'Insufficient wallet balance for this withdrawal request.',
        400,
        'WITHDRAWAL_INSUFFICIENT_BALANCE',
        {
          availableBalance: toNumber(availableBefore),
          requestedAmount: toNumber(amountDecimal),
        },
      );
    }

    const availableAfter = availableBefore.minus(amountDecimal);
    const lockedAfter = lockedBefore.plus(amountDecimal);

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: availableAfter,
        lockedWithdrawalBalance: lockedAfter,
      },
    });

    const withdrawalRequest = await tx.withdrawalRequest.create({
      data: {
        listenerId: userId,
        amount: amountDecimal,
        status: 'PENDING',
        bankName: normalizedBankName,
        accountHolderName: normalizedAccountHolderName,
        accountNumberLast4: resolvedAccountLast4,
        ifscCode: normalizedIfscCode,
        requestedAt: new Date(),
      },
    });

    await createWalletLedgerEntry({
      tx,
      wallet,
      userId,
      type: 'WITHDRAWAL_LOCK',
      amount: amountDecimal,
      balanceBefore: availableBefore,
      balanceAfter: availableAfter,
      description: 'Withdrawal request submitted',
      metadata: {
        withdrawalRequestId: withdrawalRequest.id,
        listenerNote: normalizedNote,
        lockedWithdrawalBalanceBefore: toNumber(lockedBefore),
        lockedWithdrawalBalanceAfter: toNumber(lockedAfter),
      },
      idempotencyKey: `withdrawal:lock:${withdrawalRequest.id}`,
    });

    return {
      withdrawalRequest,
      walletCurrency: wallet.currency,
      availableAfter,
      lockedAfter,
    };
  });

  logger.info('[Withdrawal] listener withdrawal request created', {
    listenerId: userId,
    withdrawalRequestId: result.withdrawalRequest.id,
    amount: toNumber(result.withdrawalRequest.amount),
  });

  return {
    request: mapWithdrawal(result.withdrawalRequest),
    wallet: {
      availableBalance: toNumber(result.availableAfter),
      lockedWithdrawalBalance: toNumber(result.lockedAfter),
      currency: result.walletCurrency,
    },
    minimumAmount: MIN_WITHDRAWAL_AMOUNT,
  };
};

const listAdminWithdrawals = async ({
  page = 1,
  limit = 20,
  status,
  listenerId,
} = {}) => {
  const skip = (page - 1) * limit;
  const normalizedStatus = status ? normalizeStatus(status) : null;

  const where = {
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
    ...(listenerId ? { listenerId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      include: {
        listener: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
        approvedByAdmin: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  return {
    items: items.map(mapWithdrawal),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getAdminWithdrawalById = async ({ withdrawalId }) => {
  const request = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: {
      listener: {
        select: {
          id: true,
          displayName: true,
          phone: true,
          role: true,
        },
      },
      approvedByAdmin: {
        select: {
          id: true,
          displayName: true,
          phone: true,
          role: true,
        },
      },
    },
  });

  if (!request) {
    throw new AppError('Withdrawal request not found.', 404, 'WITHDRAWAL_NOT_FOUND');
  }

  return mapWithdrawal(request);
};

const updateWithdrawalStatus = async ({
  adminId,
  withdrawalId,
  status,
  adminNote,
  transactionReference,
}) => {
  const normalizedStatus = normalizeStatus(status);
  const normalizedAdminNote = normalizeOptionalString(adminNote);
  const normalizedTransactionReference = normalizeOptionalString(transactionReference);

  if (!STATUS_TRANSITIONS[normalizedStatus] && !PAYMENT_TERMINAL_STATUSES.includes(normalizedStatus)) {
    throw new AppError('Unsupported withdrawal status.', 400, 'WITHDRAWAL_STATUS_INVALID');
  }

  const result = await prisma.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true },
    });

    if (!admin) {
      throw new AppError('Admin account not found.', 404, 'ADMIN_NOT_FOUND');
    }

    assertAdminRole(admin.role);

    const currentRequest = await lockWithdrawalRequest(tx, withdrawalId);
    if (!currentRequest) {
      throw new AppError('Withdrawal request not found.', 404, 'WITHDRAWAL_NOT_FOUND');
    }

    assertValidTransition(currentRequest.status, normalizedStatus);

    const wallet = await ensureWalletLocked(tx, currentRequest.listenerId);
    const amountDecimal = toDecimal(currentRequest.amount);
    const availableBefore = toDecimal(wallet.balance);
    const lockedBefore = toDecimal(wallet.lockedWithdrawalBalance);

    const updatePayload = {
      status: normalizedStatus,
      approvedByAdminId: currentRequest.approvedByAdminId || admin.id,
    };

    if (normalizedAdminNote !== undefined) {
      updatePayload.adminNote = normalizedAdminNote;
    }

    if (normalizedTransactionReference !== undefined) {
      updatePayload.transactionReference = normalizedTransactionReference;
    }

    if (normalizedStatus === 'APPROVED') {
      updatePayload.approvedAt = new Date();
      updatePayload.approvedByAdminId = admin.id;
    }

    if (normalizedStatus === 'IN_PROGRESS') {
      updatePayload.processingAt = new Date();
    }

    if (normalizedStatus === 'REJECTED') {
      if (lockedBefore.lt(amountDecimal)) {
        throw new AppError(
          'Locked withdrawal balance is lower than withdrawal amount.',
          409,
          'WITHDRAWAL_LOCKED_BALANCE_MISMATCH',
          {
            lockedWithdrawalBalance: toNumber(lockedBefore),
            withdrawalAmount: toNumber(amountDecimal),
          },
        );
      }

      const availableAfter = availableBefore.plus(amountDecimal);
      const lockedAfter = lockedBefore.minus(amountDecimal);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: availableAfter,
          lockedWithdrawalBalance: lockedAfter,
        },
      });

      await createWalletLedgerEntry({
        tx,
        wallet,
        userId: currentRequest.listenerId,
        type: 'WITHDRAWAL_REFUND',
        amount: amountDecimal,
        balanceBefore: availableBefore,
        balanceAfter: availableAfter,
        description: 'Withdrawal rejected and refunded',
        metadata: {
          withdrawalRequestId: currentRequest.id,
          rejectedByAdminId: admin.id,
          lockedWithdrawalBalanceBefore: toNumber(lockedBefore),
          lockedWithdrawalBalanceAfter: toNumber(lockedAfter),
        },
        idempotencyKey: `withdrawal:refund:${currentRequest.id}`,
      });

      updatePayload.rejectedAt = new Date();
    }

    if (normalizedStatus === 'PAYMENT_DONE') {
      const resolvedTransactionReference =
        normalizedTransactionReference || normalizeOptionalString(currentRequest.transactionReference);

      if (!resolvedTransactionReference) {
        throw new AppError(
          'Transaction reference is required to mark withdrawal as PAYMENT_DONE.',
          400,
          'WITHDRAWAL_TRANSACTION_REFERENCE_REQUIRED',
        );
      }

      if (lockedBefore.lt(amountDecimal)) {
        throw new AppError(
          'Locked withdrawal balance is lower than withdrawal amount.',
          409,
          'WITHDRAWAL_LOCKED_BALANCE_MISMATCH',
          {
            lockedWithdrawalBalance: toNumber(lockedBefore),
            withdrawalAmount: toNumber(amountDecimal),
          },
        );
      }

      const lockedAfter = lockedBefore.minus(amountDecimal);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          lockedWithdrawalBalance: lockedAfter,
        },
      });

      await createWalletLedgerEntry({
        tx,
        wallet,
        userId: currentRequest.listenerId,
        type: 'WITHDRAWAL_PAYOUT',
        amount: amountDecimal,
        balanceBefore: availableBefore,
        balanceAfter: availableBefore,
        description: 'Withdrawal paid out',
        metadata: {
          withdrawalRequestId: currentRequest.id,
          paidByAdminId: admin.id,
          transactionReference: resolvedTransactionReference,
          lockedWithdrawalBalanceBefore: toNumber(lockedBefore),
          lockedWithdrawalBalanceAfter: toNumber(lockedAfter),
        },
        idempotencyKey: `withdrawal:payout:${currentRequest.id}`,
      });

      updatePayload.transactionReference = resolvedTransactionReference;
      updatePayload.paidAt = new Date();
    }

    const updatedRequest = await tx.withdrawalRequest.update({
      where: { id: currentRequest.id },
      data: updatePayload,
      include: {
        listener: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
        approvedByAdmin: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
    });

    return {
      request: updatedRequest,
      wallet: await tx.wallet.findUnique({
        where: { id: wallet.id },
        select: {
          balance: true,
          lockedWithdrawalBalance: true,
          currency: true,
        },
      }),
    };
  });

  logger.info('[Withdrawal] admin status updated', {
    adminId,
    withdrawalRequestId: withdrawalId,
    status: normalizedStatus,
  });

  return {
    request: mapWithdrawal(result.request),
    wallet: {
      availableBalance: toNumber(result.wallet.balance),
      lockedWithdrawalBalance: toNumber(result.wallet.lockedWithdrawalBalance),
      currency: result.wallet.currency,
    },
  };
};

const updateWithdrawalAdminNote = async ({ adminId, withdrawalId, adminNote }) => {
  const normalizedNote = normalizeOptionalString(adminNote);

  if (!normalizedNote) {
    throw new AppError('Admin note is required.', 400, 'ADMIN_NOTE_REQUIRED');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true },
    });

    if (!admin) {
      throw new AppError('Admin account not found.', 404, 'ADMIN_NOT_FOUND');
    }

    assertAdminRole(admin.role);

    const withdrawal = await tx.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      throw new AppError('Withdrawal request not found.', 404, 'WITHDRAWAL_NOT_FOUND');
    }

    return tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        adminNote: normalizedNote,
      },
      include: {
        listener: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
        approvedByAdmin: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
    });
  });

  logger.info('[Withdrawal] admin note updated', {
    adminId,
    withdrawalRequestId: withdrawalId,
  });

  return mapWithdrawal(updated);
};

const updateWithdrawalTransactionReference = async ({
  adminId,
  withdrawalId,
  transactionReference,
}) => {
  const normalizedReference = normalizeOptionalString(transactionReference);

  if (!normalizedReference) {
    throw new AppError(
      'Transaction reference is required.',
      400,
      'WITHDRAWAL_TRANSACTION_REFERENCE_REQUIRED',
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true },
    });

    if (!admin) {
      throw new AppError('Admin account not found.', 404, 'ADMIN_NOT_FOUND');
    }

    assertAdminRole(admin.role);

    const withdrawal = await tx.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      throw new AppError('Withdrawal request not found.', 404, 'WITHDRAWAL_NOT_FOUND');
    }

    if (!['IN_PROGRESS', 'PAYMENT_DONE'].includes(withdrawal.status)) {
      throw new AppError(
        'Transaction reference can be updated only when request is IN_PROGRESS or PAYMENT_DONE.',
        400,
        'WITHDRAWAL_REFERENCE_STATUS_INVALID',
      );
    }

    return tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        transactionReference: normalizedReference,
      },
      include: {
        listener: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
        approvedByAdmin: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
    });
  });

  logger.info('[Withdrawal] transaction reference updated', {
    adminId,
    withdrawalRequestId: withdrawalId,
  });

  return mapWithdrawal(updated);
};

module.exports = {
  MIN_WITHDRAWAL_AMOUNT,
  ACTIVE_WITHDRAWAL_STATUSES,
  getListenerWithdrawalConfig,
  listListenerWithdrawals,
  getListenerWithdrawalById,
  createListenerWithdrawalRequest,
  listAdminWithdrawals,
  getAdminWithdrawalById,
  updateWithdrawalStatus,
  updateWithdrawalAdminNote,
  updateWithdrawalTransactionReference,
};
