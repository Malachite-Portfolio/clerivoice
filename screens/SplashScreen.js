import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import AppLogo from '../components/AppLogo';
import { APP_MODE } from '../constants/api';

const SplashScreen = ({ navigation }) => {
  const { session, isHydrated } = useAuth();
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
      if (!isHydrated) {
        return;
      }
      if (session?.accessToken) {
        navigation.replace(session?.user?.role === 'LISTENER' ? 'ListenerHome' : 'MainDrawer');
        return;
      }

      navigation.replace(APP_MODE === 'listener' ? 'ListenerLogin' : 'Onboarding');
    }, 2500);

    return () => clearTimeout(timer);
  }, [isHydrated, navigation, opacity, scale, session?.accessToken, session?.user?.role]);

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
          Anonymous support, meaningful conversations
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
