import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import theme from '../constants/theme';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { useAppVariant } from '../context/AppVariantContext';
import { useCallSession } from '../context/CallSessionContext';
import AppLogo from '../components/AppLogo';
import {
  getAuthEntryRouteName,
  getCurrentRouteSnapshot,
  getHomeRouteName,
} from '../navigation/navigationRef';

const SplashScreen = ({ navigation }) => {
  const { session, isHydrated } = useAuth();
  const { activeCall, isCallStateHydrated } = useCallSession();
  const { appDisplayName, isListenerApp } = useAppVariant();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      const currentRoute = getCurrentRouteSnapshot();
      if (currentRoute?.name && currentRoute.name !== 'Splash') {
        if (AUTH_DEBUG_ENABLED) {
          console.log('[SplashScreen] navigation reset skipped because route already changed', {
            currentRoute: currentRoute.name,
          });
        }
        return;
      }

      if (!isHydrated) {
        return;
      }
      if (!isCallStateHydrated) {
        return;
      }
      if (session?.accessToken) {
        if (activeCall?.sessionId && activeCall?.params) {
          if (AUTH_DEBUG_ENABLED) {
            console.log('[SplashScreen] restoring active call route from global state', {
              sessionId: activeCall.sessionId,
              mode: activeCall.mode,
            });
          }
          navigation.reset({
            index: 0,
            routes: [{ name: 'CallSession', params: activeCall.params }],
          });
          return;
        }

        if (AUTH_DEBUG_ENABLED) {
            console.log('[SplashScreen] navigating to authenticated route', {
              role: session?.user?.role || null,
              targetRoute: getHomeRouteName(),
            });
        }
        navigation.reset({
          index: 0,
          routes: [{ name: getHomeRouteName() }],
        });
        return;
      }

      if (AUTH_DEBUG_ENABLED) {
        console.log('[SplashScreen] navigating to auth entry route', {
          targetRoute: getAuthEntryRouteName(),
        });
      }
      navigation.reset({
        index: 0,
        routes: [{ name: getAuthEntryRouteName() }],
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, [
    activeCall?.mode,
    activeCall?.params,
    activeCall?.sessionId,
    isCallStateHydrated,
    isHydrated,
    navigation,
    opacity,
    scale,
    session?.accessToken,
    session?.user?.role,
  ]);

  return (
    <LinearGradient
      colors={['#07010D', '#18041F', '#2A0A33']}
      style={styles.container}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <Animated.View
          style={[styles.logoWrap, { opacity, transform: [{ scale }] }]}
        >
          <View style={styles.glow} />
          <AppLogo size="lg" withCard={false} imageStyle={styles.logo} />
        </Animated.View>

        <Animated.Text style={[styles.tagline, { opacity }]}>
          {isListenerApp
            ? `${appDisplayName} keeps you ready for live calls and chats`
            : `${appDisplayName} keeps anonymous support one tap away`}
        </Animated.Text>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  glow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 17, 153, 0.22)',
    ...theme.shadow.glow,
  },
  logo: {
    width: 188,
    height: 72,
  },
  tagline: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontSize: theme.typography.body,
    letterSpacing: 0.2,
    lineHeight: 23,
    maxWidth: 290,
  },
});

export default SplashScreen;
