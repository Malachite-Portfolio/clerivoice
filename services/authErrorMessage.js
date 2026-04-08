const normalizeCode = (value) => String(value || '').trim().toUpperCase();

export const getOtpErrorMessage = (
  error,
  { action = 'send', role = 'user' } = {},
) => {
  const statusCode = Number(error?.response?.status || 0);
  const errorCode = normalizeCode(error?.response?.data?.code || error?.code);
  const backendMessage = String(error?.response?.data?.message || '').trim();
  const normalizedAction = String(action || 'send').trim().toLowerCase();
  const normalizedRole = String(role || 'user').trim().toLowerCase();
  const authLabel = normalizedRole === 'listener' ? 'listener OTP' : 'OTP';

  if (backendMessage) {
    return backendMessage;
  }

  if (!error?.response) {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }

  if (statusCode === 429 || errorCode === 'RATE_LIMITED') {
    return 'Too many attempts detected. Please wait a few minutes and try again.';
  }

  if (errorCode === 'OTP_NOT_FOUND') {
    return 'No active OTP was found. Please request a new OTP.';
  }

  if (errorCode === 'OTP_EXPIRED') {
    return 'Your OTP has expired. Please request a new OTP.';
  }

  if (errorCode === 'INVALID_OTP') {
    return 'Invalid OTP. Please enter the correct code and try again.';
  }

  if (errorCode === 'OTP_ATTEMPTS_EXCEEDED') {
    return 'OTP attempt limit reached. Please request a new OTP.';
  }

  if (errorCode === 'LISTENER_TEST_AUTH_DISABLED') {
    return 'This listener account is not enabled for OTP login.';
  }

  if (statusCode >= 500) {
    return 'Server is temporarily unavailable. Please try again shortly.';
  }

  if (normalizedAction === 'verify') {
    return `Unable to verify ${authLabel} right now. Please try again.`;
  }

  return `Unable to send ${authLabel} right now. Please try again.`;
};
