import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { FormLayout, OnboardingLayout, SelectionGridLayout } from '../../components/layouts';
import { InputField } from '../../components/ui';
import theme from '../../theme';

const ExperienceScreen = ({
  primaryOptions,
  reasonOptions,
  experienceType,
  experienceReason,
  experienceNote,
  onSelectType,
  onSelectReason,
  onChangeNote,
  onBack,
  onNext,
  step,
  totalSteps,
}) => (
  <OnboardingLayout
    title="Your"
    titleAccent="Experience"
    subtitle="Tell us your experience so we can match conversations better."
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel="Generate my Story"
    onCtaPress={onNext}
    ctaDisabled={!experienceType || !experienceReason}
  >
    <FormLayout>
      <Text style={styles.label}>What is your experience?</Text>
      <SelectionGridLayout
        options={primaryOptions.map((item) => ({ title: item, value: item }))}
        selectedValues={experienceType ? [experienceType] : []}
        onSelect={onSelectType}
      />

      <Text style={styles.label}>What was the reason of your experience?</Text>
      <SelectionGridLayout
        options={reasonOptions.map((item) => ({ title: item, value: item }))}
        selectedValues={experienceReason ? [experienceReason] : []}
        onSelect={onSelectReason}
      />

      <InputField
        label="Anything else that you would like to mention?"
        value={experienceNote}
        onChangeText={onChangeNote}
        placeholder="Start Typing..."
        maxLength={120}
        multiline
      />
    </FormLayout>
  </OnboardingLayout>
);

const styles = StyleSheet.create({
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
    marginBottom: theme.spacing.xs,
  },
});

export default ExperienceScreen;
