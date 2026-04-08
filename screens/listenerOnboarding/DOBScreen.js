import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormLayout, OnboardingLayout } from '../../components/layouts';
import { AppModalSheet, InputField } from '../../components/ui';
import theme from '../../theme';

const formatDate = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const quickDates = [
  new Date(1999, 5, 20),
  new Date(1998, 3, 12),
  new Date(1997, 9, 7),
  new Date(1996, 0, 1),
];

const DOBScreen = ({ value, onChange, onBack, onNext, step, totalSteps }) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const canContinue = useMemo(() => Boolean(String(value || '').trim()), [value]);

  return (
    <>
      <OnboardingLayout
        title="Date"
        titleAccent="of birth"
        currentStep={step}
        totalSteps={totalSteps}
        showBack
        onBack={onBack}
        ctaLabel="Next"
        onCtaPress={onNext}
        ctaDisabled={!canContinue}
      >
        <FormLayout>
          <InputField
            value={value}
            placeholder="DD-MM-YYYY"
            iconName="calendar"
            onPress={() => setCalendarOpen(true)}
            editable={false}
          />
        </FormLayout>
      </OnboardingLayout>

      <AppModalSheet
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        title="Calendar"
      >
        <View style={styles.modalBody}>
          <Text style={styles.modalSubtitle}>Select your date of birth</Text>
          <View style={styles.dateList}>
            {quickDates.map((date) => {
              const label = formatDate(date);
              return (
                <TouchableOpacity
                  key={label}
                  style={styles.dateBtn}
                  activeOpacity={0.88}
                  onPress={() => {
                    onChange(label);
                    setCalendarOpen(false);
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={theme.colors.textPrimary} />
                  <Text style={styles.dateBtnText}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </AppModalSheet>
    </>
  );
};

const styles = StyleSheet.create({
  modalBody: {
    minHeight: 220,
  },
  modalSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  dateList: {
    gap: theme.spacing.sm,
  },
  dateBtn: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dateBtnText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.semibold,
  },
});

export default DOBScreen;
