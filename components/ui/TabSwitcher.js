import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import theme from '../../theme';

const TabSwitcher = ({ tabs = [], activeTab, onChange, style }) => (
  <ScrollView
    horizontal
    style={style}
    contentContainerStyle={styles.row}
    showsHorizontalScrollIndicator={false}
  >
    {tabs.map((tab) => {
      const key = typeof tab === 'string' ? tab : tab.key;
      const label = typeof tab === 'string' ? tab : tab.label;
      const isActive = activeTab === key;

      return (
        <TouchableOpacity
          key={key}
          style={[styles.tab, isActive ? styles.tabActive : null]}
          activeOpacity={0.88}
          onPress={() => onChange(key)}
        >
          <Text style={[styles.text, isActive ? styles.textActive : null]}>{label}</Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  row: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  tab: {
    minWidth: 90,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  tabActive: {
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.glow,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.medium,
  },
  textActive: {
    color: theme.colors.white,
    fontWeight: theme.typography.weights.semibold,
  },
});

export default TabSwitcher;
