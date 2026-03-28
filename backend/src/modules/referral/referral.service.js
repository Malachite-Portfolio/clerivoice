const { Prisma } = require('@prisma/client');
const { prisma } = require('../../config/prisma');
const { AppError } = require('../../utils/appError');
const { buildReferralCode } = require('../../utils/referralCode');
const walletService = require('../../services/wallet.service');

const DEFAULT_REFERRAL_RULE = {
  name: 'default_referral_rule',
  inviterReward: 55,
  referredReward: 50,
  qualifyingAmount: 500,
};

const toNumber = (value) => Number(value || 0);

const getActiveRule = async () => {
  const activeRule = await prisma.referralRewardRule.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (activeRule) {
    return activeRule;
  }

  return prisma.referralRewardRule.create({
    data: {
      name: DEFAULT_REFERRAL_RULE.name,
      inviterReward: DEFAULT_REFERRAL_RULE.inviterReward,
      referredReward: DEFAULT_REFERRAL_RULE.referredReward,
      qualifyingAmount: DEFAULT_REFERRAL_RULE.qualifyingAmount,
      isActive: true,
    },
  });
};

const ensureReferralCode = async (userId, tx = prisma) => {
  const existing = await tx.referralCode.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  let code = buildReferralCode('CLAR');
  let unique = false;

  while (!unique) {
    const found = await tx.referralCode.findUnique({ where: { code } });
    if (!found) {
      unique = true;
    } else {
      code = buildReferralCode('CLAR');
    }
  }

  return tx.referralCode.create({
    data: {
      userId,
      code,
      isActive: true,
    },
  });
};

const applyReferralCode = async ({ referredUserId, referralCode }) => {
  const normalizedCode = referralCode.trim().toUpperCase();

  return prisma.$transaction(async (tx) => {
    const referredUser = await tx.user.findUnique({ where: { id: referredUserId } });
    if (!referredUser) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (referredUser.referredById || referredUser.referralApplied) {
      throw new AppError('Referral code already applied', 400, 'REFERRAL_ALREADY_APPLIED');
    }

    const codeRecord = await tx.referralCode.findUnique({
      where: { code: normalizedCode },
      include: { user: true },
    });

    if (!codeRecord || !codeRecord.isActive) {
      throw new AppError('Invalid referral code', 400, 'INVALID_REFERRAL_CODE');
    }

    if (codeRecord.userId === referredUserId) {
      throw new AppError('Self referral is not allowed', 400, 'SELF_REFERRAL_NOT_ALLOWED');
    }

    const existingReferral = await tx.referral.findUnique({
      where: { referredUserId },
    });

    if (existingReferral) {
      throw new AppError('Referral already linked for this user', 400, 'REFERRAL_ALREADY_EXISTS');
    }

    const rule = await getActiveRule();

    const referral = await tx.referral.create({
      data: {
        inviterUserId: codeRecord.userId,
        referredUserId,
        referralCode: normalizedCode,
        status: 'SIGNED_UP',
        inviterRewardAmount: rule.inviterReward,
        referredRewardAmount: rule.referredReward,
      },
    });

    await tx.user.update({
      where: { id: referredUserId },
      data: {
        referredById: codeRecord.userId,
        referralApplied: true,
      },
    });

    return referral;
  });
};

