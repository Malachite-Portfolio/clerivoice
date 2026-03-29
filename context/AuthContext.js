import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_STORAGE_KEY } from '../constants/api';
import { setApiAccessToken } from '../services/apiClient';
import { disconnectRealtimeSocket } from '../services/realtimeSocket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSessionState] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const hydrateSession = async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
          setIsHydrated(true);
          return;
        }

        const parsed = JSON.parse(raw);
        setSessionState(parsed);
        setApiAccessToken(parsed?.accessToken);
      } catch (_error) {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      } finally {
        setIsHydrated(true);
      }
    };

    hydrateSession();
  }, []);

  const value = useMemo(
    () => ({
      session,
      isHydrated,
      async setSession(nextSession) {
        setSessionState(nextSession);
        setApiAccessToken(nextSession?.accessToken);
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
      },
      async logout() {
        disconnectRealtimeSocket();
        setSessionState(null);
        setApiAccessToken(null);
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      },
    }),
    [isHydrated, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
