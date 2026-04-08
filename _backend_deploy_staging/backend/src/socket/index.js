const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/tokens');
const { logger } = require('../config/logger');
const { prisma } = require('../config/prisma');
const chatService = require('../modules/chat/chat.service');
const callService = require('../modules/call/call.service');
const { setSocketServer } = require('./socketStore');

const configuredListenerOfflineGraceMs = Number(process.env.LISTENER_OFFLINE_GRACE_MS || 90000);
const LISTENER_OFFLINE_GRACE_MS = Number.isFinite(configuredListenerOfflineGraceMs)
  ? Math.max(15000, configuredListenerOfflineGraceMs)
  : 90000;
const pendingListenerOfflineTimers = new Map();

const initSocket = ({ httpServer, billingManager, clientOrigin }) => {
  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      credentials: true,
    },
  });

  chatService.setRealtimeDependencies({
    socketServer: io,
    sessionBillingManager: billingManager,
  });

  callService.setRealtimeDependencies({
    socketServer: io,
    sessionBillingManager: billingManager,
  });

  setSocketServer(io);

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('UNAUTHORIZED'));
      }

      const payload = verifyAccessToken(token);
      socket.user = {
        id: payload.sub,
        role: payload.role,
      };

      return next();
    } catch (error) {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user;

    const clearPendingListenerOffline = (listenerId, reason = 'unknown') => {
      const key = String(listenerId || '');
      if (!key) {
        return;
      }

      const timeout = pendingListenerOfflineTimers.get(key);
      if (timeout) {
        clearTimeout(timeout);
        pendingListenerOfflineTimers.delete(key);
        logger.info('[Presence] cleared pending listener offline timeout', {
          listenerId: key,
          reason,
        });
      }
    };

    const publishListenerStatus = async ({
      listenerId,
      status,
      reason = 'unknown',
    }) => {
      const normalizedStatus = String(status || '').trim().toUpperCase();
      await prisma.listenerProfile.updateMany({
        where: { userId: listenerId },
        data: { availability: normalizedStatus },
      });

      const listenerProfile = await prisma.listenerProfile.findUnique({
        where: { userId: listenerId },
        select: { isEnabled: true },
      });

      const payload = {
        listenerId,
        status: normalizedStatus,
        availability: normalizedStatus,
        isEnabled: listenerProfile?.isEnabled ?? true,
        syncVersion: Date.now(),
      };

      io.emit('listener_status_changed', payload);
      io.emit('host_status_changed', payload);

      if (normalizedStatus === 'ONLINE') {
        io.emit('listener_online', payload);
      } else if (normalizedStatus === 'BUSY') {
        io.emit('listener_busy', payload);
      } else {
        io.emit('listener_offline', payload);
      }

      logger.info('[Presence] listener status updated', {
        listenerId,
        status: normalizedStatus,
        reason,
      });
    };

    const scheduleListenerOfflineTransition = (listenerId, reason = 'lifecycle') => {
      const key = String(listenerId || '');
      if (!key) {
        return;
      }

      clearPendingListenerOffline(key, 'reschedule');

      const timeout = setTimeout(async () => {
        pendingListenerOfflineTimers.delete(key);

        try {
          const activeSocketCount = io.sockets.adapter.rooms.get(`user:${key}`)?.size || 0;
          if (activeSocketCount > 0) {
            logger.info('[Presence] listener offline skipped because socket is connected', {
              listenerId: key,
              activeSocketCount,
              reason,
            });
            return;
          }

          const [activeCallCount, activeChatCount] = await Promise.all([
            prisma.callSession.count({
              where: {
                listenerId: key,
                status: {
                  in: ['REQUESTED', 'RINGING', 'ACTIVE'],
                },
              },
            }),
            prisma.chatSession.count({
              where: {
                listenerId: key,
                status: 'ACTIVE',
              },
            }),
          ]);

          if (activeCallCount > 0 || activeChatCount > 0) {
            await publishListenerStatus({
              listenerId: key,
              status: 'BUSY',
              reason: 'OFFLINE_GRACE_SKIPPED_ACTIVE_SESSION',
            });
            return;
          }

          await publishListenerStatus({
            listenerId: key,
            status: 'OFFLINE',
            reason: 'OFFLINE_GRACE_EXPIRED',
          });
        } catch (error) {
          logger.warn('[Presence] listener offline transition failed', {
            listenerId: key,
            reason,
            message: error?.message || 'Unknown error',
          });
        }
      }, LISTENER_OFFLINE_GRACE_MS);

      pendingListenerOfflineTimers.set(key, timeout);
      logger.info('[Presence] listener offline transition scheduled', {
        listenerId: key,
        reason,
        graceMs: LISTENER_OFFLINE_GRACE_MS,
      });
    };

    socket.join(`user:${userId}`);
    socket.emit('connected', { userId, role });

    if (role === 'LISTENER') {
      clearPendingListenerOffline(userId, 'socket_connected');
      prisma.listenerProfile
        .findUnique({
          where: { userId },
          select: { availability: true, isEnabled: true },
        })
        .then((profile) => {
          const status = String(profile?.availability || 'OFFLINE').trim().toUpperCase();
          const payload = {
            listenerId: userId,
            status,
            availability: status,
            isEnabled: profile?.isEnabled ?? true,
            syncVersion: Date.now(),
          };

          io.emit('listener_status_changed', payload);
          io.emit('host_status_changed', payload);
          if (status === 'ONLINE') {
            io.emit('listener_online', payload);
          } else if (status === 'BUSY') {
            io.emit('listener_busy', payload);
          } else {
            io.emit('listener_offline', payload);
          }
          logger.info('[Presence] listener socket connected with persisted availability', {
            listenerId: userId,
            status,
          });
        })
        .catch((error) =>
          logger.warn('Failed to read listener availability on connect', error.message),
        );
    }

    io.emit('user_online', { userId, role });

    socket.on('listener_online', async (payload = {}) => {
      if (role !== 'LISTENER') return;
      clearPendingListenerOffline(userId, 'listener_online_event');
      await publishListenerStatus({
        listenerId: userId,
        status: 'ONLINE',
        reason: String(payload?.reason || 'LISTENER_ONLINE_EVENT').trim().toUpperCase(),
      });
    });

    socket.on('listener_offline', async (payload = {}) => {
      if (role !== 'LISTENER') return;
      const reason = String(payload?.reason || '')
        .trim()
        .toUpperCase();
      const explicitOfflineReason = ['MANUAL_TOGGLE', 'LOGOUT', 'USER_ACTION'].includes(reason);

      if (explicitOfflineReason) {
        clearPendingListenerOffline(userId, 'explicit_offline_event');
        await publishListenerStatus({
          listenerId: userId,
          status: 'OFFLINE',
          reason: reason || 'EXPLICIT_OFFLINE_EVENT',
        });
        return;
      }

      scheduleListenerOfflineTransition(userId, reason || 'LIFECYCLE_OFFLINE_EVENT');
    });

    socket.on('listener_busy', async (payload = {}) => {
      if (role !== 'LISTENER') return;
      clearPendingListenerOffline(userId, 'listener_busy_event');
      await publishListenerStatus({
        listenerId: userId,
        status: 'BUSY',
        reason: String(payload?.reason || 'LISTENER_BUSY_EVENT').trim().toUpperCase(),
      });
    });

    socket.on('join_chat_session', ({ sessionId }) => {
      if (!sessionId) return;
      socket.join(`session:chat:${sessionId}`);
    });

    socket.on('join_call_session', ({ sessionId }) => {
      if (!sessionId) return;
      socket.join(`session:call:${sessionId}`);
    });

    socket.on('chat_request', async ({ listenerId }, callback) => {
      try {
        const data = await chatService.requestChat({
          userId,
          listenerId,
        });

        socket.join(`session:chat:${data.session.id}`);

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('chat_message', async ({ sessionId, receiverId, content, messageType }, callback) => {
      try {
        const data = await chatService.sendMessage({
          sessionId,
          senderId: userId,
          receiverId,
          content,
          messageType,
        });

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('chat_typing', ({ sessionId, isTyping }) => {
      if (!sessionId) {
        return;
      }

      socket.to(`session:chat:${sessionId}`).emit('chat_typing', {
        sessionId,
        senderId: userId,
        isTyping: Boolean(isTyping),
      });
    });

    socket.on('chat_read', async ({ sessionId, messageIds }, callback) => {
      try {
        const data = await chatService.markRead({
          sessionId,
          readerId: userId,
          messageIds,
        });

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('chat_ended', async ({ sessionId, endReason }, callback) => {
      try {
        const data = await chatService.endChat({
          actorId: userId,
          sessionId,
          endReason,
        });

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('call_request', async ({ listenerId, callType }, callback) => {
      try {
        const data = await callService.requestCall({
          userId,
          listenerId,
          callType,
        });

        socket.join(`session:call:${data.session.id}`);

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('call_accepted', async ({ sessionId }, callback) => {
      try {
        const data = await callService.acceptCall({
          listenerId: userId,
          sessionId,
        });

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('call_rejected', async ({ sessionId, reason }, callback) => {
      try {
        const data = await callService.rejectCall({
          listenerId: userId,
          sessionId,
          reason,
        });

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('call_signal', async ({ sessionId, signal }, callback) => {
      try {
        await callService.storeSignal({
          sessionId,
          senderId: userId,
          signal,
        });

        callback?.({ success: true });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('call_media_joined', async ({ sessionId }, callback) => {
      try {
        const data = await callService.markCallParticipantJoined({
          actorId: userId,
          sessionId,
        });

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('call_ended', async ({ sessionId, endReason }, callback) => {
      try {
        const data = await callService.endCall({
          actorId: userId,
          sessionId,
          endReason,
        });

        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, code: error.code, message: error.message, data: error.data || null });
      }
    });

    socket.on('disconnect', async () => {
      if (role === 'LISTENER') {
        logger.info('[Presence] listener disconnected, preserving manual availability', {
          listenerId: userId,
        });
        scheduleListenerOfflineTransition(userId, 'SOCKET_DISCONNECT');
      }

      io.emit('user_offline', { userId, role });
    });
  });

  return io;
};

module.exports = { initSocket };
