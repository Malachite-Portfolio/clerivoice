const { prisma } = require('../../config/prisma');
const { env } = require('../../config/env');
const walletService = require('../../services/wallet.service');
const referralService = require('../referral/referral.service');

const getSidebarData = async (userId) => {
  const [user, walletSummary, referralInfo, openTickets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        phone: true,
        profileImageUrl: true,
      },
    }),
    walletService.getWalletSummary(userId),
    referralService.getMyReferralInfo(userId),
    prisma.supportTicket.count({
      where: {
        userId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
    }),
  ]);

  return {
    profile: user,
    walletSummary: {
      balance: walletSummary.balance,
      currency: walletSummary.currency,
    },
    menuBadges: {
      referralPending: referralInfo.referrals.filter((item) => item.status !== 'REWARDED').length,
      openSupportTickets: openTickets,
    },
    appVersion: env.APP_VERSION,
    supportLinks: {
      faq: '/api/v1/referral/faq',
      supportTicket: '/api/v1/support/ticket',
    },
  };
};

module.exports = {
  getSidebarData,
};
