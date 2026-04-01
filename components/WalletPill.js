import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';

const WalletPill = ({ amount, onPress, style }) => {
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[styles.pill, style]}
      {...(onPress
        ? {
            activeOpacity: 0.82,
            onPress,
          }
        : {})}
    >
      <Ionicons
        name="wallet"
        size={14}
        color={theme.colors.textPrimary}
        style={styles.icon}
      />
      <Text style={styles.amount}>INR {amount}</Text>
    </Container>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(203, 25, 143, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.45)',
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  icon: {
    marginRight: 5,
  },
  amount: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});

export default WalletPill;
