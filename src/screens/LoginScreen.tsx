import { showAlert } from '../components/DarkAlert';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import Loader from '../components/Loader';

let Config: any = {};
try { Config = require('react-native-config').default || {}; } catch {}

const REMEMBER_KEY = 'janelle.rememberMe';

const C = {
  page: '#0F1724',
  surface: '#162032',
  sunk: '#1E2A40',
  ink: '#F1F5F9',
  inkSoft: '#BFCBDB',
  inkFaint: '#8C9BB2',
  line: '#2C3A52',
  lineSoft: '#222F44',
  brass: '#2563EB',
  brassDeep: '#60A5FA',
  nav: '#0F1B2D',
  good: '#4ADE80',
  crit: '#F87171',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then(saved => {
      if (saved) {
        const { email: savedEmail, password: savedPassword } = JSON.parse(saved);
        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
        if (savedPassword) {
          setPassword(savedPassword);
        }
      }
    }).catch(() => {});
  }, []);

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) return;
    setBusy(true);
    setError(null);
    try {
      // Try direct fetch first — more reliable on React Native than Supabase SDK
      const sbUrl = Config.SUPABASE_URL || '';
      const sbKey = Config.SUPABASE_ANON_KEY || '';
      const res = await fetch(
        `${sbUrl}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: sbKey,
          },
          body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
        },
      );
      const data = await res.json();
      if (data.access_token) {
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
      } else {
        throw new Error(data.msg || data.error_description || 'Invalid login credentials');
      }
      if (rememberMe) {
        await AsyncStorage.setItem(
          REMEMBER_KEY,
          JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
        );
      } else {
        await AsyncStorage.removeItem(REMEMBER_KEY);
      }
    } catch (err) {
      const message = (err as Error).message;
      const shown = /banned/i.test(message)
        ? 'This account has been disabled. Ask the studio admin to turn it back on.'
        : message;
      setError(shown);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    const address = email.trim();
    if (!address) {
      setError('Enter your email address first, then press this again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await supabase.auth.resetPasswordForEmail(address);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {busy && <Loader fullscreen message="Signing in..." />}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
        keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
        {/* Logo */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.divider} />
          <Text style={styles.tagline}>
            Every detail, every deadline, every delivery — handled with the
            precision your studio deserves.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to your studio workspace.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="you@studio.com"
            placeholderTextColor={C.inkFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={C.inkFaint}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeText}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.rememberRow}
            onPress={() => setRememberMe(!rememberMe)}>
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.rememberText}>Remember me</Text>
          </Pressable>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {sent && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                If that address has an account, a reset link is on its way. It
                expires in an hour.
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={submit}
            disabled={busy}>
            <Text style={styles.primaryBtnText}>{busy ? 'Please wait...' : 'Sign in'}</Text>
          </Pressable>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          <Pressable
            style={styles.googleBtn}
            onPress={() => {
              showAlert(
                'Coming Soon',
                'Google sign-in is currently under development. Please use email and password to sign in.',
                [{ text: 'Got it' }],
              );
            }}
            disabled={busy}>
            <Image source={require('../../assets/google.webp')} style={styles.googleIcon} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </Pressable>

          <Pressable onPress={forgot} disabled={busy}>
            <Text style={styles.forgotText}>Forgot your password?</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            The system reads Gmail and Drive and creates drafts — it never sends
            on your behalf. Access is scoped and revocable.
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.nav,
  },
  inner: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    width: '100%',
  },
  logo: {
    width: 220,
    height: 110,
    tintColor: '#fff',
    opacity: 0.9,
    alignSelf: 'center',
  },
  divider: {
    width: 56,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 20,
    marginBottom: 14,
  },
  tagline: {
    maxWidth: 230,
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.22)',
  },
  form: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: C.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: C.inkFaint,
    marginBottom: 20,
  },
  input: {
    height: 44,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    fontSize: 14,
    color: C.ink,
    marginBottom: 10,
  },
  passwordWrap: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 60,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    height: 44,
    justifyContent: 'center',
  },
  eyeText: {
    fontSize: 12,
    color: C.inkFaint,
    fontWeight: '500',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: C.brass,
    borderColor: C.brass,
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: -1,
  },
  rememberText: {
    fontSize: 13,
    color: C.inkSoft,
  },
  errorBox: {
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12.5,
    color: C.crit,
  },
  successBox: {
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  successText: {
    fontSize: 12.5,
    color: C.good,
  },
  primaryBtn: {
    height: 44,
    borderRadius: 8,
    backgroundColor: C.brass,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.line,
  },
  orText: {
    fontSize: 12,
    color: C.inkFaint,
    marginHorizontal: 12,
  },
  googleBtn: {
    height: 44,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  googleIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
  },
  forgotText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: C.inkFaint,
    textAlign: 'center',
    paddingVertical: 6,
  },
  disclaimer: {
    fontSize: 11.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.18)',
    marginTop: 20,
    textAlign: 'center',
  },
});
