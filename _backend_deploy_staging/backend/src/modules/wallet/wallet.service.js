const { prisma } = require('../../config/prisma');
const walletLedgerService = require('../../services/wallet.service');
const { getPaymentProvider } = require('../../services/payment/paymentProviderFactory');
const referralService = require('../referral/referral.service');
const { AppError } = require('../../utils/appError');
const { getSocketServer } = require('../../socket/socketStore');

const toNumber = (value) => Number(value || 0);
const configuredMinWithdrawalAmount = Number(process.env.MIN_WITHDRAWAL_AMOUNT || 5000);
const MIN_WITHDRAWAL_AMOUNT = Number.isFinite(configuredMinWithdrawalAmount)
  ? Math.max(1, configuredMinWithdrawalAmount)
  : 5000;
const WITHDRAWAL_SUBJECT_PREFIX = 'Withdrawal Request';
const WITHDRAWAL_MESSAGE_PREFIX = '[withdrawal]';

const normalizeNote = (value) => String(value || '').trim();

const buildWithdrawalMessage = ({
  amount,
  currentBalance,
  minimumAmount,
  note,
}) => {
  const payload = {
    amount: toNumber(amount),
    currentBalance: toNumber(currentBalance),
    minimumAmount: toNumber(minimumAmount),
    note: normalizeNote(note) || null,
    requestedAt: new Date().toISOString(),
  };

  return `${WITHDRAWAL_MESSAGE_PREFIX}${JSON.stringify(payload)}`;
};

const parseWithdrawalPayload = (message = '') => {
  const normalized = String(message || '').trim();
  if (!normalized.startsWith(WITHDRAWAL_MESSAGE_PREFIX)) {
    return null;
  }

  const rawJson = normalized.slice(WITHDRAWAL_MESSAGE_PREFIX.length).trim();
  if (!rawJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawJson);
    return {
      amount: toNumber(parsed?.amount || 0),
      currentBalance: toNumber(parsed?.currentBalance || 0),
      minimumAmount: toNumber(parsed?.minimumAmount || MIN_WITHDRAWAL_AMOUNT),
      note: parsed?.note || null,
      requestedAt: parsed?.requestedAt || null,
    };
  } catch (_error) {
    return null;
  }
};

const evaluateCoupon = async ({ couponCode, amount }) => {
  if (!couponCode) {
    return {
      valid: false,
      discountAmount: 0,
      payableAmount: amount,
      reason: null,
      coupon: null,
    };
  }

  const normalizedCode = couponCode.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code: normalizedCode } });

  if (!coupon || !coupon.isActive) {
    return {
      valid: false,
      discountAmount: 0,
      payableAmount: amount,
      reason: 'Coupon is invalid or inactive',
      coupon: null,
    };
  }

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return {
      valid: false,
      discountAmount: 0,
      payableAmount: amount,
      reason: 'Coupon has expired',
      coupon,
    };
  }

  if (Number(amount) < toNumber(coupon.minAmount)) {
      return {
        valid: false,
        discountAmount: 0,
        payableAmount: amount,
        reason: `Minimum order amount is INR ${toNumber(coupon.minAmount)}`,
        coupon,
      };
  }

  let discountAmount = 0;
  if (coupon.discountType === 'FIXED') {
    discountAmount = toNumber(coupon.discountValue);
  } else {
    discountAmount = (Number(amount) * toNumber(coupon.discountValue)) / 100;
    if (coupon.maxDiscount) {
      discountAmount = Math.min(discountAmount, toNumber(coupon.maxDiscount));
    }
  }

  discountAmount = Math.max(0, Math.min(discountAmount, Number(amount)));
  const payableAmount = Number(amount) - discountAmount;

  return {
    valid: true,
    discountAmount,
    payableAmount,
    reason: null,
    coupon,
  };
};

const getWalletSummary = async (userId) => {
  return walletLedgerService.getWalletSummary(userId);
};

const getWalletPlans = async () => {
  const plans = await walletLedgerService.getRechargePlans();
  return plans.map((plan) => ({
    id: plan.id,
    amount: toNumber(plan.amount),
    talktime: toNumber(plan.talktime),
    label: plan.label,
    status: plan.status,
  }));
};

