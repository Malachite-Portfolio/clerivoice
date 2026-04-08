import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingLayout } from '../../components/layouts';
import theme from '../../theme';

const points = [
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Talk to users like a friend',
    description: 'give them positivity and hope',
  },
  {
    icon: 'time-outline',
    title: '3-hours daily commitment',
    description: 'on your own comfort and availability',
  },
  {
    icon: 'calendar-outline',
    title: '6 leaves every month',
    description: 'for flexibility and well-being',
  },
];

const JobRoleScreen = ({ onBack, onNext, step, totalSteps }) => (
  <OnboardingLayout
    title="Listner"
    titleAccent="Job Role"
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel="Next"
    onCtaPress={onNext}
    footerSlot={
      <Text style={styles.footerCopy}>Please proceed only if this suits you</Text>
    }
  >
    <View style={styles.list}>
      {points.map((point) => (
        <View key={point.title} style={styles.pointRow}>
          <Ionicons name={point.icon} size={22} color={theme.colors.textPrimary} />
          <View style={styles.pointTextWrap}>
            <Text style={styles.pointTitle}>{point.title}</Text>
            <Text style={styles.pointDescription}>{point.description}</Text>
          </View>
        </View>
      ))}
    </View>
  </OnboardingLayout>
);

const styles = StyleSheet.create({
  list: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xl,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  pointTextWrap: {
    flex: 1,
  },
  pointTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.weights.semibold,
  },
  pointDescription: {
    marginTop: 3,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.title,
    lineHeight: 20,
  },
  footerCopy: {
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: theme.typography.title,
  },
});

export default JobRoleScreen;