const processReferralQualification = async ({
  referredUserId,
  qualifyingTransactionId,
  amount,
  tx = null,
}) => {
  const prismaClient = tx || prisma;

  const execute = async (transactionClient) => {
    const referral = await transactionClient.referral.findUnique({
      where: { referredUserId },
    });

    if (!referral) {
      return { rewarded: false, reason: 'NO_REFERRAL' };
    }

    if (referral.status === 'REWARDED') {
      return { rewarded: false, reason: 'ALREADY_REWARDED' };
    }

    const rule = await getActiveRule();

    if (Number(amount) < Number(rule.qualifyingAmount)) {
      return {
        rewarded: false,
        reason: 'QUALIFYING_AMOUNT_NOT_MET',
        requiredAmount: toNumber(rule.qualifyingAmount),
      };
    }

    await transactionClient.referral.update({
      where: { id: referral.id },
      data: {
        status: 'QUALIFIED',
        qualifyingTransactionId,
      },
    });

    await walletService.creditWallet({
      userId: referral.inviterUserId,
      amount: toNumber(rule.inviterReward),
      type: 'REFERRAL_BONUS',
      description: `Referral reward for inviting user ${referredUserId}`,
      metadata: {
        referralId: referral.id,
        role: 'inviter',
      },
      idempotencyKey: `referral:inviter:${referral.id}`,
      tx: transactionClient,
    });

    await walletService.creditWallet({
      userId: referral.referredUserId,
      amount: toNumber(rule.referredReward),
      type: 'PROMO_CREDIT',
      description: `Referral bonus for joining with code ${referral.referralCode}`,
      metadata: {
        referralId: referral.id,
        role: 'referred',
      },
      idempotencyKey: `referral:referred:${referral.id}`,
      tx: transactionClient,
    });

    const updated = await transactionClient.referral.update({
      where: { id: referral.id },
      data: {
        status: 'REWARDED',
        rewardedAt: new Date(),
        inviterRewardAmount: new Prisma.Decimal(rule.inviterReward),
        referredRewardAmount: new Prisma.Decimal(rule.referredReward),
      },
    });

    return {
      rewarded: true,
      referral: updated,
    };
  };

  return tx ? execute(prismaClient) : prismaClient.$transaction(execute);
};

const getMyReferralInfo = async (userId) => {
  const [codeRecord, referrals, rule, totalEarnedAgg] = await Promise.all([
    ensureReferralCode(userId),
    prisma.referral.findMany({
      where: { inviterUserId: userId },
      include: {
        referred: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    getActiveRule(),
    prisma.walletTransaction.aggregate({
      where: {
        userId,
        type: { in: ['REFERRAL_BONUS'] },
        status: 'SUCCESS',
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    referralCode: codeRecord.code,
    totalEarned: toNumber(totalEarnedAgg._sum.amount),
    inviterReward: toNumber(rule.inviterReward),
    referredReward: toNumber(rule.referredReward),
    qualifyingAmount: toNumber(rule.qualifyingAmount),
    rewardDescription: `Invite friends and earn INR ${toNumber(rule.inviterReward)} after they complete a verified recharge of INR ${toNumber(rule.qualifyingAmount)} or more.`,
    friendRewardDescription: `Your friend gets INR ${toNumber(rule.referredReward)} bonus after qualifying recharge.`,
    sharePayload: {
      title: 'Join Clarivoice',
      message: `Use my referral code ${codeRecord.code} on Clarivoice and unlock rewards.`,
      referralCode: codeRecord.code,
    },
    referrals,
  };
};

const getReferralHistory = async (userId) => {
  const [inviterHistory, referredHistory] = await Promise.all([
    prisma.referral.findMany({
      where: { inviterUserId: userId },
      include: {
        referred: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.referral.findMany({
      where: { referredUserId: userId },
      include: {
        inviter: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    inviterHistory,
    referredHistory,
  };
};

const getReferralFaq = async () => {
  return [
    {
      question: 'When do I receive my reward?',
      answer:
        'Your reward is credited once your referred friend completes their first verified recharge of INR 500 or more.',
    },
    {
      question: 'Can I apply referral code multiple times?',
      answer: 'No, each user can apply only one referral code once.',
    },
    {
      question: 'Can I refer myself?',
      answer: 'No, self referral is blocked automatically.',
    },
  ];
};

module.exports = {
  getActiveRule,
  ensureReferralCode,
  applyReferralCode,
  processReferralQualification,
  getMyReferralInfo,
  getReferralHistory,
  getReferralFaq,
};
