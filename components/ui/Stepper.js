import React from 'react';
import { StyleSheet, View } from 'react-native';
import theme from '../../theme';

const Stepper = ({ steps = 10, currentStep = 1, style }) => {
  const normalizedCurrent = Math.max(1, Math.min(currentStep, steps));

  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: steps }).map((_, index) => {
        const step = index + 1;
        const active = step <= normalizedCurrent;
        return (
          <View
            key={`step-${step}`}
            style={[styles.segment, active ? styles.segmentActive : null]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
    opacity: 0.35,
  },
  segmentActive: {
    opacity: 1,
    backgroundColor: theme.colors.primary,
  },
});

export default Stepper;
