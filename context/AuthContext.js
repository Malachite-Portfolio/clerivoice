import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  API_BASE_URL,
  AUTH_CLEAR_ON_STARTUP_ONCE_ENABLED,
  AUTH_DEBUG_ENABLED,
  ENABLE_DEMO_LOGIN,
  ENABLE_TEST_AUTH,
} from '../constants/api';
import { resetToAuthEntry } from '../navigation/navigationRef';
import { setApiAccessToken, setApiUnauthorizedHandler } from '../services/apiClient';
import {
  createDemoUserSession,
  isDemoSessionActive,
  setDemoSessionActive,
} from '../services/demoMode';
import { disconnectRealtimeSocket } from '../services/realtimeSocket';
import { useAppVariant } from './AppVariantContext';

const AuthContext = createContext(null);

const normalizeSessionPayload = (nextSession) => {
  if (!nextSession) {
    return null;
  }

  const isDemoUser = nextSession?.isDemoUser === true;
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
    isDemoUser,
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
    demoFlagStorageKey,
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
        demoFlagStorageKey ? AsyncStorage.removeItem(demoFlagStorageKey) : Promise.resolve(),
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

    if (demoFlagStorageKey) {
      writes.push(
        normalizedSession.isDemoUser
          ? AsyncStorage.setItem(demoFlagStorageKey, 'true')
          : AsyncStorage.removeItem(demoFlagStorageKey),
      );
    }

    await Promise.all(writes);
    return normalizedSession;
  }, [
    accessTokenStorageKey,
    authStorageKey,
    compatibilityAccessTokenStorageKey,
    compatibilityRefreshTokenStorageKey,
    demoFlagStorageKey,
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
      rawStoredDemoFlag,
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
      demoFlagStorageKey ? AsyncStorage.getItem(demoFlagStorageKey) : Promise.resolve(null),
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
    const isDemoUser = String(rawStoredDemoFlag || '').trim().toLowerCase() === 'true';

    if (!resolvedAccessToken) {
      return null;
    }

    return normalizeSessionPayload({
      user:
        storedUser ||
        (isDemoUser && ENABLE_DEMO_LOGIN
          ? createDemoUserSession().user
          : rawStoredRole
            ? { role: rawStoredRole }
            : null),
      accessToken: resolvedAccessToken,
      refreshToken: resolvedRefreshToken,
      isDemoUser,
    });
  }, [
    accessTokenStorageKey,
    authStorageKey,
    compatibilityAccessTokenStorageKey,
    compatibilityRefreshTokenStorageKey,
    demoFlagStorageKey,
    logAuthDebug,
    refreshTokenStorageKey,
    roleStorageKey,
    userStorageKey,
  ]);

  const clearPersistedSession = useCallback(async () => {
    disconnectRealtimeSocket();
    setSessionState(null);
    setApiAccessToken(null);
    setDemoSessionActive(false);
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
      demoFlagStorageKey ? AsyncStorage.removeItem(demoFlagStorageKey) : Promise.resolve(),
      roleStorageKey ? AsyncStorage.removeItem(roleStorageKey) : Promise.resolve(),
    ]);
  }, [
    accessTokenStorageKey,
    authStorageKey,
    compatibilityAccessTokenStorageKey,
    compatibilityRefreshTokenStorageKey,
    demoFlagStorageKey,
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
        if (isDemoSessionActive()) {
          if (AUTH_DEBUG_ENABLED) {
            console.warn('[ExpoAuth] ignoring unauthorized response for demo session');
          }
          return;
        }

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
          demoFlagStorageKey,
          roleStorageKey,
          refreshTokenStorageKey,
          userStorageKey,
          debugClearOnStartupOnce: AUTH_CLEAR_ON_STARTUP_ONCE_ENABLED,
          demoLoginEnabled: ENABLE_DEMO_LOGIN,
          testAuthEnabled: ENABLE_TEST_AUTH,
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
          isDemoUser: parsed?.isDemoUser === true,
        });

        if (!parsed) {
          setSessionState(null);
          setApiAccessToken(null);
          setDemoSessionActive(false);
          return;
        }

        const storedAccessToken = parsed.accessToken;

        logAuthDebug('token loaded from storage', {
          hasAccessToken: Boolean(storedAccessToken),
          userRole: parsed?.user?.role || null,
          isDemoUser: parsed?.isDemoUser === true,
        });

        if (!storedAccessToken) {
          await clearPersistedSession();
          return;
        }

        const allowDemoSession = ENABLE_DEMO_LOGIN && parsed?.isDemoUser === true;

        setApiAccessToken(storedAccessToken);
        setDemoSessionActive(allowDemoSession, parsed);

        if (parsed?.isDemoUser) {
          if (!ENABLE_DEMO_LOGIN) {
            logAuthDebug('stale demo session detected while demo login disabled', {
              authStorageKey,
            });
            await clearPersistedSession();
            return;
          }

          setSessionState(parsed);
          await persistSession(parsed);
          return;
        }

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

        setDemoSessionActive(false);
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
    demoFlagStorageKey,
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
        setDemoSessionActive(Boolean(normalizedSession?.isDemoUser), normalizedSession);
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
