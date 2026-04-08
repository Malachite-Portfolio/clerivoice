import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import theme from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { queryKeys } from "../services/queryClient";
import {
  fetchWalletSummary,
  fetchWithdrawalConfig,
  fetchWithdrawalHistory,
  requestWalletWithdrawal,
} from "../services/walletApi";

const TABS = ["Withdraw", "History"];
const MINIMUM_WITHDRAWAL_FALLBACK = 5000;

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(0)}`;

const formatDate = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toSafeAmount = (value) => {
  const normalized = String(value || "")
    .replace(/[^\d.]/g, "")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ListenerWalletScreen = ({ navigation }) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const summaryQuery = useQuery({
    queryKey: queryKeys.wallet.summary,
    queryFn: fetchWalletSummary,
    enabled: Boolean(session?.accessToken),
    staleTime: 10000,
  });

  const withdrawalConfigQuery = useQuery({
    queryKey: [...queryKeys.wallet.summary, "withdrawal-config"],
    queryFn: fetchWithdrawalConfig,
    enabled: Boolean(session?.accessToken),
    staleTime: 10000,
  });

  const withdrawalHistoryQuery = useQuery({
    queryKey: [
      ...queryKeys.wallet.history({ limit: 20 }),
      "withdrawal-history",
    ],
    queryFn: () => fetchWithdrawalHistory({ page: 1, limit: 20 }),
    enabled: Boolean(session?.accessToken) && activeTab === "History",
    staleTime: 10000,
  });

  const minimumWithdrawalAmount = Number(
    withdrawalConfigQuery.data?.minimumAmount || MINIMUM_WITHDRAWAL_FALLBACK,
  );
  const currentBalance = Number(summaryQuery.data?.balance || 0);
  const requestedAmount = toSafeAmount(amountInput);
  const hasPendingWithdrawal = Boolean(
    withdrawalConfigQuery.data?.pendingRequest?.id,
  );
  const hasPayoutMethod = withdrawalConfigQuery.data?.hasPayoutMethod !== false;

  const withdrawalBlockedReason = useMemo(() => {
    if (withdrawalConfigQuery.data?.enabled === false) {
      return (
        withdrawalConfigQuery.data?.reason ||
        "Withdrawal is not available for this account."
      );
    }

    if (!hasPayoutMethod) {
      return (
        withdrawalConfigQuery.data?.payoutCta ||
        "Payout method setup is required before withdrawal."
      );
    }

    if (hasPendingWithdrawal) {
      return "A previous withdrawal request is still pending review.";
    }

    if (currentBalance < minimumWithdrawalAmount) {
      return `Minimum withdrawal amount is ${formatCurrency(minimumWithdrawalAmount)}.`;
    }

    if (requestedAmount && requestedAmount > currentBalance) {
      return "Withdrawal amount cannot exceed current balance.";
    }

    if (requestedAmount > 0 && requestedAmount < minimumWithdrawalAmount) {
      return `Please enter at least ${formatCurrency(minimumWithdrawalAmount)}.`;
    }

    return "";
  }, [
    currentBalance,
    hasPayoutMethod,
    hasPendingWithdrawal,
    minimumWithdrawalAmount,
    requestedAmount,
    withdrawalConfigQuery.data?.enabled,
    withdrawalConfigQuery.data?.payoutCta,
    withdrawalConfigQuery.data?.reason,
  ]);

  const canSubmitWithdrawal =
    requestedAmount >= minimumWithdrawalAmount &&
    requestedAmount <= currentBalance &&
    !withdrawalBlockedReason;

  const withdrawalMutation = useMutation({
    mutationFn: () =>
      requestWalletWithdrawal({
        amount: requestedAmount,
        note: noteInput,
      }),
    onSuccess: async (result) => {
      setAmountInput("");
      setNoteInput("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary }),
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.wallet.summary, "withdrawal-config"],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            ...queryKeys.wallet.history({ limit: 20 }),
            "withdrawal-history",
          ],
        }),
      ]);

      Alert.alert(
        "Withdrawal requested",
        `Request submitted for ${formatCurrency(result?.amount || requestedAmount)}.`,
      );
    },
    onError: (error) => {
      Alert.alert(
        "Withdrawal failed",
        error?.response?.data?.message ||
          error?.message ||
          "Unable to submit withdrawal request right now.",
      );
    },
  });

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary }),
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.wallet.summary, "withdrawal-config"],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            ...queryKeys.wallet.history({ limit: 20 }),
            "withdrawal-history",
          ],
        }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const withdrawalItems = withdrawalHistoryQuery.data?.items || [];

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerIcon}
              activeOpacity={0.82}
              onPress={() => navigation.goBack()}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={theme.colors.textPrimary}
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Wallet</Text>
            <View style={styles.balancePill}>
              <Text style={styles.balancePillText}>
                {formatCurrency(currentBalance)}
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.magenta}
              />
            }
          >
            <View style={styles.tabRow}>
              {TABS.map((tab) => {
                const active = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.tabButton,
                      active ? styles.tabButtonActive : null,
                    ]}
                    onPress={() => setActiveTab(tab)}
                    activeOpacity={0.88}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        active ? styles.tabTextActive : null,
                      ]}
                    >
                      {tab}
                    </Text>
                    {active ? <View style={styles.tabUnderline} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeTab === "Withdraw" ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Withdraw</Text>
                <Text style={styles.sectionSubTitle}>
                  Current balance {formatCurrency(currentBalance)}
                </Text>

                <TextInput
                  value={amountInput}
                  onChangeText={setAmountInput}
                  keyboardType="decimal-pad"
                  placeholder="Enter amount"
                  placeholderTextColor="rgba(255,255,255,0.36)"
                  style={styles.input}
                />
                <Text style={styles.minimumHint}>
                  Minimum amount {minimumWithdrawalAmount}
                </Text>

                <TextInput
                  value={noteInput}
                  onChangeText={setNoteInput}
                  placeholder="Optional note"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={[styles.input, styles.noteInput]}
                  maxLength={300}
                />

                {withdrawalBlockedReason ? (
                  <Text style={styles.validationText}>
                    {withdrawalBlockedReason}
                  </Text>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (!canSubmitWithdrawal || withdrawalMutation.isPending) &&
                      styles.primaryButtonDisabled,
                  ]}
                  activeOpacity={0.88}
                  disabled={
                    !canSubmitWithdrawal || withdrawalMutation.isPending
                  }
                  onPress={() => withdrawalMutation.mutate()}
                >
                  {withdrawalMutation.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Withdraw</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Recent Withdrawls</Text>

                {withdrawalHistoryQuery.isLoading ? (
                  <View style={styles.stateCard}>
                    <ActivityIndicator color={theme.colors.magenta} />
                    <Text style={styles.stateText}>
                      Loading withdrawal history...
                    </Text>
                  </View>
                ) : null}

                {!withdrawalHistoryQuery.isLoading &&
                !withdrawalItems.length ? (
                  <View style={styles.stateCard}>
                    <Text style={styles.stateText}>
                      No withdrawal requests yet.
                    </Text>
                  </View>
                ) : null}

                {withdrawalItems.map((item) => (
                  <View key={item.id} style={styles.historyRow}>
                    <View style={styles.historyTextWrap}>
                      <Text style={styles.historyAmount}>
                        {formatCurrency(item.amount)}
                      </Text>
                      <Text style={styles.historyTxnId}>
                        Transaction id {String(item.id || "").slice(-8) || "--"}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {formatDate(item.requestedAt)}
                      </Text>
                    </View>
                    <View style={styles.historyStatusPill}>
                      <Text style={styles.historyStatusText}>
                        {String(item.status || "OPEN").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  balancePill: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: "rgba(152, 37, 117, 0.23)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  balancePillText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 34,
  },
  tabRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    marginBottom: 16,
  },
  tabButton: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: "600",
  },
  tabTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
  },
  tabButtonActive: {
    borderColor: "rgba(207, 36, 155, 0.65)",
    backgroundColor: "rgba(209,11,149,0.94)",
  },
  tabUnderline: {
    marginTop: 0,
    height: 0,
  },
  card: {
    borderRadius: 22,
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28 / 1.7,
    fontWeight: "700",
    marginBottom: 6,
  },
  sectionSubTitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 10,
  },
  input: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: theme.colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  minimumHint: {
    marginTop: 8,
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    textAlign: "right",
  },
  noteInput: {
    minHeight: 44,
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    color: theme.colors.textPrimary,
  },
  validationText: {
    marginTop: 10,
    color: "#FFB74D",
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 14,
    borderRadius: 22,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D10B95",
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 22 / 1.6,
    fontWeight: "800",
  },
  stateCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stateText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  historyRow: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  historyAmount: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  historyTxnId: {
    marginTop: 2,
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  historyMeta: {
    marginTop: 3,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  historyStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,42,163,0.35)",
    backgroundColor: "rgba(255,42,163,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  historyStatusText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
});

export default ListenerWalletScreen;
