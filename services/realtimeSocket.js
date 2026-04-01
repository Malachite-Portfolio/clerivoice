import { io } from 'socket.io-client';
import { AUTH_DEBUG_ENABLED, LIVE_CONFIG_ERROR, SOCKET_BASE_URL } from '../constants/api';
import { isDemoSessionActive } from './demoMode';

let socket = null;
let socketConnected = false;
let activeToken = null;
let currentSocketState = 'disconnected';
const socketStateSubscribers = new Set();

const resolveTransientSocketState = () => {
  if (socket?.connected) {
    return 'connected';
  }

  if (socket?.active) {
    return 'reconnecting';
  }

  return 'disconnected';
};

const logRealtimeSocket = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[RealtimeSocket] ${label}`, payload);
};

const notifySocketState = (state) => {
  currentSocketState = state;
  socketConnected = state === 'connected';
  logRealtimeSocket('stateChanged', {
    state,
    connected: socketConnected,
  });
  socketStateSubscribers.forEach((listener) => {
    listener({
      state,
      connected: socketConnected,
    });
  });
};

export const connectRealtimeSocket = (token) => {
  if (!token || !SOCKET_BASE_URL) {
    logRealtimeSocket('connectSkipped', {
      hasToken: Boolean(token),
      hasSocketBaseUrl: Boolean(SOCKET_BASE_URL),
    });
    return null;
  }

  if (isDemoSessionActive()) {
    activeToken = token;
    notifySocketState('connected');
    return null;
  }

  if (socket && activeToken && activeToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (socket?.connected) {
    notifySocketState('connected');
    return socket;
  }

  activeToken = token;

  if (socket) {
    socket.auth = {
      token,
    };
    notifySocketState('reconnecting');
    socket.connect();
    return socket;
  }

  notifySocketState('reconnecting');
  logRealtimeSocket('connectStart', {
    socketBaseUrl: SOCKET_BASE_URL,
    hasToken: Boolean(token),
  });
  socket = io(SOCKET_BASE_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    auth: {
      token,
    },
  });

  socket.on('connect', () => {
    logRealtimeSocket('connectSuccess', {
      socketId: socket?.id || null,
    });
    notifySocketState('connected');
  });
  socket.on('disconnect', (reason) => {
    logRealtimeSocket('disconnect', {
      reason: reason || null,
    });
    notifySocketState(resolveTransientSocketState());
  });
  socket.on('reconnect_attempt', (attempt) => {
    logRealtimeSocket('reconnectAttempt', {
      attempt: attempt ?? null,
    });
    notifySocketState('reconnecting');
  });
  socket.on('connect_error', (error) => {
    logRealtimeSocket('connectError', {
      message: error?.message || 'Unknown socket error',
    });
    notifySocketState(resolveTransientSocketState());
  });

  return socket;
};

export const getRealtimeSocket = () => socket;
export const isRealtimeSocketConnected = () => socketConnected;

export const subscribeRealtimeSocketState = (listener) => {
  socketStateSubscribers.add(listener);
  listener({
    state: currentSocketState,
    connected: socketConnected,
  });

  return () => {
    socketStateSubscribers.delete(listener);
  };
};

export const emitWithAck = (eventName, payload = {}, timeoutMs = 10000) =>
  new Promise((resolve, reject) => {
    if (isDemoSessionActive()) {
      resolve({
        ...payload,
        eventName,
        demoMode: true,
      });
      return;
    }

    if (!socket) {
      logRealtimeSocket('emitFailedNoSocket', {
        eventName,
      });
      reject(new Error('Socket is not connected'));
      return;
    }

    logRealtimeSocket('emitStart', {
      eventName,
      payloadKeys: Object.keys(payload || {}),
    });

    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) {
        logRealtimeSocket('emitError', {
          eventName,
          message: error?.message || 'Socket ack timeout',
        });
        reject(error);
        return;
      }

      if (!response?.success) {
        const ackError = new Error(response?.message || 'Socket action failed');
        ackError.code = response?.code;
        ackError.data = response?.data;
        logRealtimeSocket('emitRejected', {
          eventName,
          code: response?.code || null,
          message: response?.message || 'Socket action failed',
        });
        reject(ackError);
        return;
      }

      logRealtimeSocket('emitSuccess', {
        eventName,
      });
      resolve(response.data);
    });
  });

export const disconnectRealtimeSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  activeToken = null;
  notifySocketState('disconnected');
};

export const getSocketConfigError = () => (!SOCKET_BASE_URL ? LIVE_CONFIG_ERROR : '');
