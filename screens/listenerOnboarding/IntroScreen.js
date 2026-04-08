import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { OnboardingLayout } from '../../components/layouts';
import theme from '../../theme';

const IntroScreen = ({ onNext }) => (
  <OnboardingLayout
    title="Be a Listner"
    subtitle="Earn more than 30,000 per month"
    showStepper={false}
    ctaLabel="Next"
    onCtaPress={onNext}
    contentContainerStyle={styles.content}
  >
    <View style={styles.fillSpace} />
  </OnboardingLayout>
);

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  fillSpace: {
    minHeight: 360,
  },
});

export default IntroScreen;
