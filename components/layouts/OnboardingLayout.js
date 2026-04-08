import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme';
import { AppButton, Stepper } from '../ui';

const OnboardingLayout = ({
  title,
  titleAccent,
  subtitle,
  currentStep,
  totalSteps = 10,
  showStepper = true,
  onBack,
  showBack = false,
  ctaLabel = 'Next',
  onCtaPress,
  ctaDisabled = false,
  ctaLoading = false,
  ctaVariant = 'primary',
  children,
  contentContainerStyle,
  footerSlot = null,
}) => (
  <LinearGradient colors={theme.gradients.bg} style={styles.container}>
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          {showBack ? (
            <TouchableOpacity style={styles.backBtn} activeOpacity={0.85} onPress={onBack}>
              <Ionicons name="chevron-back" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backPlaceholder} />
          )}
        </View>

        {showStepper ? (
          <Stepper steps={totalSteps} currentStep={currentStep} style={styles.stepper} />
        ) : null}

        <Text style={styles.title}>
          {title}
          {titleAccent ? <Text style={styles.titleAccent}> {titleAccent}</Text> : null}
        </Text>

        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>

        {footerSlot}

        <AppButton
          title={ctaLabel}
          onPress={onCtaPress}
          disabled={ctaDisabled}
          loading={ctaLoading}
          variant={ctaVariant}
          style={styles.cta}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  </LinearGradient>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: theme.spacing.lg,
  },
  header: {
    minHeight: 40,
    justifyContent: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPlaceholder: {
    width: 34,
    height: 34,
  },
  stepper: {
    marginTop: theme.spacing.sm,
  },
  title: {
    marginTop: theme.spacing.xxl,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: theme.typography.h2,
    fontWeight: theme.typography.weights.medium,
  },
  titleAccent: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.bold,
  },
  subtitle: {
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: theme.typography.title,
    lineHeight: 22,
  },
  content: {
    flex: 1,
    marginTop: theme.spacing.xl,
  },
  contentContainer: {
    paddingBottom: theme.spacing.md,
  },
  cta: {
    marginTop: theme.spacing.md,
  },
});

export default OnboardingLayout;
