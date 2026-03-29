import { apiClient } from './apiClient';

export const fetchHosts = async ({ page = 1, limit = 20, ...filters } = {}) => {
  const response = await apiClient.get('/listeners', {
    params: {
      page,
      limit,
      ...filters,
    },
  });

  return response.data.data;
};

export const fetchHostAvailability = async (listenerId) => {
  const response = await apiClient.get(`/listeners/${listenerId}/availability`);
  return response.data.data;
};
