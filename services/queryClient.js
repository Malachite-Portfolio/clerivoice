import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  hosts: {
    all: ['hosts'],
    list: (params = {}) => ['hosts', 'list', params],
  },
  sessions: {
    all: ['sessions'],
    inbox: (role = 'user') => ['sessions', 'inbox', role],
  },
  wallet: {
    summary: ['wallet', 'summary'],
    plans: ['wallet', 'plans'],
    history: (params = {}) => ['wallet', 'history', params],
  },
  referral: {
    me: ['referral', 'me'],
    history: ['referral', 'history'],
    faq: ['referral', 'faq'],
  },
  listener: {
    dashboard: ['listener', 'dashboard'],
    chats: ['listener', 'chats'],
    calls: ['listener', 'calls'],
    earnings: (params = {}) => ['listener', 'earnings', params],
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
