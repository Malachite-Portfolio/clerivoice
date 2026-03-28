const dayjs = require('dayjs');
const { prisma } = require('../config/prisma');
const walletService = require('../services/wallet.service');
const { getBillingRules } = require('../services/sessionGuard.service');
const { logger } = require('../config/logger');
const callService = require('../modules/call/call.service');
const chatService = require('../modules/chat/chat.service');

const BILLING_INTERVAL_MS = 60 * 1000;

class SessionBillingManager {
  constructor(io) {
    this.io = io;
    this.chatTimers = new Map();
    this.callTimers = new Map();
  }

  startChatBilling(sessionId) {
    const key = String(sessionId);

    if (this.chatTimers.has(key)) {
      return;
    }

    const timer = setInterval(() => {
      this.processChatTick(key).catch((error) => {
        logger.error('Chat billing tick failed', { sessionId: key, error: error.message });
      });
    }, BILLING_INTERVAL_MS);

    this.chatTimers.set(key, timer);
  }

  stopChatBilling(sessionId) {
    const key = String(sessionId);
    const timer = this.chatTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.chatTimers.delete(key);
    }
  }

  startCallBilling(sessionId) {
    const key = String(sessionId);

    if (this.callTimers.has(key)) {
      return;
    }

    const timer = setInterval(() => {
      this.processCallTick(key).catch((error) => {
        logger.error('Call billing tick failed', { sessionId: key, error: error.message });
      });
    }, BILLING_INTERVAL_MS);

    this.callTimers.set(key, timer);
  }

  stopCallBilling(sessionId) {
    const key = String(sessionId);
    const timer = this.callTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.callTimers.delete(key);
    }
  }

  async assertListenerEligible(listenerId) {
    const profile = await prisma.listenerProfile.findUnique({
      where: { userId: listenerId },
      include: { user: true },
    });

    if (!profile || !profile.user) {
      return {
        isEligible: false,
        reasonCode: 'HOST_NOT_FOUND',
      };
    }

    if (profile.user.deletedAt || profile.user.status !== 'ACTIVE') {
      return {
        isEligible: false,
        reasonCode: 'HOST_ACCOUNT_INACTIVE',
      };
    }

    if (!profile.isEnabled) {
      return {
        isEligible: false,
        reasonCode: 'HOST_DISABLED',
      };
    }

    return {
      isEligible: true,
      reasonCode: null,
    };
  }

  async processChatTick(sessionId) {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        user: { include: { wallet: true } },
      },
    });

    if (!session || session.status !== 'ACTIVE') {
      this.stopChatBilling(sessionId);
      return;
    }

    const listenerEligibility = await this.assertListenerEligible(session.listenerId);
    if (!listenerEligibility.isEligible) {
      await chatService.forceEndChatBySystem({
        sessionId: session.id,
        endReason: 'CANCELLED',
        reasonCode: listenerEligibility.reasonCode,
        restoreListenerAvailability: false,
      });
      this.stopChatBilling(session.id);
      return;
    }

    const amount = walletService.toNumber(session.ratePerMinute);
    const billingIndex = session.billedMinutes + 1;

    try {
      const debitTx = await walletService.debitWallet({
        userId: session.userId,
        amount,
        type: 'CHAT_DEBIT',
        relatedSessionId: session.id,
        description: `Chat billing minute ${billingIndex}`,
        metadata: {
          sessionType: 'chat',
          billedMinute: billingIndex,
        },
        idempotencyKey: `chat:${session.id}:${billingIndex}`,
      });

      const updated = await prisma.chatSession.update({
        where: { id: session.id },
        data: {
          billedMinutes: { increment: 1 },
          totalAmount: { increment: amount },
        },
      });

      this.io.to(`user:${session.userId}`).emit('wallet_updated', {
        userId: session.userId,
        balance: walletService.toNumber(debitTx.balanceAfter),
        sessionId: session.id,
        sessionType: 'chat',
      });

      const rules = await getBillingRules();
      const remainingMinutes = walletService.estimateTalkTime(
        walletService.toNumber(debitTx.balanceAfter),
        amount
      );

      if (remainingMinutes <= Number(rules.lowBalanceMinutesThreshold)) {
        this.io.to(`user:${session.userId}`).emit('chat_low_balance_warning', {
          sessionId: session.id,
          remainingMinutes,
          message: 'Low balance. Please recharge soon to continue chat.',
        });
      }

      if (updated.status !== 'ACTIVE') {
        this.stopChatBilling(session.id);
      }
    } catch (error) {
      if (error.code === 'INSUFFICIENT_BALANCE') {
        await chatService.emitLowBalanceEnded(session.id);
        this.io.to(`user:${session.userId}`).emit('chat_low_balance_warning', {
          sessionId: session.id,
          message: 'You do not have sufficient balance. Please recharge your wallet to continue.',
        });
        this.stopChatBilling(session.id);
        return;
      }

      throw error;
    }
  }

  async processCallTick(sessionId) {
    const session = await prisma.callSession.findUnique({
      where: { id: sessionId },
      include: {
        user: { include: { wallet: true } },
      },
    });

    if (!session || session.status !== 'ACTIVE') {
      this.stopCallBilling(sessionId);
      return;
    }

    const listenerEligibility = await this.assertListenerEligible(session.listenerId);
    if (!listenerEligibility.isEligible) {
      await callService.forceEndCallBySystem({
        sessionId: session.id,
        endReason: 'CANCELLED',
        reasonCode: listenerEligibility.reasonCode,
        restoreListenerAvailability: false,
      });
      this.stopCallBilling(session.id);
      return;
    }

    const amount = walletService.toNumber(session.ratePerMinute);
    const billingIndex = session.billedMinutes + 1;

    try {
      const debitTx = await walletService.debitWallet({
        userId: session.userId,
        amount,
        type: 'CALL_DEBIT',
        relatedSessionId: session.id,
        description: `Call billing minute ${billingIndex}`,
        metadata: {
          sessionType: 'call',
          billedMinute: billingIndex,
        },
        idempotencyKey: `call:${session.id}:${billingIndex}`,
      });

      const now = dayjs();
      const answeredAt = session.answeredAt ? dayjs(session.answeredAt) : dayjs(session.startedAt || now);
      const durationSeconds = Math.max(0, now.diff(answeredAt, 'second'));

      await prisma.callSession.update({
        where: { id: session.id },
        data: {
          billedMinutes: { increment: 1 },
          totalAmount: { increment: amount },
          durationSeconds,
        },
      });

      this.io.to(`user:${session.userId}`).emit('wallet_updated', {
        userId: session.userId,
        balance: walletService.toNumber(debitTx.balanceAfter),
        sessionId: session.id,
        sessionType: 'call',
      });

      const rules = await getBillingRules();
      const remainingMinutes = walletService.estimateTalkTime(
        walletService.toNumber(debitTx.balanceAfter),
        amount
      );

      if (remainingMinutes <= Number(rules.lowBalanceMinutesThreshold)) {
        this.io.to(`user:${session.userId}`).emit('call_low_balance_warning', {
          sessionId: session.id,
          remainingMinutes,
          message: 'Low balance. Please recharge soon to continue call.',
        });
      }
    } catch (error) {
      if (error.code === 'INSUFFICIENT_BALANCE') {
        await callService.emitLowBalanceEnded(session.id);
        this.io.to(`user:${session.userId}`).emit('call_low_balance_warning', {
          sessionId: session.id,
          message: 'You do not have sufficient balance. Please recharge your wallet to continue.',
        });
        this.stopCallBilling(session.id);
        return;
      }

      throw error;
    }
  }

  stopAll() {
    for (const timer of this.chatTimers.values()) {
      clearInterval(timer);
    }
    this.chatTimers.clear();

    for (const timer of this.callTimers.values()) {
      clearInterval(timer);
    }
    this.callTimers.clear();
  }
}

module.exports = { SessionBillingManager };
