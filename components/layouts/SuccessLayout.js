import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme';

const SuccessLayout = ({ title, noteTitle = 'Note', note, footerText }) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    <View style={styles.iconWrap}>
      <Ionicons name="checkmark" size={42} color={theme.colors.background} />
    </View>

    <View style={styles.noteWrap}>
      <Text style={styles.noteTitle}>{noteTitle} :</Text>
      <Text style={styles.noteText}>{note}</Text>
    </View>

    {footerText ? <Text style={styles.footerText}>{footerText}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h2,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  iconWrap: {
    marginTop: theme.spacing.xl,
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteWrap: {
    marginTop: theme.spacing.xl,
    width: '100%',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: theme.spacing.md,
    minHeight: 130,
  },
  noteTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.semibold,
  },
  noteText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 20,
  },
  footerText: {
    marginTop: theme.spacing.xl,
    color: theme.colors.success,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.semibold,
  },
});

export default SuccessLayout;
