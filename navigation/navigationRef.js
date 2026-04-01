import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

let pendingResetRouteName = null;
let pendingNavigateAction = null;
let authEntryRouteName = null;
let homeRouteName = null;

export const configureNavigationRoutes = (config = {}) => {
  if (config.authEntryRouteName) {
    authEntryRouteName = config.authEntryRouteName;
  }

  if (config.homeRouteName) {
    homeRouteName = config.homeRouteName;
  }
};

export const getAuthEntryRouteName = () => authEntryRouteName;

export const getHomeRouteName = () => homeRouteName;

const dispatchReset = (routeName) => {
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: routeName }],
    }),
  );
};

const dispatchNavigate = (routeName, params) => {
  navigationRef.dispatch(
    CommonActions.navigate({
      name: routeName,
      params,
    }),
  );
};

export const resetToRoute = (routeName) => {
  if (!routeName) {
    return false;
  }

  if (!navigationRef.isReady()) {
    pendingResetRouteName = routeName;
    return false;
  }

  pendingResetRouteName = null;
  dispatchReset(routeName);
  return true;
};

export const resetToAuthEntry = () => resetToRoute(getAuthEntryRouteName());

export const navigateToRoute = (routeName, params) => {
  if (!routeName) {
    return false;
  }

  if (!navigationRef.isReady()) {
    pendingNavigateAction = { routeName, params };
    return false;
  }

  pendingNavigateAction = null;
  dispatchNavigate(routeName, params);
  return true;
};

export const getCurrentRouteSnapshot = () => {
  if (!navigationRef.isReady()) {
    return null;
  }

  return navigationRef.getCurrentRoute() || null;
};

export const flushPendingNavigationReset = () => {
  if (!navigationRef.isReady()) {
    return false;
  }

  let didFlush = false;

  if (pendingResetRouteName) {
    const routeName = pendingResetRouteName;
    pendingResetRouteName = null;
    dispatchReset(routeName);
    didFlush = true;
  }

  if (pendingNavigateAction) {
    const { routeName, params } = pendingNavigateAction;
    pendingNavigateAction = null;
    dispatchNavigate(routeName, params);
    didFlush = true;
  }

  return didFlush;
};
