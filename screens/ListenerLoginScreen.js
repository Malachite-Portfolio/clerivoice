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
import {
  API_BASE_URL,
  AUTH_DEBUG_ENABLED,
  ENABLE_TEST_AUTH,
} from '../constants/api';
import AppLogo from '../components/AppLogo';
import {
  LISTENER_AUTH_ENDPOINTS,
  loginListener,
  sendListenerOtp,
  verifyListenerOtp,
} from '../services/listenerAuthApi';
import { useAuth } from '../context/AuthContext';
import { getHomeRouteName } from '../navigation/navigationRef';

const logListenerAuthDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ListenerLoginScreen] ${label}`, payload);
};

const normalizeLocalPhone = (value) => value.replace(/[^0-9]/g, '').slice(0, 10);
const buildIndianPhone = (value) => `+91${normalizeLocalPhone(value)}`;

const ListenerLoginScreen = ({ navigation }) => {
  const { setSession } = useAuth();
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(false);

  const isValidPhone = useMemo(() => /^\d{10}$/.test(phone), [phone]);
  const isValidOtp = useMemo(() => /^\d{6}$/.test(otp), [otp]);
  const normalizedPhone = useMemo(() => buildIndianPhone(phone), [phone]);

  const onBack = () => {
    if (ENABLE_TEST_AUTH && otpStep) {
      setOtpStep(false);
      setOtp('');
      setError('');
      return;
    }

    navigation.goBack();
  };

  const onPasswordSubmit = async () => {
    if (!phoneOrEmail.trim() || !password.trim()) {
      setError('Please enter listener ID/phone/email and password.');
      return;
    }

    setLoading(true);
    setError('');

    logListenerAuthDebug('passwordLoginPressed', {
      identity: phoneOrEmail.trim(),
      finalApiUrl: `${API_BASE_URL}${LISTENER_AUTH_ENDPOINTS.login}`,
      payloadKeys: ['phoneOrEmail', 'password'],
      testAuthEnabled: ENABLE_TEST_AUTH,
    });

    try {
      const auth = await loginListener({
        phoneOrEmail: phoneOrEmail.trim(),
        password: password.trim(),
      });

      logListenerAuthDebug('passwordLoginSuccess', {
        status: 200,
        hasAccessToken: Boolean(auth?.accessToken),
        role: auth?.user?.role || null,
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
      logListenerAuthDebug('passwordLoginFailure', {
        status: apiError?.response?.status ?? null,
        responseBody: apiError?.response?.data ?? null,
        message: apiError?.message || 'Unknown error',
      });

      const message =
        apiError?.response?.data?.message ||
        'Unable to login listener account. Please check credentials.';
      setError(message);
      Alert.alert('Listener Login Failed', message);
    } finally {
      setLoading(false);
    }
  };

  const onSendOtp = async () => {
    logListenerAuthDebug('sendOtpPressed', {
      enteredPhone: phone,
      normalizedPhone,
      isValidPhone,
      finalApiUrl: `${API_BASE_URL}${LISTENER_AUTH_ENDPOINTS.sendOtp}`,
      requestPayload: {
        phone: normalizedPhone,
        purpose: 'LOGIN',
      },
      testAuthEnabled: ENABLE_TEST_AUTH,
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
        status: response?.status ?? null,
        responseBody: response?.body ?? null,
        finalApiUrl: `${API_BASE_URL}${LISTENER_AUTH_ENDPOINTS.sendOtp}`,
      });

      setOtp('');
      setOtpStep(true);
    } catch (apiError) {
      logListenerAuthDebug('sendOtpFailure', {
        status: apiError?.response?.status ?? null,
        responseBody: apiError?.response?.data ?? null,
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
    logListenerAuthDebug('verifyOtpPressed', {
      normalizedPhone,
      otpLength: otp.length,
      finalApiUrl: `${API_BASE_URL}${LISTENER_AUTH_ENDPOINTS.verifyOtp}`,
      requestPayload: {
        phone: normalizedPhone,
        otp,
        purpose: 'LOGIN',
      },
      testAuthEnabled: ENABLE_TEST_AUTH,
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
        status: apiError?.response?.status ?? null,
        responseBody: apiError?.response?.data ?? null,
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

  const title = ENABLE_TEST_AUTH ? 'Listener Test Login' : 'Listener Login';
  const subtitle = ENABLE_TEST_AUTH
    ? otpStep
      ? `Enter the 6-digit code for ${normalizedPhone}`
      : 'Enter the listener test phone number to receive the fixed testing OTP.'
    : 'Sign in to receive live call and chat requests.';

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

          {ENABLE_TEST_AUTH ? (
            <>
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
                        setPhone(normalizeLocalPhone(text));
                        if (error) {
                          setError('');
                        }
                      }}
                      placeholder="0000000101"
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
                    <Text style={styles.label}>Fixed OTP</Text>
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
            </>
          ) : (
            <>
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Listener ID / Phone / Email</Text>
                <TextInput
                  value={phoneOrEmail}
                  onChangeText={(value) => {
                    setPhoneOrEmail(value);
                    if (error) {
                      setError('');
                    }
                  }}
                  placeholder="listener phone or email"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={styles.input}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (error) {
                      setError('');
                    }
                  }}
                  placeholder="Enter password"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={styles.input}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            </>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={ENABLE_TEST_AUTH ? (otpStep ? onVerifyOtp : onSendOtp) : onPasswordSubmit}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>
                {ENABLE_TEST_AUTH
                  ? otpStep
                    ? 'Verify Listener OTP'
                    : 'Send Listener OTP'
                  : 'Login as Listener'}
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
