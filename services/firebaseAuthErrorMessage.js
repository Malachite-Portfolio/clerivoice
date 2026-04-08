const normalizeFirebaseCode = (value) => String(value || "").trim().toLowerCase();

export const getFirebaseAuthErrorCode = (error) =>
  normalizeFirebaseCode(error?.code || error?.nativeErrorCode || "");

export const getFirebaseAuthErrorMessage = (error, { action = "send" } = {}) => {
  const code = getFirebaseAuthErrorCode(error);
  const normalizedAction = String(action || "send").trim().toLowerCase();

  if (code === "auth/invalid-phone-number") {
    return "Please enter a valid phone number.";
  }

  if (
    code === "auth/invalid-verification-code" ||
    code === "auth/code-expired" ||
    code === "auth/session-expired"
  ) {
    return "Invalid OTP. Please check the code and try again.";
  }

  if (code === "auth/too-many-requests" || code === "auth/quota-exceeded") {
    return "Too many OTP attempts. Please wait and try again.";
  }

  if (code === "auth/network-request-failed") {
    return "Network issue detected. Please check your connection and try again.";
  }

  if (code === "auth/missing-verification-id") {
    return "OTP session expired. Please request a new OTP.";
  }

  if (code === "auth/user-disabled") {
    return "This phone authentication account is disabled.";
  }

  if (normalizedAction === "verify") {
    return "Unable to verify OTP right now. Please try again.";
  }

  return "Unable to send OTP right now. Please try again.";
};

export const getBackendFirebaseLoginErrorMessage = (error) => {
  const statusCode = Number(error?.response?.status || 0);
  const backendMessage = String(error?.response?.data?.message || "").trim();

  if (backendMessage) {
    return backendMessage;
  }

  if (!error?.response) {
    return "OTP verified, but we could not reach login server. Please check your internet and retry.";
  }

  if (statusCode === 404) {
    return "OTP verified on Firebase, but backend firebase-login endpoint is unavailable.";
  }

  if (statusCode === 401 || statusCode === 403) {
    return "OTP verified, but this account is not allowed to sign in.";
  }

  if (statusCode >= 500) {
    return "OTP verified, but server is temporarily unavailable. Please try again shortly.";
  }

  return "OTP verified, but backend login failed. Please try again.";
};

