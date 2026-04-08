import { apiClient } from "./apiClient";
import {
  logAuthError,
  logAuthRequest,
  logAuthResponse,
} from "./authRequestLogger";
import { getAuthDeviceContext } from "./authDeviceContext";

export const FIREBASE_AUTH_ENDPOINTS = {
  firebaseLogin: "/auth/firebase-login",
};

export const loginWithFirebaseIdentity = async ({
  phone,
  firebaseUid,
  role,
  displayName,
}) => {
  const deviceContext = await getAuthDeviceContext();
  const requestBody = {
    phone,
    firebaseUid,
    role,
    displayName,
    deviceId: deviceContext?.deviceId || undefined,
    deviceInfo: deviceContext?.deviceInfo || undefined,
  };

  logAuthRequest("firebaseLogin", FIREBASE_AUTH_ENDPOINTS.firebaseLogin, requestBody);

  try {
    const response = await apiClient.post(
      FIREBASE_AUTH_ENDPOINTS.firebaseLogin,
      requestBody,
      {
        skipAuth: true,
      },
    );
    logAuthResponse("firebaseLogin", response, FIREBASE_AUTH_ENDPOINTS.firebaseLogin);
    const responseEnvelope = response?.data || {};
    const nestedData = responseEnvelope?.data && typeof responseEnvelope.data === "object"
      ? responseEnvelope.data
      : null;
    const authData = nestedData || responseEnvelope;
    const resolvedAccessToken = String(authData?.accessToken || authData?.token || "").trim();
    const normalizedData = {
      user: authData?.user || null,
      accessToken: resolvedAccessToken,
      refreshToken: String(authData?.refreshToken || "").trim() || null,
    };

    if (!responseEnvelope?.success || !normalizedData.accessToken || !normalizedData.user) {
      const invalidResponseError = new Error(
        "Firebase login was not acknowledged by backend.",
      );
      invalidResponseError.response = response;
      throw invalidResponseError;
    }

    return normalizedData;
  } catch (error) {
    logAuthError("firebaseLogin", FIREBASE_AUTH_ENDPOINTS.firebaseLogin, requestBody, error);
    throw error;
  }
};
