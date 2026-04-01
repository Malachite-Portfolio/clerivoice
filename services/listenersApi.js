import { API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';
import { getDemoHostAvailability, getDemoHosts, isDemoSessionActive } from './demoMode';

export const fetchHosts = async ({ page = 1, limit = 20, ...filters } = {}) => {
  if (isDemoSessionActive()) {
    return getDemoHosts({ page, limit, ...filters });
  }

  const response = await apiClient.get(API_ENDPOINTS.listeners.list, {
    params: {
      page,
      limit,
      ...filters,
    },
  });

  return response.data.data;
};

export const fetchHostAvailability = async (listenerId) => {
  if (isDemoSessionActive()) {
    return getDemoHostAvailability(listenerId);
  }

  const response = await apiClient.get(API_ENDPOINTS.listeners.availability(listenerId));
  return response.data.data;
};