const getWithdrawalConfig = async (userId) => {
  const [user, wallet] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        phone: true,
        email: true,
      },
    }),
    walletLedgerService.getWalletByUserId(userId),
  ]);

  if (!user) {
    throw new AppError('Account not found', 404, 'ACCOUNT_NOT_FOUND');
  }

  const isListener = String(user.role || '').toUpperCase() === 'LISTENER';
  if (!isListener) {
    return {
      enabled: false,
      minimumAmount: MIN_WITHDRAWAL_AMOUNT,
      currentBalance: toNumber(wallet?.balance || 0),
      currency: wallet?.currency || 'INR',
      reasonCode: 'WITHDRAWAL_NOT_AVAILABLE_FOR_ROLE',
      reason: 'Withdrawal is available only for hosts.',
      hasPayoutMethod: false,
      payoutCta: 'Switch to host account to request withdrawal.',
      pendingRequest: null,
    };
  }

  const hasPayoutMethod = Boolean(user?.phone || user?.email);
  const pendingRequest = await prisma.supportTicket.findFirst({
    where: {
      userId,
      subject: {
        startsWith: WITHDRAWAL_SUBJECT_PREFIX,
      },
      status: {
        in: ['OPEN', 'IN_PROGRESS'],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    enabled: true,
    minimumAmount: MIN_WITHDRAWAL_AMOUNT,
    currentBalance: toNumber(wallet?.balance || 0),
    currency: wallet?.currency || 'INR',
    hasPayoutMethod,
    payoutCta: hasPayoutMethod
      ? null
      : 'Add a valid phone number or email in your profile to enable withdrawals.',
    pendingRequest: pendingRequest
      ? {
          id: pendingRequest.id,
          status: pendingRequest.status,
          createdAt: pendingRequest.createdAt,
        }
      : null,
  };
};

const getWithdrawalHistory = async (userId, { page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const where = {
    userId,
    subject: {
      startsWith: WITHDRAWAL_SUBJECT_PREFIX,
    },
  };

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        updatedAt: true,
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return {
    items: items.map((item) => {
      const parsed = parseWithdrawalPayload(item.message);
      return {
        id: item.id,
        amount: toNumber(parsed?.amount || 0),
        status: item.status,
        note: parsed?.note || null,
        requestedAt: parsed?.requestedAt || item.createdAt,
        resolvedAt: item.resolvedAt || null,
        updatedAt: item.updatedAt,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const requestWithdrawal = async ({ userId, amount, note }) => {
  const safeAmount = toNumber(amount);
  const config = await getWithdrawalConfig(userId);

  if (!config.enabled) {
    throw new AppError(
      config.reason || 'Withdrawal is not available for this account.',
      403,
      config.reasonCode || 'WITHDRAWAL_NOT_ALLOWED',
    );
  }

  if (!config.hasPayoutMethod) {
    throw new AppError(
      'Payout method setup is required before requesting withdrawal.',
      400,
      'PAYOUT_METHOD_REQUIRED',
    );
  }

  if (safeAmount < MIN_WITHDRAWAL_AMOUNT) {
    throw new AppError(
      `Minimum withdrawal amount is INR ${MIN_WITHDRAWAL_AMOUNT}.`,
      400,
      'WITHDRAWAL_MINIMUM_NOT_MET',
      {
        minimumAmount: MIN_WITHDRAWAL_AMOUNT,
      },
    );
  }

  if (safeAmount > Number(config.currentBalance || 0)) {
    throw new AppError(
      'Insufficient wallet balance for this withdrawal request.',
      400,
      'WITHDRAWAL_INSUFFICIENT_BALANCE',
      {
        currentBalance: Number(config.currentBalance || 0),
      },
    );
  }

  if (config.pendingRequest?.id) {
    throw new AppError(
      'A withdrawal request is already pending review.',
      409,
      'WITHDRAWAL_ALREADY_PENDING',
      {
        requestId: config.pendingRequest.id,
      },
    );
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      subject: `${WITHDRAWAL_SUBJECT_PREFIX} - INR ${safeAmount}`,
      message: buildWithdrawalMessage({
        amount: safeAmount,
        currentBalance: config.currentBalance,
        minimumAmount: MIN_WITHDRAWAL_AMOUNT,
        note,
      }),
      status: 'OPEN',
      priority: 'HIGH',
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  return {
    requestId: ticket.id,
    amount: safeAmount,
    status: ticket.status,
    createdAt: ticket.createdAt,
    minimumAmount: MIN_WITHDRAWAL_AMOUNT,
    currentBalance: Number(config.currentBalance || 0),
    message: 'Withdrawal request submitted successfully.',
  };
};

const getWalletHistory = async (userId, params) => {
  return walletLedgerService.getWalletHistory(userId, params);
};

const createOrder = async ({ userId, planId, amount, couponCode, paymentMethod, metadata }) => {
  let selectedAmount = amount;
  let selectedPlan = null;

  if (planId) {
    selectedPlan = await prisma.rechargePlan.findUnique({ where: { id: planId } });
    if (!selectedPlan || selectedPlan.status !== 'ACTIVE') {
      throw new AppError('Invalid recharge plan', 400, 'INVALID_RECHARGE_PLAN');
    }
    selectedAmount = toNumber(selectedPlan.amount);
  }

  if (!selectedAmount || selectedAmount <= 0) {
    throw new AppError('Recharge amount is required', 400, 'INVALID_RECHARGE_AMOUNT');
  }

  const couponResult = await evaluateCoupon({
    couponCode,
    amount: selectedAmount,
  });

  const provider = getPaymentProvider();

  const order = await prisma.paymentOrder.create({
    data: {
      userId,
      provider: provider.name.toUpperCase(),
      amount: selectedAmount,
      couponCode: couponResult.valid ? couponCode?.trim().toUpperCase() : null,
      discountAmount: couponResult.discountAmount,
      payableAmount: couponResult.payableAmount,
      currency: 'INR',
      status: 'PENDING',
      metadata: {
        paymentMethod,
        selectedPlanId: planId || null,
        ...metadata,
      },
    },
  });

  const providerOrder = await provider.createOrder({
    orderId: order.id,
    payableAmount: couponResult.payableAmount,
    amount: selectedAmount,
    userId,
  });

  const updatedOrder = await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      gatewayOrderId: providerOrder.gatewayOrderId,
      metadata: {
        ...order.metadata,
        providerOrderMetadata: providerOrder.metadata,
      },
    },
  });

  return {
    orderId: updatedOrder.id,
    gatewayOrderId: updatedOrder.gatewayOrderId,
    provider: updatedOrder.provider,
    amount: toNumber(updatedOrder.amount),
    discountAmount: toNumber(updatedOrder.discountAmount),
    payableAmount: toNumber(updatedOrder.payableAmount),
    coupon: couponResult.valid
      ? {
          code: couponResult.coupon.code,
          description: couponResult.coupon.description,
        }
      : null,
  };
};

const verifyPayment = async ({
  userId,
  orderId,
  gatewayPaymentId,
  gatewaySignature,
  method,
  metadata,
}) => {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });

  if (!order || order.userId !== userId) {
    throw new AppError('Payment order not found', 404, 'PAYMENT_ORDER_NOT_FOUND');
  }

  if (order.status === 'SUCCESS' && order.walletTransactionId) {
    const walletSummary = await getWalletSummary(userId);
    return {
      verified: true,
      orderId: order.id,
      walletSummary,
    };
  }

  const provider = getPaymentProvider();

  const verificationResult = await provider.verifyPayment({
    order,
    gatewayPaymentId,
    gatewaySignature,
  });

  await prisma.paymentTransaction.create({
    data: {
      paymentOrderId: order.id,
      userId,
      provider: order.provider,
      gatewayPaymentId,
      gatewaySignature,
      status: verificationResult.isVerified ? 'SUCCESS' : 'FAILED',
      amount: order.payableAmount,
      method,
      metadata,
    },
  });

  if (!verificationResult.isVerified) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: 'FAILED',
      },
    });

    throw new AppError('Payment verification failed', 400, 'PAYMENT_VERIFICATION_FAILED');
  }

  const result = await prisma.$transaction(async (tx) => {
    const latestOrder = await tx.paymentOrder.findUnique({ where: { id: order.id } });

    if (latestOrder.status === 'SUCCESS' && latestOrder.walletTransactionId) {
      return {
        walletTransactionId: latestOrder.walletTransactionId,
      };
    }

    const walletTransaction = await walletLedgerService.creditWallet({
      userId,
      amount: toNumber(order.payableAmount),
      type: 'RECHARGE',
      relatedPaymentId: order.id,
      description: `Wallet recharge via ${order.provider}`,
      metadata: {
        gatewayPaymentId,
        method,
      },
      idempotencyKey: `payment:order:${order.id}`,
      tx,
    });

    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: 'SUCCESS',
        verifiedAt: new Date(),
        walletTransactionId: walletTransaction.id,
      },
    });

    return {
      walletTransactionId: walletTransaction.id,
      walletTransaction,
    };
  });

  await referralService.processReferralQualification({
    referredUserId: userId,
    qualifyingTransactionId: result.walletTransactionId,
    amount: toNumber(order.payableAmount),
  });

  const walletSummary = await getWalletSummary(userId);

  const io = getSocketServer();
  if (io) {
    io.to(`user:${userId}`).emit('wallet_updated', {
      userId,
      balance: walletSummary.balance,
      source: 'recharge',
      paymentOrderId: order.id,
    });
  }

  return {
    verified: true,
    orderId: order.id,
    walletSummary,
  };
};

module.exports = {
  getWalletSummary,
  getWalletPlans,
  getWalletHistory,
  getWithdrawalConfig,
  getWithdrawalHistory,
  requestWithdrawal,
  createOrder,
  verifyPayment,
  evaluateCoupon,
};
