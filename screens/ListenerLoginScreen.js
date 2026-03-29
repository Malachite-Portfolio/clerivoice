import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import AppLogo from '../components/AppLogo';
import { loginListener } from '../services/authApi';
import { useAuth } from '../context/AuthContext';

const ListenerLoginScreen = ({ navigation }) => {
  const { setSession } = useAuth();
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!phoneOrEmail.trim() || !password.trim()) {
      setError('Please enter listener ID/phone/email and password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const auth = await loginListener({
        phoneOrEmail: phoneOrEmail.trim(),
        password: password.trim(),
      });

      await setSession({
        user: auth.user,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      });

      navigation.reset({
        index: 0,
        routes: [{ name: 'ListenerHome' }],
      });
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        'Unable to login listener account. Please check credentials.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#05020D', '#070113', '#130322']} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>

          <AppLogo size="md" style={styles.logo} />

          <Text style={styles.title}>Listener Login</Text>
          <Text style={styles.subtitle}>Sign in to receive live call and chat requests.</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Listener ID / Phone / Email</Text>
            <TextInput
              value={phoneOrEmail}
              onChangeText={setPhoneOrEmail}
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
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={onSubmit}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Login as Listener</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchLink}
            onPress={() => navigation.navigate('PhoneNumber')}
            activeOpacity={0.85}
          >
            <Text style={styles.switchText}>Switch to User Login</Text>
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
  switchLink: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  switchText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
});

export default ListenerLoginScreen;
