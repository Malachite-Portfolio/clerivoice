import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import theme from '../constants/theme';
import { useWalletFlow } from '../context/WalletFlowContext';
import { applyWalletCoupon } from '../services/walletApi';

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(0)}`;

const OffersScreen = ({ navigation, route }) => {
  const { selectedPlan, selectedCoupon, applyCouponSelection } = useWalletFlow();
  const [couponInput, setCouponInput] = useState(selectedCoupon?.code || '');
  const rechargeAmount = Number(route.params?.amount || selectedPlan?.amount || selectedCoupon?.amount || 199);

  const couponCards = useMemo(
    () => [
      {
        code: 'FLAT200',
        title: 'Flat 200 Off',
        description: `Save INR 200 on recharge of ${formatCurrency(199)} or more`,
      },
    ],
    [],
  );

  const couponMutation = useMutation({
    mutationFn: async (rawCode) => {
      const normalizedCode = String(rawCode || '').trim().toUpperCase();
      if (!normalizedCode) {
        throw new Error('Enter a coupon code to continue.');
      }

      return applyWalletCoupon({
        couponCode: normalizedCode,
        amount: rechargeAmount,
      });
    },
    onSuccess: (result, submittedCode) => {
      const normalizedCode = String(submittedCode || '').trim().toUpperCase();
      console.log('[Wallet] coupon apply result', {
        code: normalizedCode,
        amount: rechargeAmount,
        valid: result?.valid || false,
        discountAmount: result?.discountAmount || 0,
        payableAmount: result?.payableAmount || rechargeAmount,
      });

      if (!result?.valid) {
        Alert.alert('Coupon unavailable', result?.reason || 'This coupon could not be applied.');
        return;
      }

      const appliedCoupon = {
        code: result?.coupon?.code || normalizedCode,
        description: result?.coupon?.description || 'Coupon applied',
        discountAmount: result?.discountAmount || 0,
        payableAmount: result?.payableAmount || rechargeAmount,
        amount: rechargeAmount,
      };

      applyCouponSelection(appliedCoupon);
      console.log('[Wallet] route navigation', {
        from: 'Offers',
        to: 'MyWallet',
        couponCode: appliedCoupon.code,
      });
      navigation.navigate('MyWallet', {
        couponCode: appliedCoupon.code,
        couponAppliedAt: Date.now(),
      });
    },
    onError: (error, submittedCode) => {
      console.warn('[Wallet] coupon apply result', {
        code: String(submittedCode || '').trim().toUpperCase(),
        amount: rechargeAmount,
        status: error?.response?.status ?? null,
        body: error?.response?.data || null,
      });
      Alert.alert(
        'Offer unavailable',
        error?.response?.data?.message || error?.message || 'We could not validate this coupon right now.',
      );
    },
  });

  const handleApply = (code) => {
    couponMutation.mutate(code);
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

          <Text style={styles.headerTitle}>Offers</Text>

          <View style={styles.headerMeta}>
            <Text style={styles.headerMetaLabel}>For recharge</Text>
            <Text style={styles.headerMetaValue}>{formatCurrency(rechargeAmount)}</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.inputCard}>
            <Text style={styles.sectionTitle}>Apply Coupon Code</Text>
            <Text style={styles.sectionSubtitle}>
              Enter a live coupon for your selected recharge amount.
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                value={couponInput}
                onChangeText={setCouponInput}
                placeholder="Enter coupon code"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
              />
              <TouchableOpacity
                style={styles.applyButton}
                activeOpacity={0.88}
                onPress={() => handleApply(couponInput)}
                disabled={couponMutation.isPending}
              >
                {couponMutation.isPending ? (
                  <ActivityIndicator color={theme.colors.textPrimary} />
                ) : (
                  <Text style={styles.applyButtonText}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Coupons</Text>
              <Text style={styles.sectionHint}>Validated live</Text>
            </View>

            <View style={styles.cardGrid}>
              {couponCards.map((coupon) => (
                <View key={coupon.code} style={styles.couponCard}>
                  <View style={styles.couponBadge}>
                    <MaterialCommunityIcons
                      name="ticket-percent-outline"
                      size={16}
                      color={theme.colors.magenta}
                    />
                    <Text style={styles.couponCode}>{coupon.code}</Text>
                  </View>

                  <Text style={styles.couponTitle}>{coupon.title}</Text>
                  <Text style={styles.couponDescription}>{coupon.description}</Text>

                  <TouchableOpacity
                    style={styles.cardApplyButton}
                    activeOpacity={0.88}
                    onPress={() => handleApply(coupon.code)}
                    disabled={couponMutation.isPending}
                  >
                    <Text style={styles.cardApplyButtonText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
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
    fontSize: 19,
    fontWeight: '700',
  },
  headerMeta: {
    alignItems: 'flex-end',
  },
  headerMetaLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  headerMetaValue: {
    color: theme.colors.magenta,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  inputCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,42,163,0.35)',
    backgroundColor: 'rgba(20,14,31,0.96)',
    padding: 18,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  inputRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    color: theme.colors.textPrimary,
    minHeight: 52,
  },
  applyButton: {
    minWidth: 92,
    borderRadius: 20,
    backgroundColor: theme.colors.magenta,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    ...theme.shadow.glow,
  },
  applyButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionWrap: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  cardGrid: {
    gap: 12,
  },
  couponCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(19,13,28,0.96)',
    padding: 16,
  },
  couponBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,42,163,0.28)',
    backgroundColor: 'rgba(255,42,163,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  couponCode: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  couponTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
  },
  couponDescription: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  cardApplyButton: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.14)',
    alignItems: 'center',
    paddingVertical: 12,
  },
  cardApplyButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});

export default OffersScreen;
