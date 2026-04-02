import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  API_BASE_URL,
  AUTH_CLEAR_ON_STARTUP_ONCE_ENABLED,
  AUTH_DEBUG_ENABLED,
} from '../constants/api';
import { resetToAuthEntry } from '../navigation/navigationRef';
import { setApiAccessToken, setApiUnauthorizedHandler } from '../services/apiClient';
import { disconnectRealtimeSocket } from '../services/realtimeSocket';
import { useAppVariant } from './AppVariantContext';

const AuthContext = createContext(null);

const normalizeSessionPayload = (nextSession) => {
  if (!nextSession) {
    return null;
  }

  const accessToken =
    typeof nextSession?.accessToken === 'string' ? nextSession.accessToken.trim() : '';
  const refreshToken =
    typeof nextSession?.refreshToken === 'string' ? nextSession.refreshToken.trim() : '';

  if (!accessToken) {
    return null;
  }

  return {
    user: nextSession?.user || null,
    accessToken,
    refreshToken: refreshToken || null,
  };
};

const createRoleMismatchError = (role, appDisplayName) => {
  const roleLabel = String(role || '').trim().toLowerCase();
  const error = new Error(
    roleLabel
      ? `This ${roleLabel} account is not allowed in ${appDisplayName}.`
      : `This account is not allowed in ${appDisplayName}.`,
  );
  error.code = 'ROLE_MISMATCH';
  return error;
};

