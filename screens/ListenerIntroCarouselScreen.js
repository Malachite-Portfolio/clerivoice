import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import theme from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    id: 'listener-intro-1',
    title: 'Be a Listner',
    subtitle: 'Earn more than 30,000 per month',
  },
  {
    id: 'listener-intro-2',
    title: 'Talk with empathy',
    subtitle: 'Help people feel heard with safe conversations.',
  },
  {
    id: 'listener-intro-3',
    title: 'Work on your time',
    subtitle: 'Go online when available and grow with real sessions.',
  },
];

const ListenerIntroCarouselScreen = ({ navigation }) => {
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  const activeSlide = useMemo(() => SLIDES[activeIndex] || SLIDES[0], [activeIndex]);

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <Animated.FlatList
          data={SLIDES}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onMomentumScrollEnd={(event) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            setActiveIndex(Math.round(offsetX / SCREEN_WIDTH));
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false },
          )}
          renderItem={() => <View style={{ width: SCREEN_WIDTH }} />}
          scrollEventThrottle={16}
          contentContainerStyle={styles.sliderContent}
        />

        <View style={styles.centerWrap}>
          <Text style={styles.title}>{activeSlide.title}</Text>
          <Text style={styles.subtitle}>{activeSlide.subtitle}</Text>
        </View>

        <View style={styles.paginationWrap}>
          {SLIDES.map((slide, index) => {
            const inputRange = [
              (index - 1) * SCREEN_WIDTH,
              index * SCREEN_WIDTH,
              (index + 1) * SCREEN_WIDTH,
            ];

            const width = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });

            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={slide.id}
                style={[
                  styles.dot,
                  {
                    width,
                    opacity,
                    backgroundColor:
                      index === activeIndex ? theme.colors.magenta : 'rgba(255,255,255,0.4)',
                  },
                ]}
              />
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('PhoneNumber', { role: 'listener' })}
        >
          <Text style={styles.ctaLabel}>Continue via phone</Text>
        </TouchableOpacity>
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
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  sliderContent: {
    flexGrow: 1,
  },
  centerWrap: {
    position: 'absolute',
    top: '36%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 44 / 1.35,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    color: theme.colors.textSecondary,
    fontSize: 31 / 2.2,
    lineHeight: 21,
    textAlign: 'center',
  },
  paginationWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    height: 6,
    borderRadius: 6,
  },
  ctaButton: {
    marginHorizontal: 20,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(207, 36, 155, 0.78)',
    backgroundColor: theme.colors.magenta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default ListenerIntroCarouselScreen;
