import colors from '../constants/colors';

export const PRESENCE_STATUS = {
  ONLINE: 'ONLINE',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
};

export const normalizePresenceStatus = (value, fallback = PRESENCE_STATUS.OFFLINE) => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (normalized === PRESENCE_STATUS.ONLINE) {
    return PRESENCE_STATUS.ONLINE;
  }

  if (normalized === PRESENCE_STATUS.BUSY) {
    return PRESENCE_STATUS.BUSY;
  }

  if (normalized === PRESENCE_STATUS.OFFLINE) {
    return PRESENCE_STATUS.OFFLINE;
  }

  return normalizePresenceStatus(fallback, PRESENCE_STATUS.OFFLINE);
};

export const isPresenceOnline = (value) =>
  normalizePresenceStatus(value) === PRESENCE_STATUS.ONLINE;

export const getPresenceLabel = (value) => {
  const status = normalizePresenceStatus(value);
  if (status === PRESENCE_STATUS.ONLINE) {
    return 'Online';
  }
  if (status === PRESENCE_STATUS.BUSY) {
    return 'Busy';
  }
  return 'Offline';
};

export const getPresenceDotColor = (value) => {
  const status = normalizePresenceStatus(value);
  if (status === PRESENCE_STATUS.ONLINE) {
    return colors.success;
  }
  if (status === PRESENCE_STATUS.BUSY) {
    return colors.warning;
  }
  return colors.error;
};
