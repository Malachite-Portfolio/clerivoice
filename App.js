import { APP_FLAVOR } from './constants/api';

const SelectedApp =
  APP_FLAVOR === 'listener'
    ? require('./app/ListenerApp').default
    : require('./app/UserApp').default;

export default SelectedApp;
