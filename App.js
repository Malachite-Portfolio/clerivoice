import { APP_FLAVOR } from './constants/api';

if (typeof __DEV__ !== 'undefined' && !__DEV__) {
  console.log = () => {};
  console.warn = () => {};
}

const SelectedApp =
  APP_FLAVOR === 'listener'
    ? require('./app/ListenerApp').default
    : require('./app/UserApp').default;

export default SelectedApp;
