import { API_ENDPOINTS, AUTH_DEBUG_ENABLED } from '../constants/api';
import { apiClient } from './apiClient';
import {
  applyDemoWalletCoupon,
  createDemoWalletOrder,
  getDemoReferralFaq,
  getDemoReferralHistory,
  getDemoReferralInfo,
  getDemoWalletHistory,
  getDemoWalletPlans,
  getDemoWalletSummary,
  isDemoSessionActive,
  verifyDemoWalletPayment,
} from './demoMode';

const logWalletApi = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[WalletApi] ${label}`, payload);
};

export const fetchWalletSummary = async () => {
  if (isDemoSessionActive()) {
    return getDemoWalletSummary();
  }

  const response = await apiClient.get(API_ENDPOINTS.wallet.summary);
  logWalletApi('walletSummaryFetched', {
    balance: response.data?.data?.balance ?? null,
  });
  return response.data.data;
};

export const fetchWalletPlans = async () => {
  if (isDemoSessionActive()) {
    return getDemoWalletPlans();
  }

  const response = await apiClient.get(API_ENDPOINTS.wallet.plans);
  return response.data.data || [];
};

export const fetchWalletHistory = async ({ page = 1, limit = 20, type } = {}) => {
  if (isDemoSessionActive()) {
    return getDemoWalletHistory({ page, limit, type });
  }

  const response = await apiClient.get(API_ENDPOINTS.wallet.history, {
    params: {
      page,
      limit,
      ...(type ? { type } : {}),
    },
  });

  logWalletApi('walletHistoryFetched', {
    page,
    limit,
    type: type || null,
    count: response.data?.data?.items?.length || 0,
  });

  return response.data.data;
};

export const applyWalletCoupon = async ({ couponCode, amount }) => {
  if (isDemoSessionActive()) {
    return applyDemoWalletCoupon({ couponCode, amount });
  }

  const response = await apiClient.post(API_ENDPOINTS.wallet.applyCoupon, {
    couponCode,
    amount,
  });

  return response.data.data;
};

export const createWalletOrder = async ({
  planId,
  amount,
  couponCode,
  paymentMethod,
  metadata,
} = {}) => {
  if (isDemoSessionActive()) {
    return createDemoWalletOrder({
      planId,
      amount,
      couponCode,
      paymentMethod,
      metadata,
    });
  }

  const response = await apiClient.post(API_ENDPOINTS.wallet.createOrder, {
    ...(planId ? { planId } : {}),
    ...(!planId && amount ? { amount } : {}),
    ...(couponCode ? { couponCode } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(metadata ? { metadata } : {}),
  });

  return response.data.data;
};

export const verifyWalletPayment = async ({
  orderId,
  gatewayPaymentId,
  gatewaySignature,
  method,
  metadata,
}) => {
  if (isDemoSessionActive()) {
    return verifyDemoWalletPayment({
      orderId,
      gatewayPaymentId,
      gatewaySignature,
      method,
      metadata,
    });
  }

  const response = await apiClient.post(API_ENDPOINTS.wallet.verifyPayment, {
    orderId,
    gatewayPaymentId,
    ...(gatewaySignature ? { gatewaySignature } : {}),
    ...(method ? { method } : {}),
    ...(metadata ? { metadata } : {}),
  });

  return response.data.data;
};

export const fetchReferralInfo = async () => {
  if (isDemoSessionActive()) {
    return getDemoReferralInfo();
  }

  const response = await apiClient.get(API_ENDPOINTS.referral.me);
  return response.data.data;
};

export const fetchReferralHistory = async () => {
  if (isDemoSessionActive()) {
    return getDemoReferralHistory();
  }

  const response = await apiClient.get(API_ENDPOINTS.referral.history);
  return response.data.data;
};

export const fetchReferralFaq = async () => {
  if (isDemoSessionActive()) {
    return getDemoReferralFaq();
  }

  const response = await apiClient.get(API_ENDPOINTS.referral.faq);
  return response.data.data?.faq || [];
};
