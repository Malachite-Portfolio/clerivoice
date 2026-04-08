import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingLayout } from '../../components/layouts';
import { InputField } from '../../components/ui';
import theme from '../../theme';

const IDUploadScreen = ({
  idType,
  onCycleIdType,
  uploaded,
  onUploadPress,
  onBack,
  onNext,
  step,
  totalSteps,
}) => (
  <OnboardingLayout
    title="Upload"
    titleAccent="Government issued id"
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel={uploaded ? 'Submit for approval' : 'Upload image'}
    onCtaPress={uploaded ? onNext : onUploadPress}
  >
    <InputField
      value={idType}
      editable={false}
      onPress={onCycleIdType}
      rightElement={<Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />}
    />

    <Text style={styles.sampleTitle}>Sample</Text>

    <View style={styles.sampleCard}>
      <View style={styles.samplePreview} />
      <Ionicons name="close" size={26} color={theme.colors.error} />
    </View>

    <View style={styles.sampleCard}>
      <View style={styles.samplePreview} />
      <Ionicons name="checkmark" size={24} color={theme.colors.success} />
    </View>

    {uploaded ? <Text style={styles.success}>Uploaded successfully</Text> : null}
  </OnboardingLayout>
);

const styles = StyleSheet.create({
  sampleTitle: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.weights.semibold,
  },
  sampleCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  samplePreview: {
    flex: 1,
    height: 84,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  success: {
    marginTop: theme.spacing.xl,
    textAlign: 'center',
    color: theme.colors.success,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.semibold,
  },
});

export default IDUploadScreen;
