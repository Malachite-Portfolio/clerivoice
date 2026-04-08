import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import WalletPill from '../components/WalletPill';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useWalletFlow } from '../context/WalletFlowContext';
import { queryKeys } from '../services/queryClient';
import {
  createWalletOrder,
  fetchReferralInfo,
  fetchWalletHistory,
  fetchWalletPlans,
  fetchWalletSummary,
  verifyWalletPayment,
} from '../services/walletApi';

const TABS = ['Recharge', 'History'];
const PAYMENT_METHODS = [
  { key: 'UPI', label: 'UPI', icon: 'phone-portrait-outline' },
  { key: 'CARD', label: 'Card', icon: 'card-outline' },
  { key: 'NETBANKING', label: 'Net Banking', icon: 'globe-outline' },
];

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(0)}`;

const formatDateTime = (value) => {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getTransactionTitle = (item) => {
  const type = String(item?.type || '').toUpperCase();

  switch (type) {
    case 'RECHARGE':
      return 'Wallet Recharge';
    case 'REFERRAL_BONUS':
      return 'Referral Reward';
    case 'PROMO_CREDIT':
      return 'Promo Credit';
    case 'CALL_DEBIT':
      return 'Call Usage';
    case 'CHAT_DEBIT':
      return 'Chat Usage';
    case 'ADMIN_DEBIT':
      return 'Wallet Adjustment';
    default:
      return 'Wallet Update';
  }
};

const isCreditTransaction = (item) =>
  ['RECHARGE', 'REFERRAL_BONUS', 'PROMO_CREDIT'].includes(String(item?.type || '').toUpperCase());

const normalizePlanOption = (plan, index = 0) => {
  const amount = Number(plan?.amount || plan || 0);
  const talktime = Number(plan?.talktime || amount);
  const numericPlanId = Number(plan?.id);

  return {
    id: plan?.id ?? `fallback-${amount}-${index}`,
    planId: Number.isFinite(numericPlanId) ? numericPlanId : null,
    amount,
    talktime,
    label: plan?.label || `Recharge ${formatCurrency(amount)}`,
  };
};

const MyWalletScreen = ({ navigation, route }) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const {
    selectedPlan,
    selectedCoupon,
    currentBalance,
    referralCode,
    setSelectedPlan,
    clearCouponSelection,
    setCurrentBalance,
    setReferralCode,
  } = useWalletFlow();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0].key);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const summaryQuery = useQuery({
    queryKey: queryKeys.wallet.summary,
    queryFn: fetchWalletSummary,
    enabled: Boolean(session?.accessToken),
    staleTime: 10000,
  });

  const plansQuery = useQuery({
    queryKey: queryKeys.wallet.plans,
    queryFn: fetchWalletPlans,
    enabled: Boolean(session?.accessToken),
    staleTime: 60000,
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.wallet.history({ limit: 20 }),
    queryFn: () => fetchWalletHistory({ page: 1, limit: 20 }),
    enabled: Boolean(session?.accessToken) && activeTab === 'History',
    staleTime: 10000,
  });

  const referralQuery = useQuery({
    queryKey: queryKeys.referral.me,
    queryFn: fetchReferralInfo,
    enabled: Boolean(session?.accessToken),
    staleTime: 30000,
  });

  const planOptions = useMemo(() => {
    if (Array.isArray(plansQuery.data) && plansQuery.data.length) {
      return plansQuery.data.map((plan, index) => normalizePlanOption(plan, index));
    }

    if (Array.isArray(summaryQuery.data?.plans) && summaryQuery.data.plans.length) {
      return summaryQuery.data.plans.map((amount, index) => normalizePlanOption({ amount }, index));
    }

    return [159, 249, 449].map((amount, index) => normalizePlanOption({ amount }, index));
  }, [plansQuery.data, summaryQuery.data?.plans]);

  useEffect(() => {
    if (typeof summaryQuery.data?.balance === 'number') {
      setCurrentBalance(summaryQuery.data.balance);
    }
  }, [setCurrentBalance, summaryQuery.data?.balance]);

  useEffect(() => {
    if (referralQuery.data?.referralCode) {
      setReferralCode(referralQuery.data.referralCode);
    }
  }, [referralQuery.data?.referralCode, setReferralCode]);

  useEffect(() => {
    if (!planOptions.length) {
      return;
    }

    if (!selectedPlan) {
      setSelectedPlan(planOptions[0]);
      return;
    }

    const matchingPlan = planOptions.find((plan) =>
      selectedPlan.planId ? plan.planId === selectedPlan.planId : plan.amount === selectedPlan.amount,
    );

    if (
      matchingPlan &&
      (matchingPlan.amount !== selectedPlan.amount ||
        matchingPlan.planId !== selectedPlan.planId ||
        matchingPlan.talktime !== selectedPlan.talktime)
    ) {
      setSelectedPlan(matchingPlan);
    }
  }, [planOptions, selectedPlan, setSelectedPlan]);

  useEffect(() => {
    if (route.params?.couponAppliedAt) {
      console.log('[Wallet] route navigation', {
        route: 'MyWallet',
        couponCode: route.params?.couponCode || null,
        couponAppliedAt: route.params.couponAppliedAt,
      });
    }
  }, [route.params?.couponAppliedAt, route.params?.couponCode]);

  const displayBalance =
    typeof summaryQuery.data?.balance === 'number' ? summaryQuery.data.balance : currentBalance;
  const rechargeAmount = selectedPlan?.amount || 0;
  const talktimeAmount = selectedPlan?.talktime || rechargeAmount;
  const couponMatchesSelection = selectedCoupon && selectedCoupon.amount === rechargeAmount;
  const discountAmount = couponMatchesSelection ? selectedCoupon.discountAmount : 0;
  const payableAmount = couponMatchesSelection ? selectedCoupon.payableAmount : rechargeAmount;

  const rechargeMutation = useMutation({
    mutationFn: async () => {
      if (!rechargeAmount) {
        throw new Error('Please choose a recharge amount first.');
      }

      console.log('[Wallet] recharge button press', {
        amount: rechargeAmount,
        planId: selectedPlan?.planId || null,
        paymentMethod: selectedMethod,
        couponCode: couponMatchesSelection ? selectedCoupon.code : null,
      });

      const order = await createWalletOrder({
        ...(selectedPlan?.planId ? { planId: selectedPlan.planId } : { amount: rechargeAmount }),
        couponCode: couponMatchesSelection ? selectedCoupon.code : undefined,
        paymentMethod: selectedMethod,
        metadata: {
          source: 'mobile-wallet',
        },
      });

      if (String(order?.provider || '').toUpperCase() === 'MOCK') {
        const verification = await verifyWalletPayment({
          orderId: order.orderId,
          gatewayPaymentId: `mock_pay_${Date.now()}`,
          method: selectedMethod,
          metadata: {
            simulated: true,
          },
        });

        return {
          order,
          verification,
          simulated: true,
        };
      }

      return {
        order,
        verification: null,
        simulated: false,
      };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary }),
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.history({ limit: 20 }) }),
      ]);

      if (result?.verification?.walletSummary?.balance !== undefined) {
        setCurrentBalance(result.verification.walletSummary.balance);
      }

      clearCouponSelection();

      if (result?.simulated) {
        Alert.alert(
          'Recharge complete',
          `Your wallet balance is now ${formatCurrency(
            result?.verification?.walletSummary?.balance || displayBalance,
          )}.`,
        );
        return;
      }

      Alert.alert(
        'Payment order created',
        'Your recharge order was created successfully. Payment gateway handoff is not wired in this build yet.',
      );
    },
    onError: (error) => {
      Alert.alert(
        'Recharge unavailable',
        error?.response?.data?.message || error?.message || 'We could not start this recharge right now.',
      );
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary }),
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.plans }),
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.history({ limit: 20 }) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.referral.me }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const navigateToOffers = () => {
    console.log('[Wallet] route navigation', {
      from: 'MyWallet',
      to: 'Offers',
      amount: rechargeAmount,
    });
    navigation.navigate('Offers', {
      amount: rechargeAmount,
    });
  };

  const navigateToInviteFriends = () => {
    console.log('[Wallet] route navigation', {
      from: 'MyWallet',
      to: 'InviteFriends',
    });
    navigation.navigate('InviteFriends');
  };

  const handlePlanPress = (plan) => {
    if (selectedCoupon && selectedCoupon.amount !== plan.amount) {
      clearCouponSelection();
    }
    setSelectedPlan(plan);
  };

  const historyItems = historyQuery.data?.items || [];

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

          <Text style={styles.headerTitle}>My Wallet</Text>

          <WalletPill amount={displayBalance || 0} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.magenta}
            />
          }
        >
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroEyebrow}>Wallet Balance</Text>
                <Text style={styles.heroAmount}>{formatCurrency(displayBalance)}</Text>
              </View>

              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaLabel}>Referral Code</Text>
                <Text style={styles.heroMetaValue}>
                  {referralQuery.isLoading ? 'Loading...' : referralQuery.data?.referralCode || referralCode || '--'}
                </Text>
              </View>
            </View>

            <View style={styles.heroStats}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total Recharged</Text>
                <Text style={styles.statValue}>{formatCurrency(summaryQuery.data?.totalRecharged || 0)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Referral Earned</Text>
                <Text style={styles.statValue}>{formatCurrency(summaryQuery.data?.referralEarned || 0)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.tabRow}>
            {TABS.map((tab) => {
              const active = tab === activeTab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  activeOpacity={0.88}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeTab === 'Recharge' ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Recharge Amount</Text>
                <View style={styles.chipGrid}>
                  {planOptions.map((plan) => {
                    const active =
                      selectedPlan?.planId
                        ? selectedPlan.planId === plan.planId
                        : selectedPlan?.amount === plan.amount;

                    return (
                      <TouchableOpacity
                        key={plan.id}
                        style={[styles.amountChip, active && styles.amountChipActive]}
                        activeOpacity={0.88}
                        onPress={() => handlePlanPress(plan)}
                      >
                        <Text style={[styles.amountChipAmount, active && styles.amountChipAmountActive]}>
                          {formatCurrency(plan.amount)}
                        </Text>
                        <Text style={[styles.amountChipMeta, active && styles.amountChipMetaActive]}>
                          Talktime {formatCurrency(plan.talktime)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.sectionTitle}>Recharge Summary</Text>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Talktime</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(talktimeAmount)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Amount</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(rechargeAmount)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Coupon Discount</Text>
                  <Text style={[styles.summaryValue, discountAmount > 0 ? styles.discountValue : null]}>
                    - {formatCurrency(discountAmount)}
                  </Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryRowStrong]}>
                  <Text style={styles.summaryLabelStrong}>Amount Payable</Text>
                  <Text style={styles.summaryValueStrong}>{formatCurrency(payableAmount)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.linkCard}
                  activeOpacity={0.9}
                  onPress={navigateToOffers}
                >
                  <View style={styles.linkCardLeft}>
                    <MaterialCommunityIcons
                      name="ticket-percent-outline"
                      size={18}
                      color={theme.colors.magenta}
                    />
                    <View style={styles.linkCardTextWrap}>
                      <Text style={styles.linkCardTitle}>Offers & Coupons</Text>
                      <Text style={styles.linkCardSubtitle}>
                        {couponMatchesSelection
                          ? `${selectedCoupon.code} applied - save ${formatCurrency(discountAmount)}`
                          : 'Apply a coupon to reduce the payable amount'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkCard}
                  activeOpacity={0.9}
                  onPress={navigateToInviteFriends}
                >
                  <View style={styles.linkCardLeft}>
                    <Ionicons name="gift-outline" size={18} color={theme.colors.magenta} />
                    <View style={styles.linkCardTextWrap}>
                      <Text style={styles.linkCardTitle}>Invite Friends & Earn</Text>
                      <Text style={styles.linkCardSubtitle}>
                        {referralQuery.data?.rewardDescription || 'Share your referral code and earn wallet bonuses'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payment Method</Text>
                <View style={styles.methodList}>
                  {PAYMENT_METHODS.map((method) => {
                    const active = selectedMethod === method.key;
                    return (
                      <TouchableOpacity
                        key={method.key}
                        style={[styles.methodCard, active && styles.methodCardActive]}
                        activeOpacity={0.88}
                        onPress={() => setSelectedMethod(method.key)}
                      >
                        <Ionicons
                          name={method.icon}
                          size={18}
                          color={active ? theme.colors.textPrimary : theme.colors.magenta}
                        />
                        <Text style={[styles.methodText, active && styles.methodTextActive]}>
                          {method.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.rechargeButton, rechargeMutation.isPending && styles.rechargeButtonDisabled]}
                activeOpacity={0.88}
                onPress={() => rechargeMutation.mutate()}
                disabled={rechargeMutation.isPending}
              >
                {rechargeMutation.isPending ? (
                  <ActivityIndicator color={theme.colors.textPrimary} />
                ) : (
                  <>
                    <Ionicons name="flash-outline" size={18} color={theme.colors.textPrimary} />
                    <Text style={styles.rechargeButtonText}>Recharge Now</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.section}>
              {historyQuery.isLoading ? (
                <View style={styles.stateCard}>
                  <ActivityIndicator color={theme.colors.magenta} />
                  <Text style={styles.stateText}>Loading wallet history...</Text>
                </View>
              ) : null}

              {historyQuery.isError ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateText}>Unable to load wallet history right now.</Text>
                </View>
              ) : null}

              {!historyQuery.isLoading && !historyQuery.isError && !historyItems.length ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateTitle}>No recharge history yet</Text>
                  <Text style={styles.stateText}>
                    Your completed recharges and wallet updates will appear here.
                  </Text>
                </View>
              ) : null}

              {historyItems.map((item) => {
                const credit = isCreditTransaction(item);
                return (
                  <View key={item.id} style={styles.historyRow}>
                    <View style={styles.historyIconWrap}>
                      <Ionicons
                        name={credit ? 'arrow-down-outline' : 'arrow-up-outline'}
                        size={18}
                        color={credit ? theme.colors.success : theme.colors.warning}
                      />
                    </View>

                    <View style={styles.historyTextWrap}>
                      <Text style={styles.historyTitle}>{getTransactionTitle(item)}</Text>
                      <Text style={styles.historyMeta}>
                        {item.description || 'Wallet update'} - {formatDateTime(item.createdAt)}
                      </Text>
                    </View>

                    <Text style={[styles.historyAmount, credit ? styles.creditText : styles.debitText]}>
                      {credit ? '+ ' : '- '}
                      {formatCurrency(item.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
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
    fontSize: 19,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 30,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,42,163,0.35)',
    backgroundColor: 'rgba(20, 14, 31, 0.96)',
    ...theme.shadow.card,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  heroEyebrow: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  heroAmount: {
    marginTop: 6,
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
  },
  heroMeta: {
    alignItems: 'flex-end',
    maxWidth: 120,
  },
  heroMetaLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  heroMetaValue: {
    marginTop: 6,
    color: theme.colors.magenta,
    fontSize: 18,
    fontWeight: '700',
  },
  heroStats: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  statValue: {
    marginTop: 6,
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabButtonActive: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.15)',
  },
  tabButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: theme.colors.textPrimary,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  amountChip: {
    width: '47%',
    borderRadius: 24,
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(20,14,30,0.95)',
  },
  amountChipActive: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.16)',
  },
  amountChipAmount: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  amountChipAmountActive: {
    color: theme.colors.textPrimary,
  },
  amountChipMeta: {
    marginTop: 6,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  amountChipMetaActive: {
    color: theme.colors.textPrimary,
  },
  summaryCard: {
    borderRadius: 26,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(19,13,28,0.96)',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryRowStrong: {
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  summaryLabel: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  summaryLabelStrong: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  summaryValue: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  discountValue: {
    color: theme.colors.success,
  },
  summaryValueStrong: {
    color: theme.colors.magenta,
    fontSize: 18,
    fontWeight: '800',
  },
  linkCard: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  linkCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  linkCardTextWrap: {
    flex: 1,
  },
  linkCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  linkCardSubtitle: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  methodList: {
    gap: 10,
  },
  methodCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  methodCardActive: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.16)',
  },
  methodText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  methodTextActive: {
    color: theme.colors.textPrimary,
  },
  rechargeButton: {
    marginTop: 4,
    borderRadius: 24,
    backgroundColor: theme.colors.magenta,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    ...theme.shadow.glow,
  },
  rechargeButtonDisabled: {
    opacity: 0.72,
  },
  rechargeButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  stateCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  stateTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  stateText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  historyRow: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(22,14,31,0.95)',
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  historyTextWrap: {
    flex: 1,
  },
  historyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  historyMeta: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  creditText: {
    color: theme.colors.success,
  },
  debitText: {
    color: theme.colors.warning,
  },
});

export default MyWalletScreen;
