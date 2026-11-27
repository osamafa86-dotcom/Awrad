import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { AuthScreen } from '../../src/components/AuthScreen';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/lib/theme';
import { ar } from '../../src/messages/ar';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase answers a not-yet-invited email with `otp_disabled` / "Signups not allowed". */
export function isUnknownEmailError(error: { code?: string; message?: string }): boolean {
  return error.code === 'otp_disabled' || /signups? not allowed/i.test(error.message ?? '');
}

export default function Login() {
  const { colors, type } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(address)) {
      setError(ar.auth.invalidEmail);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const { error: failure } = await supabase.auth.signInWithOtp({
        email: address,
        // Accounts are created by invitation only: an unknown email must not self-register.
        options: { shouldCreateUser: false },
      });
      if (failure) {
        setError(isUnknownEmailError(failure) ? ar.auth.unknownEmail : ar.auth.sendFailed);
        return;
      }
      router.push({ pathname: '/(auth)/verify', params: { email: address } });
    } catch {
      setError(ar.auth.sendFailed);
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthScreen
      title={ar.auth.loginTitle}
      subtitle={ar.auth.loginSubtitle}
      footer={<Text style={[type.bodySm, { color: colors.textSecondary }]}>{ar.auth.notRegistered}</Text>}
    >
      <TextField
        label={ar.auth.emailLabel}
        placeholder={ar.auth.emailPlaceholder}
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (error) setError(null);
        }}
        error={error ?? undefined}
        ltr
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
      />
      <Button
        label={sending ? ar.auth.sending : ar.auth.sendCode}
        accessibilityLabel={ar.auth.sendCode}
        loading={sending}
        onPress={() => void submit()}
      />
    </AuthScreen>
  );
}
