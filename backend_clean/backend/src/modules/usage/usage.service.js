const { prisma } = require('../../config/prisma');
const walletService = require('../../services/wallet.service');

const toNumber = (value) => Number(value || 0);

const getUsageSummary = async (userId) => {
  const [callAgg, chatAgg, spentAgg, rechargeAgg, referralAgg, callSessions, chatSessions, wallet] =
    await Promise.all([
      prisma.callSession.aggregate({
        where: {
          userId,
          status: { in: ['ENDED', 'ACTIVE'] },
        },
        _sum: { billedMinutes: true },
      }),
      prisma.chatSession.aggregate({
        where: {
          userId,
          status: { in: ['ENDED', 'ACTIVE'] },
        },
        _sum: { billedMinutes: true },
      }),
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
      prisma.callSession.count({
        where: {
          userId,
          status: 'ENDED',
        },
      }),
      prisma.chatSession.count({
        where: {
          userId,
          status: 'ENDED',
        },
      }),
      walletService.getWalletByUserId(userId),
    ]);

  return {
    totalCallMinutes: callAgg._sum.billedMinutes || 0,
    totalChatMinutes: chatAgg._sum.billedMinutes || 0,
    totalSpent: toNumber(spentAgg._sum.amount),
    totalRecharged: toNumber(rechargeAgg._sum.amount),
    currentBalance: toNumber(wallet.balance),
    referralEarned: toNumber(referralAgg._sum.amount),
    sessionsCompleted: callSessions + chatSessions,
  };
};

module.exports = {
  getUsageSummary,
};
