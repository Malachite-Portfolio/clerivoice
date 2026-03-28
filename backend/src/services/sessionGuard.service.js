const { prisma } = require('../config/prisma');
const { env } = require('../config/env');
const { estimateTalkTime, toNumber } = require('./wallet.service');
const { AppError } = require('../utils/appError');
const { INSUFFICIENT_BALANCE } = require('../constants/errors');

const HOST_UNAVAILABLE_ERROR = {
  message: 'This host is currently unavailable.',
  code: 'HOST_UNAVAILABLE',
};

const DEFAULT_BILLING_RULES = {
  minChatStartBalance: env.MIN_CHAT_START_BALANCE,
  minCallStartBalance: env.MIN_CALL_START_BALANCE,
  lowBalanceMinutesThreshold: env.LOW_BALANCE_MINUTES_THRESHOLD,
};

const getBillingRules = async () => {
  const config = await prisma.appConfig.findUnique({
    where: { key: 'billing_rules' },
  });

  if (!config?.value) {
    return DEFAULT_BILLING_RULES;
  }

  return {
    ...DEFAULT_BILLING_RULES,
    ...config.value,
  };
};

const getListenerProfile = async (listenerId) => {
  const listener = await prisma.listenerProfile.findUnique({
    where: { userId: listenerId },
    include: { user: true },
  });

  if (!listener || !listener.user) {
    throw new AppError(HOST_UNAVAILABLE_ERROR.message, 404, HOST_UNAVAILABLE_ERROR.code, {
      listenerId,
      reason: 'NOT_FOUND',
    });
  }

  if (listener.user.deletedAt || listener.user.status !== 'ACTIVE') {
    throw new AppError(HOST_UNAVAILABLE_ERROR.message, 400, HOST_UNAVAILABLE_ERROR.code, {
      listenerId,
      reason: 'ACCOUNT_INACTIVE',
      userStatus: listener.user.status,
    });
  }

  if (!listener.isEnabled) {
    throw new AppError(HOST_UNAVAILABLE_ERROR.message, 400, HOST_UNAVAILABLE_ERROR.code, {
      listenerId,
      reason: 'HOST_DISABLED',
    });
  }

  if (typeof listener.isVisible === 'boolean' && listener.isVisible === false) {
    throw new AppError(HOST_UNAVAILABLE_ERROR.message, 400, HOST_UNAVAILABLE_ERROR.code, {
      listenerId,
      reason: 'HOST_HIDDEN',
    });
  }

  if (listener.availability !== 'ONLINE') {
    throw new AppError(HOST_UNAVAILABLE_ERROR.message, 400, HOST_UNAVAILABLE_ERROR.code, {
      listenerId,
      reason: 'HOST_OFFLINE',
      availability: listener.availability,
    });
  }

  return listener;
};

const checkCanStartSession = async ({ userId, listenerId, mode }) => {
  const rules = await getBillingRules();
  const listener = await getListenerProfile(listenerId);

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const currentBalance = toNumber(wallet?.balance || 0);

  const requiredMinimumBalance =
    mode === 'chat' ? Number(rules.minChatStartBalance) : Number(rules.minCallStartBalance);

  const listenerRate =
    mode === 'chat'
      ? toNumber(listener.chatRatePerMinute)
      : toNumber(listener.callRatePerMinute);

  const estimatedMinutesRemaining = estimateTalkTime(currentBalance, listenerRate);

  const basePayload = {
    current_balance: currentBalance,
    required_minimum_balance: requiredMinimumBalance,
    listener_rate: listenerRate,
    estimated_minutes_remaining: estimatedMinutesRemaining,
    action_required: currentBalance < requiredMinimumBalance ? 'RECHARGE' : 'NONE',
  };

  if (currentBalance < requiredMinimumBalance) {
    const suggestedPlans = await prisma.rechargePlan.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { amount: 'asc' },
      take: 3,
    });

    throw new AppError(
      INSUFFICIENT_BALANCE.message,
      400,
      INSUFFICIENT_BALANCE.code,
      {
        currentBalance,
        requiredBalance: requiredMinimumBalance,
        suggestedRechargePlans: suggestedPlans.map((plan) => toNumber(plan.amount)),
        ...basePayload,
      }
    );
  }

  return {
    ...basePayload,
    listener,
    rules,
  };
};

const canStartChat = ({ userId, listenerId }) =>
  checkCanStartSession({ userId, listenerId, mode: 'chat' });

const canStartCall = ({ userId, listenerId }) =>
  checkCanStartSession({ userId, listenerId, mode: 'call' });

module.exports = {
  getBillingRules,
  canStartChat,
  canStartCall,
};
