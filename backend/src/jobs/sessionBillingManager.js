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

  startChatBilling(sessionId, { runImmediately = false } = {}) {
    const key = String(sessionId);

    if (this.chatTimers.has(key)) {
      logger.info('Chat billing already running', { sessionId: key });
      return;
    }

    logger.info('Starting chat billing', { sessionId: key, runImmediately });
    const timer = setInterval(() => {
      this.processChatTick(key).catch((error) => {
        logger.error('Chat billing tick failed', { sessionId: key, error: error.message });
      });
    }, BILLING_INTERVAL_MS);

    this.chatTimers.set(key, timer);

    if (runImmediately) {
      this.processChatTick(key).catch((error) => {
        logger.error('Immediate chat billing tick failed', { sessionId: key, error: error.message });
      });
    }
  }

  stopChatBilling(sessionId) {
    const key = String(sessionId);
    const timer = this.chatTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.chatTimers.delete(key);
      logger.info('Stopped chat billing', { sessionId: key });
    }
  }

  startCallBilling(sessionId, { runImmediately = false } = {}) {
    const key = String(sessionId);

    if (this.callTimers.has(key)) {
      logger.info('Call billing already running', { sessionId: key });
      return;
    }

    logger.info('Starting call billing', { sessionId: key, runImmediately });
    const timer = setInterval(() => {
      this.processCallTick(key).catch((error) => {
        logger.error('Call billing tick failed', { sessionId: key, error: error.message });
      });
    }, BILLING_INTERVAL_MS);

    this.callTimers.set(key, timer);

    if (runImmediately) {
      this.processCallTick(key).catch((error) => {
        logger.error('Immediate call billing tick failed', { sessionId: key, error: error.message });
      });
    }
  }

  stopCallBilling(sessionId) {
    const key = String(sessionId);
    const timer = this.callTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.callTimers.delete(key);
      logger.info('Stopped call billing', { sessionId: key });
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
    logger.info('Processing chat billing tick', {
      sessionId: session.id,
      billingIndex,
      amount,
      userId: session.userId,
      listenerId: session.listenerId,
    });

    try {
      const billingResult = await prisma.$transaction(
        async (tx) => {
          const debitTx = await walletService.debitWallet({
            userId: session.userId,
            amount,
            type: 'CHAT_DEBIT',
            relatedSessionId: session.id,
            description: `Chat billing minute ${billingIndex}`,
            metadata: {
              sessionType: 'chat',
              billedMinute: billingIndex,
              source: 'SESSION_BILLING',
            },
            idempotencyKey: `chat:${session.id}:${billingIndex}`,
            tx,
          });

          const creditTx = await walletService.creditWallet({
            userId: session.listenerId,
            amount,
            type: 'ADMIN_CREDIT',
            relatedSessionId: session.id,
            description: `Session earning from chat minute ${billingIndex}`,
            metadata: {
              source: 'SESSION_EARNING',
              sessionType: 'chat',
              billedMinute: billingIndex,
              counterpartUserId: session.userId,
            },
            idempotencyKey: `listener-chat:${session.id}:${billingIndex}`,
            tx,
          });

          const updated = await tx.chatSession.update({
            where: { id: session.id },
            data: {
              billedMinutes: { increment: 1 },
              totalAmount: { increment: amount },
            },
          });

          return {
            updated,
            debitTx,
            creditTx,
          };
        },
        {
          maxWait: 20000,
          timeout: 20000,
        }
      );

      logger.info('User wallet debited for chat session', {
        sessionId: session.id,
        billingIndex,
        balanceAfter: walletService.toNumber(billingResult.debitTx.balanceAfter),
      });
      logger.info('Listener earnings credited for chat session', {
        sessionId: session.id,
        billingIndex,
        balanceAfter: walletService.toNumber(billingResult.creditTx.balanceAfter),
      });

      this.io.to(`user:${session.userId}`).emit('wallet_updated', {
        userId: session.userId,
        balance: walletService.toNumber(billingResult.debitTx.balanceAfter),
        sessionId: session.id,
        sessionType: 'chat',
      });
      this.io.to(`user:${session.listenerId}`).emit('wallet_updated', {
        userId: session.listenerId,
        balance: walletService.toNumber(billingResult.creditTx.balanceAfter),
        sessionId: session.id,
        sessionType: 'chat',
        source: 'listener_earning',
      });

      const rules = await getBillingRules();
      const remainingMinutes = walletService.estimateTalkTime(
        walletService.toNumber(billingResult.debitTx.balanceAfter),
        amount
      );

      if (remainingMinutes <= Number(rules.lowBalanceMinutesThreshold)) {
        this.io.to(`user:${session.userId}`).emit('chat_low_balance_warning', {
          sessionId: session.id,
          remainingMinutes,
          message: 'Low balance. Please recharge soon to continue chat.',
        });
      }

      if (billingResult.updated.status !== 'ACTIVE') {
        this.stopChatBilling(session.id);
      }
    } catch (error) {
      if (error.code === 'INSUFFICIENT_BALANCE') {
        logger.warn('Stopping chat billing because user balance is insufficient', {
          sessionId: session.id,
          userId: session.userId,
        });
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
    logger.info('Processing call billing tick', {
      sessionId: session.id,
      billingIndex,
      amount,
      userId: session.userId,
      listenerId: session.listenerId,
    });

    try {
      const billingResult = await prisma.$transaction(
        async (tx) => {
          const debitTx = await walletService.debitWallet({
            userId: session.userId,
            amount,
            type: 'CALL_DEBIT',
            relatedSessionId: session.id,
            description: `Call billing minute ${billingIndex}`,
            metadata: {
              sessionType: 'call',
              billedMinute: billingIndex,
              source: 'SESSION_BILLING',
            },
            idempotencyKey: `call:${session.id}:${billingIndex}`,
            tx,
          });

          const creditTx = await walletService.creditWallet({
            userId: session.listenerId,
            amount,
            type: 'ADMIN_CREDIT',
            relatedSessionId: session.id,
            description: `Session earning from call minute ${billingIndex}`,
            metadata: {
              source: 'SESSION_EARNING',
              sessionType: 'call',
              billedMinute: billingIndex,
              counterpartUserId: session.userId,
            },
            idempotencyKey: `listener-call:${session.id}:${billingIndex}`,
            tx,
          });

          const now = dayjs();
          const answeredAt = session.answeredAt
            ? dayjs(session.answeredAt)
            : dayjs(session.startedAt || now);
          const durationSeconds = Math.max(0, now.diff(answeredAt, 'second'));

          const updated = await tx.callSession.update({
            where: { id: session.id },
            data: {
              billedMinutes: { increment: 1 },
              totalAmount: { increment: amount },
              durationSeconds,
            },
          });

          return {
            updated,
            debitTx,
            creditTx,
            durationSeconds,
          };
        },
        {
          maxWait: 20000,
          timeout: 20000,
        }
      );

      logger.info('User wallet debited for call session', {
        sessionId: session.id,
        billingIndex,
        balanceAfter: walletService.toNumber(billingResult.debitTx.balanceAfter),
      });
      logger.info('Listener earnings credited for call session', {
        sessionId: session.id,
        billingIndex,
        balanceAfter: walletService.toNumber(billingResult.creditTx.balanceAfter),
      });

      this.io.to(`user:${session.userId}`).emit('wallet_updated', {
        userId: session.userId,
        balance: walletService.toNumber(billingResult.debitTx.balanceAfter),
        sessionId: session.id,
        sessionType: 'call',
      });
      this.io.to(`user:${session.listenerId}`).emit('wallet_updated', {
        userId: session.listenerId,
        balance: walletService.toNumber(billingResult.creditTx.balanceAfter),
        sessionId: session.id,
        sessionType: 'call',
        source: 'listener_earning',
      });

      const rules = await getBillingRules();
      const remainingMinutes = walletService.estimateTalkTime(
        walletService.toNumber(billingResult.debitTx.balanceAfter),
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
        logger.warn('Stopping call billing because user balance is insufficient', {
          sessionId: session.id,
          userId: session.userId,
        });
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
