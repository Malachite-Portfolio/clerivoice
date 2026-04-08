import React from 'react';
import { StyleSheet, View } from 'react-native';
import theme from '../../theme';

const FormLayout = ({ children, style }) => <View style={[styles.container, style]}>{children}</View>;

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
});

export default FormLayout;
