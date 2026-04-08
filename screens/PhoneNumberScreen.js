import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
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
import theme from "../constants/theme";
import { APP_FLAVOR, AUTH_DEBUG_ENABLED } from "../constants/api";
import { getFirebaseAuthErrorMessage, getFirebaseAuthErrorCode } from "../services/firebaseAuthErrorMessage";
import { normalizeIndianPhoneInput, toIndianE164 } from "../services/authPhone";
import { sendFirebaseOtp } from "../services/firebasePhoneAuth";
import AppLogo from "../components/AppLogo";

const logOtpScreenDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[PhoneNumberScreen] ${label}`, payload);
};

const PhoneNumberScreen = ({ navigation, route }) => {
  const [phone, setPhone] = useState("");
  const [rawPhoneInput, setRawPhoneInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isValidPhone = useMemo(() => /^\d{10}$/.test(phone), [phone]);

  const onPhoneChange = (text) => {
    setRawPhoneInput(text);
    setPhone(normalizeIndianPhoneInput(text));
    if (error) {
      setError("");
    }
  };

  const onContinue = async () => {
    const normalizedPhone = toIndianE164(phone);
    const requestedRole = String(route?.params?.role || APP_FLAVOR || "user")
      .trim()
      .toLowerCase();
    const role = requestedRole === "listener" ? "listener" : "user";

    if (!isValidPhone) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const otpResponse = await sendFirebaseOtp(normalizedPhone);
      logOtpScreenDebug("firebaseSendOtpSuccess", {
        normalizedPhone,
        role,
        verificationIdReceived: Boolean(otpResponse?.verificationId),
      });
      navigation.navigate("Otp", {
        phone: normalizedPhone,
        role,
        verificationId: otpResponse?.verificationId,
        confirmation: otpResponse?.confirmation || null,
      });
    } catch (apiError) {
      logOtpScreenDebug("firebaseSendOtpFailure", {
        normalizedPhone,
        role,
        code: getFirebaseAuthErrorCode(apiError),
        message: apiError?.message || "Unknown error",
      });

      const message = getFirebaseAuthErrorMessage(apiError, { action: "send" });
      setError(message);
      Alert.alert("OTP Failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.contentWrap}
            onPress={Keyboard.dismiss}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={theme.colors.textPrimary}
              />
            </TouchableOpacity>

            <AppLogo size="md" style={styles.logoCard} />

            <Text style={styles.heading}>Enter your phone number</Text>
            <Text style={styles.subtitle}>
              We'll continue securely with your number
            </Text>

            <View style={styles.phoneInputWrap}>
              <View style={styles.countryCodeSection}>
                <Text style={styles.codeText}>+91</Text>
              </View>
              <View style={styles.codeDivider} />

              <TextInput
                value={phone}
                onChangeText={onPhoneChange}
                keyboardType="number-pad"
                placeholder="9876543210"
                placeholderTextColor="rgba(255,255,255,0.38)"
                style={styles.input}
                maxLength={10}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              onPress={onContinue}
              activeOpacity={0.86}
              disabled={loading}
              style={[
                styles.buttonShell,
                !isValidPhone && styles.buttonShellDisabled,
              ]}
            >
              <LinearGradient
                colors={["#1A1132", "#2C1842"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.buttonGradient}
              >
                <Text
                  style={[
                    styles.buttonLabel,
                    !isValidPhone && styles.buttonLabelDisabled,
                  ]}
                >
                  {loading ? "Continuing..." : "Continue"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>

          <Text style={styles.footerText}>
            Your number is private and used only for secure sign in.
          </Text>
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  contentWrap: {
    paddingTop: 6,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 14,
  },
  logoCard: {
    alignSelf: "flex-start",
    marginBottom: 20,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.15,
  },
  subtitle: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    marginBottom: 22,
    fontWeight: "500",
  },
  phoneInputWrap: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(207, 36, 155, 0.55)",
    backgroundColor: "rgba(24, 16, 35, 0.92)",
    flexDirection: "row",
    alignItems: "center",
  },
  countryCodeSection: {
    width: 72,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  codeText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  codeDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    marginLeft: 12,
    paddingRight: 14,
    fontWeight: "500",
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
    marginTop: 10,
    marginLeft: 4,
  },
  buttonShell: {
    marginTop: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(207, 36, 155, 0.72)",
    shadowColor: "#D10B95",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  buttonShellDisabled: {
    borderColor: "rgba(255, 34, 163, 0.4)",
    shadowOpacity: 0.1,
    elevation: 2,
  },
  buttonGradient: {
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: {
    color: theme.colors.neonPink,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  buttonLabelDisabled: {
    color: "rgba(227, 26, 151, 0.45)",
  },
  footerText: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 26,
    marginBottom: 6,
  },
});

export default PhoneNumberScreen;
