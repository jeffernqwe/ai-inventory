import { useMemo, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Input from '../components/Input';
import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { defaultHomePath } from '../lib/permissions';
import { type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    // alignSelf:'stretch' + centred text so the "Already have an account? <link>"
    // line wraps cleanly instead of shrink-wrapping off-centre at large scales.
    footerText: {
      ...type.bodySmall,
      color: colors.textMuted,
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    link: { color: colors.link, fontWeight: '700' },
  });

function fieldMap(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

export default function RegisterScreen() {
  const { status, user, signUp, firebaseOnboarding } = useSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Redirect href={defaultHomePath(user)} />;

  // Phase 16 - an identity created but not yet verified has NO session, so it never
  // reaches the signedIn guard above; this is the route that carries it to the verify
  // screen. It reads the in-memory onboarding state, never a route parameter.
  if (firebaseOnboarding === 'verify-email') return <Redirect href="/verify-email" />;

  async function submit(): Promise<void> {
    // Required-field validation runs first, so an empty form never reaches the
    // Firebase sign-up path. The password/confirm-match rule is preserved: an
    // empty confirmation reports its own required error, and a non-empty one
    // that differs still reports 'Passwords do not match'.
    const next: Record<string, string> = {};
    if (!businessName.trim()) next.businessName = 'Business name is required';
    if (!name.trim()) next.name = 'Name is required';
    if (!email.trim()) next.email = 'Email is required';
    if (!password) next.password = 'Password is required';
    if (!confirm) next.confirm = 'Confirm password is required';
    else if (confirm !== password) next.confirm = 'Passwords do not match';
    if (Object.keys(next).length) {
      setFieldErrors(next);
      return;
    }
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      // Register issues no token — signUp logs the new owner in afterwards.
      await signUp({ businessName, name, email, password });
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError((err as { message?: string } | null)?.message || 'Unable to create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="You'll get a new business and an Owner account."
      footer={
        <Text style={styles.footerText}>
          Already have an account?{' '}
          <Link href="/login" style={styles.link}>
            Sign in
          </Link>
        </Text>
      }
    >
      <Banner type="error" text={formError} />
      <Input
        name="businessName"
        label="Business name"
        value={businessName}
        onChangeText={setBusinessName}
        placeholder="Acme Retail"
        error={fieldErrors.businessName}
        required
      />
      <Input
        name="name"
        label="Your name"
        value={name}
        onChangeText={setName}
        placeholder="Jane Doe"
        error={fieldErrors.name}
        required
      />
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
      />
      <Input
        name="password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 8 characters"
        helper="Min 8 characters"
        error={fieldErrors.password}
        required
      />
      <Input
        name="confirm"
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        placeholder="Repeat your password"
        error={fieldErrors.confirm}
        required
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Create Account" onPress={submit} loading={busy} full />
    </AuthLayout>
  );
}
