import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import {
  configureNavigationRoutes,
  flushPendingNavigationReset,
  navigationRef,
} from '../navigation/navigationRef';
import RealtimeRuntimeManager from '../components/RealtimeRuntimeManager';
import colors from '../constants/colors';
import { AuthProvider } from '../context/AuthContext';
import { AppVariantProvider } from '../context/AppVariantContext';
import { CallSessionProvider } from '../context/CallSessionContext';
import { WalletFlowProvider } from '../context/WalletFlowContext';
import { queryClient } from '../services/queryClient';
import { AUTH_DEBUG_ENABLED } from '../constants/api';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bgPrimary,
    card: colors.bgPrimary,
    border: 'transparent',
    text: colors.textPrimary,
    primary: colors.magenta,
  },
};

const AppShell = ({ NavigatorComponent, validateStoredSession, variantConfig }) => {
  configureNavigationRoutes(variantConfig);

  useEffect(() => {
    if (AUTH_DEBUG_ENABLED) {
      console.log('[AppShell] appStartup', {
        appVariant: variantConfig?.appVariantName || null,
        authEntryRouteName: variantConfig?.authEntryRouteName || null,
        homeRouteName: variantConfig?.homeRouteName || null,
      });
    }

    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
      if (AUTH_DEBUG_ENABLED) {
        console.log('[AppShell] appStateChanged', {
          status,
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppVariantProvider value={variantConfig}>
        <AuthProvider validateStoredSession={validateStoredSession}>
          <WalletFlowProvider>
            <CallSessionProvider>
              <NavigationContainer
                ref={navigationRef}
                theme={navigationTheme}
                onReady={flushPendingNavigationReset}
              >
                <StatusBar style="light" />
                <RealtimeRuntimeManager />
                <NavigatorComponent />
              </NavigationContainer>
            </CallSessionProvider>
          </WalletFlowProvider>
        </AuthProvider>
      </AppVariantProvider>
    </QueryClientProvider>
  );
};

export default AppShell;
