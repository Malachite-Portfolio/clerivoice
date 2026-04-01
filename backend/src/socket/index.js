const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/tokens');
const { logger } = require('../config/logger');
const { prisma } = require('../config/prisma');
const chatService = require('../modules/chat/chat.service');
const callService = require('../modules/call/call.service');
const { setSocketServer } = require('./socketStore');

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

    socket.join(`user:${userId}`);
    socket.emit('connected', { userId, role });

    if (role === 'LISTENER') {
      prisma.listenerProfile
        .updateMany({
          where: { userId },
          data: { availability: 'ONLINE' },
        })
        .catch((error) => logger.warn('Failed to mark listener online', error.message));

      io.emit('listener_online', {
        listenerId: userId,
        status: 'ONLINE',
        syncVersion: Date.now(),
      });
    }

    io.emit('user_online', { userId, role });

    socket.on('listener_online', async () => {
      if (role !== 'LISTENER') return;

      await prisma.listenerProfile.updateMany({
        where: { userId },
        data: { availability: 'ONLINE' },
      });

      const listenerProfile = await prisma.listenerProfile.findUnique({
        where: { userId },
        select: { isEnabled: true },
      });

      const payload = {
        listenerId: userId,
        status: 'ONLINE',
        isEnabled: listenerProfile?.isEnabled ?? true,
        syncVersion: Date.now(),
      };

      io.emit('listener_status_changed', payload);
      io.emit('host_status_changed', payload);
      io.emit('listener_online', payload);
    });

    socket.on('listener_offline', async () => {
      if (role !== 'LISTENER') return;

      await prisma.listenerProfile.updateMany({
        where: { userId },
        data: { availability: 'OFFLINE' },
      });

      const listenerProfile = await prisma.listenerProfile.findUnique({
        where: { userId },
        select: { isEnabled: true },
      });

      const payload = {
        listenerId: userId,
        status: 'OFFLINE',
        isEnabled: listenerProfile?.isEnabled ?? true,
        syncVersion: Date.now(),
      };

      io.emit('listener_status_changed', payload);
      io.emit('host_status_changed', payload);
      io.emit('listener_offline', payload);
    });

    socket.on('listener_busy', async () => {
      if (role !== 'LISTENER') return;

      await prisma.listenerProfile.updateMany({
        where: { userId },
        data: { availability: 'BUSY' },
      });

      const listenerProfile = await prisma.listenerProfile.findUnique({
        where: { userId },
        select: { isEnabled: true },
      });

      const payload = {
        listenerId: userId,
        status: 'BUSY',
        isEnabled: listenerProfile?.isEnabled ?? true,
        syncVersion: Date.now(),
      };

      io.emit('listener_status_changed', payload);
      io.emit('host_status_changed', payload);
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

    socket.on('call_request', async ({ listenerId }, callback) => {
      try {
        const data = await callService.requestCall({
          userId,
          listenerId,
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
        await prisma.listenerProfile.updateMany({
          where: { userId },
          data: { availability: 'OFFLINE' },
        });

        const listenerProfile = await prisma.listenerProfile.findUnique({
          where: { userId },
          select: { isEnabled: true },
        });

        const payload = {
          listenerId: userId,
          status: 'OFFLINE',
          isEnabled: listenerProfile?.isEnabled ?? true,
          syncVersion: Date.now(),
        };

        io.emit('listener_status_changed', payload);
        io.emit('host_status_changed', payload);
        io.emit('listener_offline', payload);
      }

      io.emit('user_offline', { userId, role });
    });
  });

  return io;
};

module.exports = { initSocket };
