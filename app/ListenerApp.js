import React from 'react';
import AppShell from './AppShell';
import ListenerAppNavigator from '../navigation/listener/ListenerAppNavigator';
import { validateStoredSession } from '../services/listenerSessionValidationApi';

const listenerVariantConfig = {
  appDisplayName: 'Clarivoice Listener',
  authEntryRouteName: 'ListenerLogin',
  homeRouteName: 'ListenerHome',
  sessionRoleName: 'LISTENER',
  authStorageKey: 'clarivoice_listener_session',
  accessTokenStorageKey: 'clarivoice_listener_token',
  refreshTokenStorageKey: 'clarivoice_listener_refresh_token',
  userStorageKey: 'clarivoice_listener_user',
  isListenerApp: true,
};

const ListenerApp = () => (
  <AppShell
    NavigatorComponent={ListenerAppNavigator}
    validateStoredSession={validateStoredSession}
    variantConfig={listenerVariantConfig}
  />
);

export default ListenerApp;
