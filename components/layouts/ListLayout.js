import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../../theme';

const ListLayout = ({ title, subtitle, children }) => (
  <View style={styles.container}>
    {title ? <Text style={styles.title}>{title}</Text> : null}
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    <View style={styles.listWrap}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacing.md,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.weights.bold,
  },
  subtitle: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
  },
  listWrap: {
    marginTop: theme.spacing.md,
  },
});

export default ListLayout;
