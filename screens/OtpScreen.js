import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "../context/AuthContext";
import AppLogo from "../components/AppLogo";
import { getHomeRouteName } from "../navigation/navigationRef";
import { toIndianE164 } from "../services/authPhone";
import { sendFirebaseOtp, verifyFirebaseOtpCode } from "../services/firebasePhoneAuth";
import { loginWithFirebaseIdentity } from "../services/firebaseLoginApi";
import { getMyProfile } from "../services/profileApi";
import {
  clearListenerOnboardingCompleteMark,
  isListenerOnboardingMarkedComplete,
  isListenerProfileComplete,
} from "../services/listenerOnboardingStatus";
import {
  getBackendFirebaseLoginErrorMessage,
  getFirebaseAuthErrorCode,
  getFirebaseAuthErrorMessage,
} from "../services/firebaseAuthErrorMessage";

const OTP_LENGTH = 6;

const logOtpDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[OtpScreen] ${label}`, payload);
};

const OtpScreen = ({ navigation, route }) => {
  const phone = toIndianE164(route?.params?.phone || "+910000000000");
  const requestedRole = String(route?.params?.role || APP_FLAVOR || "user")
    .trim()
    .toLowerCase();
  const role = requestedRole === "listener" ? "listener" : "user";
  const initialVerificationId = String(route?.params?.verificationId || "").trim();
  const initialConfirmation = route?.params?.confirmation || null;
  const { setSession } = useAuth();

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  const [verificationId, setVerificationId] = useState(initialVerificationId);
  const [confirmation, setConfirmation] = useState(initialConfirmation);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const fullOtp = useMemo(() => otp.join(""), [otp]);
  const isComplete = useMemo(() => fullOtp.length === OTP_LENGTH, [fullOtp]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 140);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!route?.params?.verificationId) {
      return;
    }

    const nextVerificationId = String(route.params.verificationId).trim();
    if (!nextVerificationId) {
      return;
    }

    setVerificationId(nextVerificationId);
  }, [route?.params?.verificationId]);

  useEffect(() => {
    if (!route?.params?.confirmation) {
      return;
    }

    setConfirmation(route.params.confirmation);
  }, [route?.params?.confirmation]);

  const handleOtpChange = (value, index) => {
    const numeric = value.replace(/[^0-9]/g, "");
    const updated = [...otp];
    updated[index] = numeric.slice(-1);
    setOtp(updated);

    if (error) {
      setError("");
    }

    if (numeric && index < OTP_LENGTH - 1) {
      const nextIndex = index + 1;
      inputRefs.current[nextIndex]?.focus();
      setFocusedIndex(nextIndex);
    }
  };

  const handleBackspace = (key, index) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      const prevIndex = index - 1;
      inputRefs.current[prevIndex]?.focus();
      setFocusedIndex(prevIndex);
    }
  };

  const handleVerify = async () => {
    if (!isComplete) {
      setError("Please enter all 6 digits.");
      return;
    }

    if (!verificationId && !confirmation) {
      const message = "OTP session expired. Please resend OTP.";
      setError(message);
      Alert.alert("OTP Verification Failed", message);
      return;
    }

    setLoading(true);
    setError("");

    logOtpDebug("verifyOtpRequestStarted", {
      phone,
      role,
      otpLength: fullOtp.length,
      hasVerificationId: Boolean(verificationId),
      hasConfirmation: Boolean(confirmation),
    });

    try {
      const firebaseVerification = await verifyFirebaseOtpCode({
        verificationId,
        code: fullOtp,
        confirmation,
      });
      const firebaseUid = String(firebaseVerification?.firebaseUid || "").trim();

      logOtpDebug("firebaseVerifyOtpSuccess", {
        phone,
        role,
        firebaseUid,
        hasFirebaseUid: Boolean(firebaseUid),
      });

      try {
        logOtpDebug("backendFirebaseLoginRequestStarted", {
          phone,
          role,
          firebaseUid,
        });

        const response = await loginWithFirebaseIdentity({
          phone,
          firebaseUid,
          role,
        });

        logOtpDebug("backendFirebaseLoginSuccess", {
          phone,
          role,
          firebaseUid,
          userId: response?.user?.id || null,
          resolvedRole: response?.user?.role || null,
          hasAccessToken: Boolean(response?.accessToken),
        });

        await setSession({
          user: response.user,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        });

        if (role === "listener") {
          let shouldNavigateToOnboarding = false;
          try {
            const listenerProfile = await getMyProfile();
            const isComplete = isListenerProfileComplete(listenerProfile || response?.user || {});
            const markedComplete = await isListenerOnboardingMarkedComplete();
            shouldNavigateToOnboarding = !isComplete && !markedComplete;
          } catch (profileError) {
            logOtpDebug("listenerProfileCompletenessCheckFailure", {
              phone,
              role,
              message: profileError?.message || "Unknown error",
            });
            const markedComplete = await isListenerOnboardingMarkedComplete();
            shouldNavigateToOnboarding = !markedComplete;
          }

          if (shouldNavigateToOnboarding) {
            await clearListenerOnboardingCompleteMark();
            navigation.reset({
              index: 0,
              routes: [{ name: "ListenerOnboarding" }],
            });
            return;
          }
        }

        navigation.reset({
          index: 0,
          routes: [{ name: getHomeRouteName() }],
        });
      } catch (backendError) {
        logOtpDebug("backendFirebaseLoginFailure", {
          phone,
          role,
          firebaseUid,
          status: backendError?.response?.status ?? null,
          responseBody: backendError?.response?.data ?? null,
          message: backendError?.message || "Unknown error",
        });

        const backendMessage = getBackendFirebaseLoginErrorMessage(backendError);
        setError(backendMessage);
        Alert.alert("Login Failed", backendMessage);
      }
    } catch (firebaseError) {
      logOtpDebug("firebaseVerifyOtpFailure", {
        phone,
        role,
        code: getFirebaseAuthErrorCode(firebaseError),
        message: firebaseError?.message || "Unknown error",
      });

      const message = getFirebaseAuthErrorMessage(firebaseError, {
        action: "verify",
      });
      setError(message);
      Alert.alert("OTP Verification Failed", message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      const resendResponse = await sendFirebaseOtp(phone);
      setVerificationId(String(resendResponse?.verificationId || "").trim());
      setConfirmation(resendResponse?.confirmation || null);

      logOtpDebug("firebaseSendOtpSuccess", {
        phone,
        role,
        verificationIdReceived: Boolean(resendResponse?.verificationId),
      });

      setOtp(Array(OTP_LENGTH).fill(""));
      setError("");
      inputRefs.current[0]?.focus();
      setFocusedIndex(0);
    } catch (firebaseError) {
      logOtpDebug("firebaseSendOtpFailure", {
        phone,
        role,
        code: getFirebaseAuthErrorCode(firebaseError),
        message: firebaseError?.message || "Unknown error",
      });

      const message = getFirebaseAuthErrorMessage(firebaseError, {
        action: "send",
      });
      setError(message);
      Alert.alert("OTP Resend Failed", message);
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
            style={styles.touchLayer}
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

            <Text style={styles.heading}>Verify OTP</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to {phone}
            </Text>

            <View style={styles.otpRow}>
              {otp.map((digit, index) => {
                const isFocused = focusedIndex === index;
                const hasError = !!error;

                return (
                  <TextInput
                    key={`otp-${index}`}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    value={digit}
                    onChangeText={(value) => handleOtpChange(value, index)}
                    onKeyPress={({ nativeEvent }) =>
                      handleBackspace(nativeEvent.key, index)
                    }
                    onFocus={() => setFocusedIndex(index)}
                    keyboardType="number-pad"
                    maxLength={1}
                    style={[
                      styles.otpInput,
                      digit ? styles.otpInputFilled : null,
                      isFocused ? styles.otpInputFocused : null,
                      hasError ? styles.otpInputError : null,
                    ]}
                    selectionColor={theme.colors.magenta}
                  />
                );
              })}
            </View>

            <TouchableOpacity
              onPress={handleResend}
              activeOpacity={0.8}
              style={styles.resendWrap}
            >
              <Text style={styles.resendText}>Resend code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleVerify}
              activeOpacity={0.86}
              style={[
                styles.buttonShell,
                loading && styles.buttonShellDisabled,
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
                    loading && styles.buttonLabelDisabled,
                  ]}
                >
                  {loading ? "Verifying..." : "Verify"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  touchLayer: {
    flex: 1,
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
    marginBottom: 18,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.15,
  },
  subtitle: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    lineHeight: 21,
    marginBottom: 20,
    maxWidth: 302,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  otpInput: {
    width: 44,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(20, 15, 31, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  otpInputFilled: {
    borderColor: "rgba(255, 42, 163, 0.6)",
  },
  otpInputFocused: {
    borderColor: "rgba(255, 34, 163, 0.9)",
    backgroundColor: "rgba(39, 20, 48, 0.9)",
    shadowColor: "#FF2AA3",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  otpInputError: {
    borderColor: theme.colors.error,
  },
  resendWrap: {
    alignSelf: "flex-end",
    marginTop: 12,
  },
  resendText: {
    color: theme.colors.neonPink,
    fontSize: 13,
    fontWeight: "700",
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
    color: "rgba(227, 26, 151, 0.5)",
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
    marginTop: 10,
  },
});

export default OtpScreen;
