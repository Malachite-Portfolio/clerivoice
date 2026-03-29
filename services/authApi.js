import { apiClient } from './apiClient';

export const sendOtp = async (phone) => {
  const response = await apiClient.post('/auth/send-otp', {
    phone,
    purpose: 'LOGIN',
  });
  return response.data.data;
};

export const loginUser = async ({ phone, otp, displayName }) => {
  const response = await apiClient.post('/auth/login-user', {
    phone,
    otp,
    displayName,
  });
  return response.data.data;
};

export const loginListener = async ({ phoneOrEmail, password }) => {
  const response = await apiClient.post('/auth/login-listener', {
    phoneOrEmail,
    password,
  });
  return response.data.data;
};

// Backward-compatible alias for existing imports.
export const verifyOtp = loginUser;
