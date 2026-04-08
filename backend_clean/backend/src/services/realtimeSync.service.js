const { getSocketServer } = require('../socket/socketStore');

const SYNC_EVENTS = {
  HOST_UPDATED: 'host_updated',
  HOST_DELETED: 'host_deleted',
  HOST_STATUS_CHANGED: 'host_status_changed',
  PRICING_UPDATED: 'pricing_updated',
  REFERRAL_UPDATED: 'referral_updated',
  WALLET_UPDATED: 'wallet_updated',
  LISTENER_STATUS_CHANGED: 'listener_status_changed',
};

const emitEvent = (event, payload) => {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  io.emit(event, payload);
};

const emitHostStatusChanged = ({
  listenerId,
  status,
  availability,
  isEnabled = true,
  reason,
  updatedAt,
  syncVersion,
  ...extra
}) => {
  const payload = {
    listenerId,
    status: status || availability,
    availability: availability || status,
    isEnabled,
    reason: reason || null,
    updatedAt: updatedAt || null,
    syncVersion: syncVersion || Date.now(),
    ...extra,
  };

  emitEvent(SYNC_EVENTS.LISTENER_STATUS_CHANGED, payload);
  emitEvent(SYNC_EVENTS.HOST_STATUS_CHANGED, payload);
  emitEvent(SYNC_EVENTS.HOST_UPDATED, payload);

  return payload;
};

const buildHostSyncPayload = (listenerProfile, extra = {}) => ({
  listenerId: listenerProfile.userId,
  status: listenerProfile.user?.status,
  availability: listenerProfile.availability,
  isEnabled: listenerProfile.isEnabled,
  callRatePerMinute: Number(listenerProfile.callRatePerMinute || 0),
  chatRatePerMinute: Number(listenerProfile.chatRatePerMinute || 0),
  syncVersion: Date.now(),
  updatedAt: listenerProfile.updatedAt,
  ...extra,
});

module.exports = {
  SYNC_EVENTS,
  emitEvent,
  emitHostStatusChanged,
  buildHostSyncPayload,
};
