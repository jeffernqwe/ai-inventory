import { useMemo, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Input from '../components/Input';
import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { defaultHomePath } from '../lib/permissions';
import { spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    footer: { alignSelf: 'stretch' },
    // alignSelf:'stretch' + centred text so the "New to Inventory AI? <link>"
    // line wraps cleanly instead of shrink-wrapping off-centre at large scales.
    footerText: {
      ...type.bodySmall,
      color: colors.textMuted,
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    // Margin rather than a `gap` on the wrapper: the two lines are separate
    // Text nodes precisely so each centres on its own when it wraps.
    footerSpaced: { marginTop: spacing.md },
    link: { color: colors.link, fontWeight: '700' },
  });

function fieldMap(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

export default function LoginScreen() {
  const { status, user, signIn } = useSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Redirect href={defaultHomePath(user)} />;

  async function submit(): Promise<void> {
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await signIn({ email, password });
      // Navigation: on success the signedIn guard redirects this screen away.
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError((err as { message?: string } | null)?.message || 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your inventory."
      footer={
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            <Link href="/forgot-password" style={styles.link}>
              Forgot password?
            </Link>
          </Text>
          <Text style={[styles.footerText, styles.footerSpaced]}>
            New to Inventory AI?{' '}
            <Link href="/register" style={styles.link}>
              Create an account
            </Link>
          </Text>
        </View>
      }
    >
      <Banner type="error" text={formError} />
      <Input
        name="email"
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="you@company.com"
        error={fieldErrors.email}
        required
        returnKeyType="next"
      />
      <Input
        name="password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        error={fieldErrors.password}
        required
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Sign In" onPress={submit} loading={busy} full />
    </AuthLayout>
  );
}
