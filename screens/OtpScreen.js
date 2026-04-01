import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { AUTH_DEBUG_ENABLED, ENABLE_TEST_AUTH } from '../constants/api';
import { sendOtp, verifyOtp } from '../services/userAuthApi';
import { useAuth } from '../context/AuthContext';
import AppLogo from '../components/AppLogo';
import { getHomeRouteName } from '../navigation/navigationRef';

const OTP_LENGTH = 6;

const logOtpDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[OtpScreen] ${label}`, payload);
};

const OtpScreen = ({ navigation, route }) => {
  const phone = route?.params?.phone || '+910000000000';
  const { setSession } = useAuth();

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const fullOtp = useMemo(() => otp.join(''), [otp]);
  const isComplete = useMemo(() => fullOtp.length === OTP_LENGTH, [fullOtp]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 140);

    return () => clearTimeout(timer);
  }, []);

  const handleOtpChange = (value, index) => {
    const numeric = value.replace(/[^0-9]/g, '');
    const updated = [...otp];
    updated[index] = numeric.slice(-1);
    setOtp(updated);

    if (error) {
      setError('');
    }

    if (numeric && index < OTP_LENGTH - 1) {
      const nextIndex = index + 1;
      inputRefs.current[nextIndex]?.focus();
      setFocusedIndex(nextIndex);
    }
  };

  const handleBackspace = (key, index) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const prevIndex = index - 1;
      inputRefs.current[prevIndex]?.focus();
      setFocusedIndex(prevIndex);
    }
  };

  const handleVerify = async () => {
    if (!isComplete) {
      setError('Please enter all 6 digits.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      logOtpDebug('verifyOtpStart', {
        phone,
        otpLength: fullOtp.length,
        testAuthEnabled: ENABLE_TEST_AUTH,
      });

      const response = await verifyOtp({
        phone,
        otp: fullOtp,
        displayName: `Anonymous-${phone.slice(-4)}`,
      });

      logOtpDebug('verifyOtpSuccess', {
        phone,
        userId: response?.user?.id || null,
        role: response?.user?.role || null,
        hasAccessToken: Boolean(response?.accessToken),
      });

      await setSession({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });

      navigation.reset({
        index: 0,
        routes: [{ name: getHomeRouteName() }],
      });
    } catch (apiError) {
      logOtpDebug('verifyOtpFailure', {
        phone,
        status: apiError?.response?.status ?? null,
        responseBody: apiError?.response?.data ?? null,
        message: apiError?.message || 'Unknown error',
      });

      const message =
        apiError?.response?.data?.message ||
        'Unable to verify OTP right now. Please try again.';
      setError(message);
      Alert.alert('OTP Verification Failed', message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      logOtpDebug('resendOtpStart', {
        phone,
        testAuthEnabled: ENABLE_TEST_AUTH,
      });
      await sendOtp(phone);
      logOtpDebug('resendOtpSuccess', {
        phone,
      });
      setOtp(Array(OTP_LENGTH).fill(''));
      setError('');
      inputRefs.current[0]?.focus();
      setFocusedIndex(0);
    } catch (apiError) {
      logOtpDebug('resendOtpFailure', {
        phone,
        status: apiError?.response?.status ?? null,
        responseBody: apiError?.response?.data ?? null,
        message: apiError?.message || 'Unknown error',
      });

      const message =
        apiError?.response?.data?.message ||
        'Unable to resend OTP right now. Please try again.';
      setError(message);
      Alert.alert('OTP Resend Failed', message);
    }
  };

  return (
    <LinearGradient
      colors={['#05020D', '#070113', '#0B031A', '#130322']}
      locations={[0, 0.35, 0.72, 1]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          <Text style={styles.subtitle}>Enter the 6-digit code sent to {phone}</Text>

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
            style={[styles.buttonShell, loading && styles.buttonShellDisabled]}
          >
            <LinearGradient
              colors={['#1A1132', '#2C1842']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.buttonGradient}
            >
              <Text style={[styles.buttonLabel, loading && styles.buttonLabelDisabled]}>
                {loading ? 'Verifying...' : 'Verify'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
    paddingHorizontal: 22,
    paddingTop: 4,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  logoCard: {
    alignSelf: 'flex-start',
    marginBottom: 24,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontSize: 46 / 1.6,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 31 / 2,
    lineHeight: 26,
    marginBottom: 26,
    maxWidth: 280,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  otpInput: {
    width: 42,
    height: 54,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 20, 40, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: 'rgba(255, 42, 163, 0.6)',
  },
  otpInputFocused: {
    borderColor: 'rgba(255, 34, 163, 0.9)',
    backgroundColor: 'rgba(39, 20, 48, 0.9)',
    shadowColor: '#FF2AA3',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  otpInputError: {
    borderColor: theme.colors.error,
  },
  resendWrap: {
    alignSelf: 'flex-end',
    marginTop: 14,
  },
  resendText: {
    color: '#FF2AA3',
    fontSize: 31 / 2.2,
    fontWeight: '700',
  },
  buttonShell: {
    marginTop: 26,
    borderRadius: 30,
    borderWidth: 1.4,
    borderColor: 'rgba(255, 34, 163, 0.95)',
    shadowColor: '#FF2AA3',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 7,
  },
  buttonShellDisabled: {
    borderColor: 'rgba(255, 34, 163, 0.4)',
    shadowOpacity: 0.1,
    elevation: 2,
  },
  buttonGradient: {
    height: 58,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: '#E31A97',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonLabelDisabled: {
    color: 'rgba(227, 26, 151, 0.5)',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
    marginTop: 10,
  },
});

export default OtpScreen;
