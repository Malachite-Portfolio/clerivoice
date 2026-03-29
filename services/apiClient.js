import axios from 'axios';
import { API_BASE_URL, LIVE_CONFIG_ERROR } from '../constants/api';

let accessToken = null;

export const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  if (!API_BASE_URL) {
    return Promise.reject(new Error(LIVE_CONFIG_ERROR));
  }

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export const setApiAccessToken = (token) => {
  accessToken = token || null;
};
