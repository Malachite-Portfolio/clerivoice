import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useWalletFlow } from '../context/WalletFlowContext';
import { queryKeys } from '../services/queryClient';
import { fetchReferralFaq, fetchReferralHistory, fetchReferralInfo } from '../services/walletApi';

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(0)}`;

const InviteFriendsScreen = ({ navigation }) => {
  const { session } = useAuth();
  const { referralCode, setReferralCode } = useWalletFlow();
  const [openFaqIndex, setOpenFaqIndex] = useState(0);

  const referralQuery = useQuery({
    queryKey: queryKeys.referral.me,
    queryFn: fetchReferralInfo,
    enabled: Boolean(session?.accessToken),
    staleTime: 30000,
  });

  const faqQuery = useQuery({
    queryKey: queryKeys.referral.faq,
    queryFn: fetchReferralFaq,
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60 * 1000,
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.referral.history,
    queryFn: fetchReferralHistory,
    enabled: Boolean(session?.accessToken),
    staleTime: 60000,
  });

  const referral = referralQuery.data;
  const codeToShow = referral?.referralCode || referralCode || '--';

  useEffect(() => {
    if (referral?.referralCode && referral?.referralCode !== referralCode) {
      setReferralCode(referral.referralCode);
    }
  }, [referral?.referralCode, referralCode, setReferralCode]);

  const referralCount = useMemo(
    () => (historyQuery.data?.inviterHistory || referral?.referrals || []).length,
    [historyQuery.data?.inviterHistory, referral?.referrals],
  );

  const handleCopy = async () => {
    await Clipboard.setStringAsync(codeToShow);
    Alert.alert('Copied', 'Referral code copied to clipboard.');
  };

  const handleShare = async () => {
    const message =
      referral?.sharePayload?.message ||
      `Use my referral code ${codeToShow} on Clarivoice and unlock rewards.`;
    await Share.share({
      title: referral?.sharePayload?.title || 'Join Clarivoice',
      message,
    });
  };

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerIcon}
            activeOpacity={0.82}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Invite Friends & Earn</Text>

          <View style={styles.headerGhost} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <LinearGradient colors={['#441133', '#731A58', '#2C102B']} style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Clarivoice Referral</Text>
            <Text style={styles.heroTitle}>Invite your circle and earn wallet rewards.</Text>
            <Text style={styles.heroSubtitle}>
              {referral?.rewardDescription || 'Every qualifying friend recharge adds bonus money to your wallet.'}
            </Text>

            <View style={styles.heroBadges}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeLabel}>You earn</Text>
                <Text style={styles.heroBadgeValue}>{formatCurrency(referral?.inviterReward || 55)}</Text>
              </View>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeLabel}>Friend gets</Text>
                <Text style={styles.heroBadgeValue}>{formatCurrency(referral?.referredReward || 50)}</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.rewardCard}>
            <View style={styles.rewardStat}>
              <Text style={styles.rewardLabel}>Total Earned</Text>
              <Text style={styles.rewardValue}>{formatCurrency(referral?.totalEarned || 0)}</Text>
            </View>
            <View style={styles.rewardDivider} />
            <View style={styles.rewardStat}>
              <Text style={styles.rewardLabel}>Friends Invited</Text>
              <Text style={styles.rewardValue}>{referralCount}</Text>
            </View>
            <View style={styles.rewardDivider} />
            <View style={styles.rewardStat}>
              <Text style={styles.rewardLabel}>Qualifying Recharge</Text>
              <Text style={styles.rewardValue}>{formatCurrency(referral?.qualifyingAmount || 500)}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.88} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={18} color={theme.colors.textPrimary} />
            <Text style={styles.primaryButtonText}>Invite Now</Text>
          </TouchableOpacity>

          <View style={styles.codeCard}>
            <Text style={styles.sectionTitle}>Referral Code</Text>
            <Text style={styles.codeValue}>{codeToShow}</Text>
            <Text style={styles.codeMeta}>
              {referral?.friendRewardDescription || 'Share this code with friends to unlock rewards.'}
            </Text>

            <View style={styles.codeActions}>
              <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.88} onPress={handleCopy}>
                <Ionicons name="copy-outline" size={18} color={theme.colors.textPrimary} />
                <Text style={styles.secondaryButtonText}>Copy Code</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.88} onPress={handleShare}>
                <Ionicons name="paper-plane-outline" size={18} color={theme.colors.textPrimary} />
                <Text style={styles.secondaryButtonText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.faqWrap}>
            <Text style={styles.sectionTitle}>FAQs</Text>

            {(faqQuery.data || []).map((faq, index) => {
              const open = openFaqIndex === index;
              return (
                <TouchableOpacity
                  key={`${faq.question}-${index}`}
                  style={styles.faqCard}
                  activeOpacity={0.88}
                  onPress={() => setOpenFaqIndex(open ? -1 : index)}
                >
                  <View style={styles.faqTop}>
                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                    <MaterialCommunityIcons
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={theme.colors.magenta}
                    />
                  </View>
                  {open ? <Text style={styles.faqAnswer}>{faq.answer}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  headerGhost: {
    width: 40,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 30,
    padding: 22,
    ...theme.shadow.card,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 10,
    lineHeight: 34,
    maxWidth: 260,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  heroBadge: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroBadgeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  heroBadgeValue: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 8,
  },
  rewardCard: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(24,13,34,0.96)',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rewardStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rewardLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  rewardValue: {
    marginTop: 8,
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 18,
    borderRadius: 22,
    minHeight: 56,
    backgroundColor: theme.colors.magenta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...theme.shadow.glow,
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  codeCard: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(23,13,34,0.96)',
    padding: 18,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  codeValue: {
    marginTop: 14,
    color: theme.colors.magenta,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
  },
  codeMeta: {
    marginTop: 10,
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  codeActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.12)',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  faqWrap: {
    marginTop: 20,
    gap: 12,
  },
  faqCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(24,13,34,0.96)',
    padding: 16,
  },
  faqTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  faqAnswer: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});

export default InviteFriendsScreen;
