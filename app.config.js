const flavor =
  String(process.env.EXPO_PUBLIC_APP_FLAVOR || process.env.EXPO_PUBLIC_APP_MODE || 'user')
    .trim()
    .toLowerCase() === 'listener'
    ? 'listener'
    : 'user';

const isListener = flavor === 'listener';
const expoProjectId = String(process.env.EXPO_PUBLIC_EXPO_PROJECT_ID || '').trim();

module.exports = {
  expo: {
    name: isListener ? 'Clarivoice Listener' : 'Clarivoice User',
    slug: isListener ? 'clarivoice-listener' : 'clarivoice-user',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/logo/app-icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/logo/app-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#05020D',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: isListener ? 'com.clarivoice.listener' : 'com.clarivoice.user',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#05020D',
        foregroundImage: './assets/logo/app-icon.png',
      },
      allowBackup: false,
      package: isListener ? 'com.clarivoice.listener' : 'com.clarivoice.user',
    },
    web: {
      favicon: './assets/logo/app-icon.png',
    },
    extra: {
      appFlavor: flavor,
      eas: {
        projectId: expoProjectId || undefined,
      },
    },
  },
};