export const AuthProvider = ({ children, validateStoredSession }) => {
  const {
    accessTokenStorageKey,
    appDisplayName,
    authStorageKey,
    authEntryRouteName,
    compatibilityAccessTokenStorageKey,
    compatibilityRefreshTokenStorageKey,
    refreshTokenStorageKey,
    roleStorageKey,
    sessionRoleName,
    userStorageKey,
  } = useAppVariant();
  const [session, setSessionState] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const unauthorizedResetInFlightRef = useRef(false);

  const enforceAllowedRole = useCallback((nextSession) => {
    const normalizedSession = normalizeSessionPayload(nextSession);
    if (!normalizedSession) {
      return null;
    }

    if (String(normalizedSession?.user?.role || '').trim().toUpperCase() !== sessionRoleName) {
      throw createRoleMismatchError(normalizedSession?.user?.role, appDisplayName);
    }

    return normalizedSession;
  }, [appDisplayName, sessionRoleName]);

  const logAuthDebug = useCallback((label, payload) => {
    if (!AUTH_DEBUG_ENABLED) {
      return;
    }

    console.log(`[ExpoAuth] ${label}`, payload);
  }, []);

  const persistSession = useCallback(async (nextSession) => {
    const normalizedSession = enforceAllowedRole(nextSession);

    if (!normalizedSession) {
      await Promise.all([
        AsyncStorage.removeItem(authStorageKey),
        AsyncStorage.removeItem(accessTokenStorageKey),
        AsyncStorage.removeItem(refreshTokenStorageKey),
        AsyncStorage.removeItem(userStorageKey),
        compatibilityAccessTokenStorageKey
          ? AsyncStorage.removeItem(compatibilityAccessTokenStorageKey)
          : Promise.resolve(),
        compatibilityRefreshTokenStorageKey
          ? AsyncStorage.removeItem(compatibilityRefreshTokenStorageKey)
          : Promise.resolve(),
        roleStorageKey ? AsyncStorage.removeItem(roleStorageKey) : Promise.resolve(),
      ]);
      return null;
    }

    const writes = [
      AsyncStorage.setItem(authStorageKey, JSON.stringify(normalizedSession)),
      AsyncStorage.setItem(accessTokenStorageKey, normalizedSession.accessToken),
      compatibilityAccessTokenStorageKey
        ? AsyncStorage.setItem(compatibilityAccessTokenStorageKey, normalizedSession.accessToken)
        : Promise.resolve(),
      roleStorageKey
        ? AsyncStorage.setItem(
            roleStorageKey,
            String(normalizedSession?.user?.role || sessionRoleName || '').trim().toLowerCase(),
          )
        : Promise.resolve(),
    ];

    if (normalizedSession.refreshToken) {
      writes.push(AsyncStorage.setItem(refreshTokenStorageKey, normalizedSession.refreshToken));
      if (compatibilityRefreshTokenStorageKey) {
        writes.push(
          AsyncStorage.setItem(compatibilityRefreshTokenStorageKey, normalizedSession.refreshToken),
        );
      }
    } else {
      writes.push(AsyncStorage.removeItem(refreshTokenStorageKey));
      if (compatibilityRefreshTokenStorageKey) {
        writes.push(AsyncStorage.removeItem(compatibilityRefreshTokenStorageKey));
      }
    }

    if (normalizedSession.user) {
      writes.push(AsyncStorage.setItem(userStorageKey, JSON.stringify(normalizedSession.user)));
    } else {
      writes.push(AsyncStorage.removeItem(userStorageKey));
    }

    await Promise.all(writes);
    return normalizedSession;
  }, [
    accessTokenStorageKey,
    authStorageKey,
    compatibilityAccessTokenStorageKey,
    compatibilityRefreshTokenStorageKey,
    enforceAllowedRole,
    refreshTokenStorageKey,
    roleStorageKey,
    sessionRoleName,
    userStorageKey,
  ]);

  const loadStoredSession = useCallback(async () => {
    const rawSession = await AsyncStorage.getItem(authStorageKey);
    if (rawSession) {
      try {
        return normalizeSessionPayload(JSON.parse(rawSession));
      } catch (_error) {
        logAuthDebug('stored session parse failed', {
          source: authStorageKey,
        });
      }
    }

    const [
      legacyAccessToken,
      legacyRefreshToken,
      rawStoredUser,
      compatibilityAccessToken,
      compatibilityRefreshToken,
      rawStoredRole,
    ] = await Promise.all([
      AsyncStorage.getItem(accessTokenStorageKey),
      AsyncStorage.getItem(refreshTokenStorageKey),
      AsyncStorage.getItem(userStorageKey),
      compatibilityAccessTokenStorageKey
        ? AsyncStorage.getItem(compatibilityAccessTokenStorageKey)
        : Promise.resolve(null),
      compatibilityRefreshTokenStorageKey
        ? AsyncStorage.getItem(compatibilityRefreshTokenStorageKey)
        : Promise.resolve(null),
      roleStorageKey ? AsyncStorage.getItem(roleStorageKey) : Promise.resolve(null),
    ]);

    let storedUser = null;
    if (rawStoredUser) {
      try {
        storedUser = JSON.parse(rawStoredUser);
      } catch (_error) {
        logAuthDebug('stored user parse failed', {
          source: userStorageKey,
        });
      }
    }

    const resolvedAccessToken = legacyAccessToken || compatibilityAccessToken;
    const resolvedRefreshToken = legacyRefreshToken || compatibilityRefreshToken;

    if (!resolvedAccessToken) {
      return null;
    }

    return normalizeSessionPayload({
      user: storedUser || (rawStoredRole ? { role: rawStoredRole } : null),
      accessToken: resolvedAccessToken,
      refreshToken: resolvedRefreshToken,
    });
  }, [
    accessTokenStorageKey,
    authStorageKey,
    compatibilityAccessTokenStorageKey,
    compatibilityRefreshTokenStorageKey,
    logAuthDebug,
    refreshTokenStorageKey,
    roleStorageKey,
    userStorageKey,
  ]);

  const clearPersistedSession = useCallback(async () => {
    disconnectRealtimeSocket();
    setSessionState(null);
    setApiAccessToken(null);
    await Promise.all([
      AsyncStorage.removeItem(authStorageKey),
      AsyncStorage.removeItem(accessTokenStorageKey),
      AsyncStorage.removeItem(refreshTokenStorageKey),
      AsyncStorage.removeItem(userStorageKey),
      compatibilityAccessTokenStorageKey
        ? AsyncStorage.removeItem(compatibilityAccessTokenStorageKey)
        : Promise.resolve(),
      compatibilityRefreshTokenStorageKey
        ? AsyncStorage.removeItem(compatibilityRefreshTokenStorageKey)
        : Promise.resolve(),
      roleStorageKey ? AsyncStorage.removeItem(roleStorageKey) : Promise.resolve(),
    ]);
  }, [
    accessTokenStorageKey,
    authStorageKey,
    compatibilityAccessTokenStorageKey,
    compatibilityRefreshTokenStorageKey,
    refreshTokenStorageKey,
    roleStorageKey,
    userStorageKey,
  ]);

  const handleUnauthorizedSession = useCallback(
    async (error) => {
      if (unauthorizedResetInFlightRef.current) {
        return;
      }

      unauthorizedResetInFlightRef.current = true;

      try {
        if (AUTH_DEBUG_ENABLED) {
          console.warn('[ExpoAuth] clearing invalid session', {
            status: error?.response?.status ?? null,
            code: error?.response?.data?.code || error?.code || null,
            message: error?.response?.data?.message || error?.message || 'Unauthorized',
          });
        }

        await clearPersistedSession();
        resetToAuthEntry();
      } finally {
        unauthorizedResetInFlightRef.current = false;
      }
    },
    [clearPersistedSession],
  );

  useEffect(() => {
    setApiUnauthorizedHandler(handleUnauthorizedSession);

    return () => {
      setApiUnauthorizedHandler(null);
    };
  }, [handleUnauthorizedSession]);

  useEffect(() => {
    const hydrateSession = async () => {
      try {
        const startupDebugResetMarkerKey = `${authStorageKey}_debug_reset_once_done`;

        logAuthDebug('startup config', {
          apiBaseUrl: API_BASE_URL,
          authEntryRouteName,
          authStorageKey,
          accessTokenStorageKey,
          compatibilityAccessTokenStorageKey,
          roleStorageKey,
          refreshTokenStorageKey,
          userStorageKey,
          debugClearOnStartupOnce: AUTH_CLEAR_ON_STARTUP_ONCE_ENABLED,
        });

        if (AUTH_CLEAR_ON_STARTUP_ONCE_ENABLED) {
          const hasClearedStartupStorage = await AsyncStorage.getItem(startupDebugResetMarkerKey);

          if (!hasClearedStartupStorage) {
            await clearPersistedSession();
            await AsyncStorage.setItem(startupDebugResetMarkerKey, 'true');
            logAuthDebug('startup auth reset completed', {
              markerKey: startupDebugResetMarkerKey,
            });
          }
        }

        const parsed = await loadStoredSession();
        logAuthDebug('storage read', {
          hasStoredSession: Boolean(parsed?.accessToken),
        });

        if (!parsed) {
          setSessionState(null);
          setApiAccessToken(null);
          return;
        }

        const storedAccessToken = parsed.accessToken;

        logAuthDebug('token loaded from storage', {
          hasAccessToken: Boolean(storedAccessToken),
          userRole: parsed?.user?.role || null,
        });

        if (!storedAccessToken) {
          await clearPersistedSession();
          return;
        }

        setApiAccessToken(storedAccessToken);

        const validatedUser = await validateStoredSession(parsed?.user || null);
        const nextSession = enforceAllowedRole({
          user: validatedUser,
          accessToken: storedAccessToken,
          refreshToken: parsed?.refreshToken || null,
        });

        logAuthDebug('auth validation response', {
          userId: validatedUser?.id || null,
          role: validatedUser?.role || null,
        });

        setSessionState(nextSession);
        await persistSession(nextSession);
      } catch (error) {
        if (AUTH_DEBUG_ENABLED) {
          console.warn('[ExpoAuth] bootstrap session validation failed', {
            message: error?.response?.data?.message || error?.message || 'Unknown error',
            status: error?.response?.status ?? null,
            code: error?.response?.data?.code || null,
          });
        }
        await clearPersistedSession();
        resetToAuthEntry();
      } finally {
        setIsHydrated(true);
      }
    };

    hydrateSession();
  }, [
    accessTokenStorageKey,
    authEntryRouteName,
    authStorageKey,
    clearPersistedSession,
    compatibilityAccessTokenStorageKey,
    enforceAllowedRole,
    loadStoredSession,
    logAuthDebug,
    persistSession,
    refreshTokenStorageKey,
    roleStorageKey,
    userStorageKey,
    validateStoredSession,
  ]);

  const value = useMemo(
    () => ({
      session,
      isHydrated,
      async setSession(nextSession) {
        unauthorizedResetInFlightRef.current = false;
        const normalizedSession = enforceAllowedRole(nextSession);
        setSessionState(normalizedSession);
        setApiAccessToken(normalizedSession?.accessToken || null);
        try {
          await persistSession(normalizedSession);
        } catch (error) {
          await clearPersistedSession();
          resetToAuthEntry();
          throw error;
        }
      },
      async logout() {
        unauthorizedResetInFlightRef.current = false;
        await clearPersistedSession();
      },
    }),
    [clearPersistedSession, enforceAllowedRole, isHydrated, persistSession, session],
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
