import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  hosts: {
    all: ['hosts'],
    list: (params = {}) => ['hosts', 'list', params],
  },
  wallet: {
    summary: ['wallet', 'summary'],
  },
  referral: {
    me: ['referral', 'me'],
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15000,
      gcTime: 5 * 60 * 1000,
      refetchOnReconnect: true,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
