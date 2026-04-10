import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type {
  ApiResponse,
  PaginatedResponse,
  ReferralRecord,
  ReferralSettings,
} from "@/types";

type BackendPagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

type BackendReferralListPayload = {
  items?: ReferralRecord[];
  pagination?: BackendPagination;
};

type BackendReferralRule = {
  inviterReward?: number | string;
  referredReward?: number | string;
  qualifyingAmount?: number | string;
};

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeListPayload = (
  payload: BackendReferralListPayload,
): PaginatedResponse<ReferralRecord> => {
  const items = payload.items || [];
  const pagination = payload.pagination || {};
  const page = Number(pagination.page || 1);
  const pageSize = Number(pagination.limit || items.length || 10);
  const totalCount = Number(pagination.total || items.length);
  const totalPages = Number(
    pagination.totalPages || Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize))),
  );

  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages,
  };
};

const normalizeRule = (rule: BackendReferralRule): ReferralSettings => ({
  inviterReward: toNumber(rule.inviterReward),
  invitedReward: toNumber(rule.referredReward),
  qualifyingRechargeAmount: toNumber(rule.qualifyingAmount),
  faqContent: [],
});

export const referralsService = {
  async getReferrals(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
  }) {
    const response = await api.get<ApiResponse<BackendReferralListPayload>>(
      API_ENDPOINTS.referrals.list,
      {
        params: {
          page: params?.page,
          limit: params?.pageSize,
          status: params?.status,
          search: params?.search,
        },
      },
    );
    return normalizeListPayload(response.data.data);
  },

  async getReferralSettings() {
    const response = await api.get<ApiResponse<BackendReferralRule>>(
      API_ENDPOINTS.referrals.settings,
    );
    return normalizeRule(response.data.data);
  },

  async updateReferralSettings(settings: Partial<ReferralSettings>) {
    const response = await api.patch<ApiResponse<BackendReferralRule>>(
      API_ENDPOINTS.referrals.settings,
      {
        inviterReward: settings.inviterReward,
        referredReward: settings.invitedReward,
        qualifyingAmount: settings.qualifyingRechargeAmount,
      },
    );
    return normalizeRule(response.data.data);
  },
};

