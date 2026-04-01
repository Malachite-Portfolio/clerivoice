import { APP_FLAVOR } from '../constants/api';

const SelectedNavigator =
  APP_FLAVOR === 'listener'
    ? require('./listener/ListenerAppNavigator').default
    : require('./user/UserAppNavigator').default;

export default SelectedNavigator;
