import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { API_BASE_URL, AUTH_DEBUG_ENABLED } from '../constants/api';
import AppLogo from '../components/AppLogo';
import {
  LISTENER_AUTH_ENDPOINTS,
  sendListenerOtp,
  verifyListenerOtp,
} from '../services/listenerAuthApi';
import { useAuth } from '../context/AuthContext';
import { getHomeRouteName } from '../navigation/navigationRef';
import { normalizeIndianPhoneInput, toIndianE164 } from '../services/authPhone';

const logListenerAuthDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ListenerLoginScreen] ${label}`, payload);
};

const ListenerLoginScreen = ({ navigation }) => {
  const { setSession } = useAuth();
  const [phone, setPhone] = useState('');
  const [rawPhoneInput, setRawPhoneInput] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(false);

  const isValidPhone = useMemo(() => /^\d{10}$/.test(phone), [phone]);
  const isValidOtp = useMemo(() => /^\d{6}$/.test(otp), [otp]);
  const normalizedPhone = useMemo(() => toIndianE164(phone), [phone]);

  const onBack = () => {
    if (otpStep) {
      setOtpStep(false);
      setOtp('');
      setError('');
      return;
    }

    navigation.goBack();
  };

  const onSendOtp = async () => {
    const endpoint = LISTENER_AUTH_ENDPOINTS.sendOtp;
    const finalApiUrl = `${API_BASE_URL}${endpoint}`;

    logListenerAuthDebug('sendOtpPressed', {
      rawPhoneEntered: rawPhoneInput,
      normalizedPhone,
      isValidPhone,
      otpSendEndpointCalled: endpoint,
      finalApiUrl,
      requestPayload: {
        phone: normalizedPhone,
        purpose: 'LOGIN',
      },
    });

    if (!isValidPhone) {
      setError('Please enter a valid 10-digit listener phone number.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendListenerOtp(normalizedPhone);

      logListenerAuthDebug('sendOtpSuccess', {
        finalApiUrl,
        normalizedPhone,
        status: response?.status ?? null,
        responseBody: response?.body ?? null,
      });

      setOtp('');
      setOtpStep(true);
    } catch (apiError) {
      logListenerAuthDebug('sendOtpFailure', {
        finalApiUrl,
        normalizedPhone,
        status: apiError?.response?.status ?? null,
        responseBody: apiError?.response?.data ?? null,
        backendErrorResponseBody: apiError?.response?.data ?? null,
        message: apiError?.message || 'Unknown error',
      });

      const message =
        apiError?.response?.data?.message ||
        'Unable to send listener OTP right now. Please try again.';
      setError(message);
      Alert.alert('OTP Failed', message);
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    const endpoint = LISTENER_AUTH_ENDPOINTS.verifyOtp;
    const finalApiUrl = `${API_BASE_URL}${endpoint}`;

    logListenerAuthDebug('verifyOtpPressed', {
      rawPhoneEntered: rawPhoneInput,
      normalizedPhone,
      otpLength: otp.length,
      otpVerifyEndpointCalled: endpoint,
      finalApiUrl,
      requestPayload: {
        phone: normalizedPhone,
        otp,
        purpose: 'LOGIN',
      },
    });

    if (!isValidOtp) {
      setError('Please enter the 6-digit OTP.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const auth = await verifyListenerOtp({
        phone: normalizedPhone,
        otp,
      });

      logListenerAuthDebug('verifyOtpSuccess', {
        finalApiUrl,
        normalizedPhone,
        hasAccessToken: Boolean(auth?.accessToken),
        role: auth?.user?.role || null,
        listenerId: auth?.user?.id || null,
      });

      await setSession({
        user: auth.user,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      });

      navigation.reset({
        index: 0,
        routes: [{ name: getHomeRouteName() }],
      });
    } catch (apiError) {
      logListenerAuthDebug('verifyOtpFailure', {
        finalApiUrl,
        normalizedPhone,
        status: apiError?.response?.status ?? null,
        responseBody: apiError?.response?.data ?? null,
        backendErrorResponseBody: apiError?.response?.data ?? null,
        message: apiError?.message || 'Unknown error',
      });

      const message =
        apiError?.response?.data?.message ||
        'Unable to verify listener OTP right now. Please try again.';
      setError(message);
      Alert.alert('OTP Verification Failed', message);
    } finally {
      setLoading(false);
    }
  };

  const title = 'Listener Login';
  const subtitle = otpStep
    ? `Enter the 6-digit code sent for ${normalizedPhone}`
    : 'Enter your listener phone number to continue securely.';

  return (
    <LinearGradient colors={['#05020D', '#070113', '#130322']} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>

          <AppLogo size="md" style={styles.logo} />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {!otpStep ? (
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Listener Phone Number</Text>
              <View style={styles.phoneInputWrap}>
                <View style={styles.countryCodeSection}>
                  <Text style={styles.codeText}>+91</Text>
                </View>
                <View style={styles.codeDivider} />
                <TextInput
                  value={phone}
                  onChangeText={(text) => {
                    setRawPhoneInput(text);
                    setPhone(normalizeIndianPhoneInput(text));
                    if (error) {
                      setError('');
                    }
                  }}
                  placeholder="9876543210"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={styles.phoneInput}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Listener Phone</Text>
                <View style={styles.infoChip}>
                  <Text style={styles.infoChipText}>{normalizedPhone}</Text>
                </View>
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>OTP</Text>
                <TextInput
                  value={otp}
                  onChangeText={(text) => {
                    setOtp(text.replace(/[^0-9]/g, '').slice(0, 6));
                    if (error) {
                      setError('');
                    }
                  }}
                  placeholder="123456"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <TouchableOpacity
                style={styles.resendWrap}
                onPress={onSendOtp}
                activeOpacity={0.8}
                disabled={loading}
              >
                <Text style={styles.resendText}>Resend code</Text>
              </TouchableOpacity>
            </>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={otpStep ? onVerifyOtp : onSendOtp}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>
                {otpStep ? 'Verify OTP' : 'Send OTP'}
              </Text>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { marginTop: 20, alignSelf: 'flex-start' },
  title: {
    marginTop: 28,
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  fieldWrap: { marginTop: 22 },
  label: {
    marginBottom: 8,
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  input: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  phoneInputWrap: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeSection: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  codeDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  phoneInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  infoChip: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.28)',
    backgroundColor: 'rgba(255, 42, 163, 0.12)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  infoChipText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  resendWrap: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  resendText: {
    color: theme.colors.magenta,
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 14,
    color: theme.colors.error,
    fontSize: 13,
  },
  loginButton: {
    marginTop: 24,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.colors.magenta,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: { opacity: 0.7 },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ListenerLoginScreen;
