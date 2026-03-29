import { io } from 'socket.io-client';
import { LIVE_CONFIG_ERROR, SOCKET_BASE_URL } from '../constants/api';

let socket = null;
let socketConnected = false;
let activeToken = null;
const socketStateSubscribers = new Set();

const notifySocketState = (state) => {
  socketConnected = state === 'connected';
  socketStateSubscribers.forEach((listener) => {
    listener({
      state,
      connected: socketConnected,
    });
  });
};

export const connectRealtimeSocket = (token) => {
  if (!token || !SOCKET_BASE_URL) {
    return null;
  }

  if (socket && activeToken && activeToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (socket?.connected) {
    return socket;
  }

  activeToken = token;

  socket = io(SOCKET_BASE_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    auth: {
      token,
    },
  });

  socket.on('connect', () => notifySocketState('connected'));
  socket.on('disconnect', () => notifySocketState('disconnected'));
  socket.on('reconnect_attempt', () => notifySocketState('reconnecting'));
  socket.on('connect_error', () => notifySocketState('error'));

  return socket;
};

export const getRealtimeSocket = () => socket;
export const isRealtimeSocketConnected = () => socketConnected;

export const subscribeRealtimeSocketState = (listener) => {
  socketStateSubscribers.add(listener);
  listener({
    state: socketConnected ? 'connected' : 'disconnected',
    connected: socketConnected,
  });

  return () => {
    socketStateSubscribers.delete(listener);
  };
};

export const emitWithAck = (eventName, payload = {}, timeoutMs = 10000) =>
  new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Socket is not connected'));
      return;
    }

    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }

      if (!response?.success) {
        const ackError = new Error(response?.message || 'Socket action failed');
        ackError.code = response?.code;
        ackError.data = response?.data;
        reject(ackError);
        return;
      }

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
