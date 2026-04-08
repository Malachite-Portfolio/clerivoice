import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OnboardingLayout, SelectionGridLayout } from '../../components/layouts';
import theme from '../../theme';

const NameSelectionScreen = ({
  options,
  selectedName,
  onSelect,
  onRegenerate,
  onBack,
  onNext,
  step,
  totalSteps,
}) => (
  <OnboardingLayout
    title="Select"
    titleAccent="Your Name"
    subtitle="Your real name is not used to keep your identity private."
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel="Next"
    onCtaPress={onNext}
    ctaDisabled={!selectedName}
  >
    <SelectionGridLayout
      options={options.map((item) => ({ title: item, value: item }))}
      selectedValues={selectedName ? [selectedName] : []}
      onSelect={onSelect}
    />

    <TouchableOpacity style={styles.refreshBtn} activeOpacity={0.86} onPress={onRegenerate}>
      <Text style={styles.refreshText}>Get new Names</Text>
    </TouchableOpacity>
  </OnboardingLayout>
);

const styles = StyleSheet.create({
  refreshBtn: {
    marginTop: theme.spacing.xl,
    alignSelf: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  refreshText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.weights.medium,
  },
});

export default NameSelectionScreen;
