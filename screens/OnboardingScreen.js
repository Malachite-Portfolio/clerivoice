import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import GradientButton from '../components/GradientButton';
import { onboardingSlides } from '../constants/mockData';
import theme from '../constants/theme';
import AppLogo from '../components/AppLogo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const OnboardingScreen = ({ navigation }) => {
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  const onMomentumEnd = useCallback((event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    setActiveIndex(Math.round(offsetX / SCREEN_WIDTH));
  }, []);

  const renderItem = ({ item }) => {
    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <AppLogo size="sm" style={styles.logoCard} />

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>

        <View style={styles.illustrationShell}>
          <Image source={item.image} style={styles.illustration} resizeMode="cover" />
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Animated.FlatList
          data={onboardingSlides}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={renderItem}
          bounces={false}
          onMomentumScrollEnd={onMomentumEnd}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          contentContainerStyle={styles.sliderContent}
        />

        <View style={styles.paginationWrap}>
          {onboardingSlides.map((slide, index) => {
            const inputRange = [
              (index - 1) * SCREEN_WIDTH,
              index * SCREEN_WIDTH,
              (index + 1) * SCREEN_WIDTH,
            ];

            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.4, 1, 0.4],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={slide.id}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor:
                      index === activeIndex
                        ? theme.colors.textPrimary
                        : 'rgba(255,255,255,0.45)',
                  },
                ]}
              />
            );
          })}
        </View>
      </SafeAreaView>

      <LinearGradient
        colors={theme.gradients.panel}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bottomPanel}
      >
        <Text style={styles.panelTitle}>Get Clarivoice</Text>

        <GradientButton
          title="Continue via phone"
          iconName="phone-portrait"
          onPress={() => navigation.navigate('PhoneNumber')}
          gradientColors={['#0F081A', '#120A1F']}
          style={styles.ctaButton}
          textStyle={styles.ctaText}
        />

        <Text style={styles.policyText}>
          By clicking i accept the T&C and Privacy Policy
        </Text>

        <TouchableOpacity
          style={styles.listenerEntry}
          onPress={() => navigation.navigate('ListenerLogin')}
          activeOpacity={0.85}
        >
          <Text style={styles.listenerEntryText}>Listener Login</Text>
        </TouchableOpacity>
      </LinearGradient>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  sliderContent: {
    paddingBottom: 210,
  },
  slide: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  logoCard: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 34,
    maxWidth: 280,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.title,
    marginTop: 4,
  },
  illustrationShell: {
    flex: 1,
    marginTop: 12,
    borderRadius: 34,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  illustration: {
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_HEIGHT * 0.64,
    borderRadius: 34,
  },
  paginationWrap: {
    position: 'absolute',
    right: 20,
    bottom: 198,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 30,
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    fontWeight: '700',
    marginBottom: 12,
  },
  ctaButton: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
  },
  ctaText: {
    color: theme.colors.magenta,
    fontSize: 14,
  },
  policyText: {
    marginTop: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
  },
  listenerEntry: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  listenerEntryText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});

export default OnboardingScreen;
