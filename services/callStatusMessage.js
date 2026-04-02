const CALL_REASON_MESSAGE_MAP = {
  HOST_BUSY: 'Host is on another call',
  HOST_OFFLINE: 'Host is offline',
  CALL_REJECTED: 'Call rejected',
};

const GENERIC_CALL_BLOCK_PATTERNS = ['call blocked', 'host unavailable', 'host is currently unavailable'];

const normalizeReasonCode = (value) => String(value || '').trim().toUpperCase();

const extractReasonCode = (error) => {
  const directCode = normalizeReasonCode(error?.response?.data?.code || error?.code);
  if (directCode) {
    return directCode;
  }

  const nestedCode = normalizeReasonCode(error?.response?.data?.data?.reasonCode);
  if (nestedCode) {
    return nestedCode;
  }

  const legacyReason = normalizeReasonCode(error?.response?.data?.data?.reason);
  if (legacyReason) {
    return legacyReason;
  }

  return '';
};

const looksGenericCallBlockMessage = (value) => {
  const normalizedMessage = String(value || '').trim().toLowerCase();
  if (!normalizedMessage) {
    return true;
  }

  return GENERIC_CALL_BLOCK_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
};

export const getCallStatusMessageByCode = (reasonCode, fallbackMessage = 'Unable to start call right now.') => {
  const normalizedReasonCode = normalizeReasonCode(reasonCode);
  return CALL_REASON_MESSAGE_MAP[normalizedReasonCode] || fallbackMessage;
};

export const getCallStatusMessageFromError = (error, fallbackMessage = 'Unable to start call right now.') => {
  const reasonCode = extractReasonCode(error);
  const mappedMessage = getCallStatusMessageByCode(reasonCode, '');
  if (mappedMessage) {
    return mappedMessage;
  }

  const backendMessage = String(error?.response?.data?.message || error?.message || '').trim();
  if (backendMessage && !looksGenericCallBlockMessage(backendMessage)) {
    return backendMessage;
  }

  return fallbackMessage;
};

