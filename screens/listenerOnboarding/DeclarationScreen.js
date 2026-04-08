import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { OnboardingLayout } from '../../components/layouts';
import theme from '../../theme';

const DeclarationScreen = ({ onBack, onNext, step, totalSteps }) => (
  <OnboardingLayout
    title="Declaration"
    subtitle="Submitting incorrect D.O.B is ILLEGAL"
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel="I Agree"
    onCtaPress={onNext}
    contentContainerStyle={styles.content}
  >
    <View style={styles.panel}>
      <Text style={styles.copy}>My date of birth is as per Aadhaar Card</Text>
    </View>
  </OnboardingLayout>
);

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  copy: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    textAlign: 'center',
    fontWeight: theme.typography.weights.medium,
  },
});

export default DeclarationScreen;
