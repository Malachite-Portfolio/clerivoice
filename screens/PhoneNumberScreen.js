import React, { useMemo, useState } from 'react';
import {
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
import { sendOtp } from '../services/authApi';
import AppLogo from '../components/AppLogo';

const PhoneNumberScreen = ({ navigation }) => {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidPhone = useMemo(() => /^\d{10}$/.test(phone), [phone]);

  const onPhoneChange = (text) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 10);
    setPhone(cleaned);
    if (error) {
      setError('');
    }
  };

  const onContinue = async () => {
    if (!isValidPhone) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    const fullPhone = `+91${phone}`;

    try {
      setLoading(true);
      setError('');
      await sendOtp(fullPhone);
      navigation.navigate('Otp', { phone: fullPhone });
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        'Unable to send OTP right now. Please check backend connection.';
      setError(message);
    } finally {
      setLoading(false);
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
          <View style={styles.contentWrap}>
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
            <Text style={styles.subtitle}>We'll send you a verification code</Text>

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
              style={[styles.buttonShell, !isValidPhone && styles.buttonShellDisabled]}
            >
              <LinearGradient
                colors={['#1A1132', '#2C1842']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.buttonGradient}
              >
              <Text style={[styles.buttonLabel, !isValidPhone && styles.buttonLabelDisabled]}>
                  {loading ? 'Sending...' : 'Continue'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>
            Your number is private and used only for secure verification.
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
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  contentWrap: {
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
    marginBottom: 30,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontSize: 44 / 1.6,
    lineHeight: 36,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 31 / 2.1,
    marginBottom: 28,
    fontWeight: '500',
  },
  phoneInputWrap: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 34, 163, 0.7)',
    backgroundColor: 'rgba(31, 18, 46, 0.6)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeSection: {
    width: 76,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: {
    color: theme.colors.textPrimary,
    fontSize: 32 / 1.8,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  codeDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 31 / 1.9,
    marginLeft: 14,
    paddingRight: 16,
    fontWeight: '500',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
    marginTop: 10,
    marginLeft: 4,
  },
  buttonShell: {
    marginTop: 24,
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
    color: 'rgba(227, 26, 151, 0.45)',
  },
  footerText: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 16 / 1.25,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 26,
    marginBottom: 8,
  },
});

export default PhoneNumberScreen;
