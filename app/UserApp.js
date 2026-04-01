import React from 'react';
import AppShell from './AppShell';
import UserAppNavigator from '../navigation/user/UserAppNavigator';
import { validateStoredSession } from '../services/userSessionValidationApi';

const userVariantConfig = {
  appDisplayName: 'Clarivoice User',
  authEntryRouteName: 'PhoneNumber',
  homeRouteName: 'MainDrawer',
  sessionRoleName: 'USER',
  authStorageKey: 'clarivoice_user_session',
  accessTokenStorageKey: 'clarivoice_user_token',
  refreshTokenStorageKey: 'clarivoice_user_refresh_token',
  userStorageKey: 'clarivoice_user_user',
  compatibilityAccessTokenStorageKey: 'token',
  compatibilityRefreshTokenStorageKey: 'refreshToken',
  demoFlagStorageKey: 'isDemoUser',
  roleStorageKey: 'userRole',
  isListenerApp: false,
};

const UserApp = () => (
  <AppShell
    NavigatorComponent={UserAppNavigator}
    validateStoredSession={validateStoredSession}
    variantConfig={userVariantConfig}
  />
);

export default UserApp;
