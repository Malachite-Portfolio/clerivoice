const { prisma } = require('../../config/prisma');
const walletLedgerService = require('../../services/wallet.service');
const { getPaymentProvider } = require('../../services/payment/paymentProviderFactory');
const referralService = require('../referral/referral.service');
const { AppError } = require('../../utils/appError');
const { getSocketServer } = require('../../socket/socketStore');
const withdrawalService = require('../withdrawal/withdrawal.service');

const toNumber = (value) => Number(value || 0);

const assertPaymentProviderConfigured = (provider) => {
  if (provider?.isNoop) {
    throw new AppError(
      'Payment provider not configured',
      503,
      'PAYMENT_PROVIDER_NOT_CONFIGURED'
    );
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
  return withdrawalService.getListenerWithdrawalConfig(userId);
};

const getWithdrawalHistory = async (userId, params = {}) => {
  return withdrawalService.listListenerWithdrawals(userId, params);
};

const getWithdrawalById = async ({ userId, withdrawalId }) => {
  return withdrawalService.getListenerWithdrawalById({ userId, withdrawalId });
};

const requestWithdrawal = async ({
  userId,
  amount,
  bankName,
  accountHolderName,
  accountNumber,
  accountNumberLast4,
  ifscCode,
  note,
}) => {
  return withdrawalService.createListenerWithdrawalRequest({
    userId,
    amount,
    bankName,
    accountHolderName,
    accountNumber,
    accountNumberLast4,
    ifscCode,
    note,
  });
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
  assertPaymentProviderConfigured(provider);

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
  assertPaymentProviderConfigured(provider);

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
  getWithdrawalById,
  requestWithdrawal,
  createOrder,
  verifyPayment,
  evaluateCoupon,
};
