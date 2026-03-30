import { API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';

export const fetchHosts = async ({ page = 1, limit = 20, ...filters } = {}) => {
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
  const response = await apiClient.get(API_ENDPOINTS.listeners.availability(listenerId));
  return response.data.data;
};
