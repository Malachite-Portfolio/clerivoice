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
      <Text style={styles.amount}>{'\u20B9'} {amount}</Text>
    </Container>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(152, 37, 117, 0.23)',
    borderWidth: 1,
    borderColor: 'rgba(152, 37, 117, 0.7)',
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  icon: {
    marginRight: 5,
  },
  amount: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default WalletPill;
