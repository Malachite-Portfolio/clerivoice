import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme';
import { ProfileAvatar, TabSwitcher } from '../ui';

const DashboardLayout = ({
  avatarSource,
  name,
  statusText,
  statusOnline,
  walletLabel,
  tabs,
  activeTab,
  onChangeTab,
  onMenuPress,
  onWalletPress,
  children,
}) => (
  <View>
    <View style={styles.headerRow}>
      <TouchableOpacity style={styles.leftProfile} onPress={onMenuPress} activeOpacity={0.85}>
        <ProfileAvatar source={avatarSource} size={52} showOnline online={statusOnline} />
        <View style={styles.nameWrap}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.status}>{statusText}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.walletPill} onPress={onWalletPress} activeOpacity={0.85}>
        <Ionicons name="wallet-outline" size={16} color={theme.colors.primary} />
        <Text style={styles.walletText}>{walletLabel}</Text>
      </TouchableOpacity>
    </View>

    <TabSwitcher tabs={tabs} activeTab={activeTab} onChange={onChangeTab} style={styles.tabs} />

    {children}
  </View>
);

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  leftProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  nameWrap: {
    marginLeft: theme.spacing.sm,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.weights.bold,
  },
  status: {
    marginTop: 2,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
  },
  walletPill: {
    borderRadius: theme.radius.round,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  walletText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: theme.typography.weights.bold,
  },
  tabs: {
    marginTop: theme.spacing.sm,
  },
});

export default DashboardLayout;
