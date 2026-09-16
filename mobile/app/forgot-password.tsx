import { useMemo, useState } from 'react';
import { Link, router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Input from '../components/Input';
import { forgotPassword } from '../lib/api';
import { ApiError } from '../lib/client';
import { spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * Fixed on purpose, and never derived from the response.
 *
 * The server answers one identical 202 whether or not the address exists — and a
 * mail delivery failure raised *after* the account lookup is logged and swallowed
 * to that same 202, because a distinguishable failure there would be an
 * account-existence oracle. Rendering the response body would be the one place
 * the client could undo that, so this screen does not read it.
 */
const REQUEST_ACCEPTED =
  'If an account exists for that email, a password reset link has been sent.';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    footerText: {
      ...type.bodySmall,
      color: colors.textMuted,
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    link: { color: colors.link, fontWeight: '700' },
    body: {
      ...type.body,
      color: colors.textSecondary,
      alignSelf: 'stretch',
      marginBottom: spacing.lg,
    },
  });

function fieldMap(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

/**
 * Request a password reset link (Phase 27). PUBLIC — this route is a sibling of
 * login/register, deliberately outside the `(app)` group, so it renders whether
 * or not a session exists and never waits on the auth boot.
 *
 * The screen has no signedIn redirect: a signed-in visitor who lands here is
 * harmless (the reset would simply end their sessions), and bouncing them into
 * `(app)` would be the silent navigation the phase forbids.
 */
export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(): Promise<void> {
    const value = email.trim();
    // Presence only. The email-shape rule lives in the server's validator and is
    // deliberately not duplicated here, where the two copies would drift apart.
    if (!value) {
      setFieldErrors({ email: 'Email is required' });
      return;
    }

    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await forgotPassword(value);
      setDone(true);
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError((err as { message?: string } | null)?.message || 'Unable to send the reset link. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="Check your email" subtitle="Follow the link to set a new password.">
        <Banner type="success" text={REQUEST_ACCEPTED} />
        <Text style={styles.body}>
          The link opens the Inventory AI app directly. It can only be used once.
        </Text>
        <Button
          title="Back to sign in"
          variant="secondary"
          onPress={() => router.replace('/login')}
          full
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot password?"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Text style={styles.footerText}>
          Remembered it?{' '}
          <Link href="/login" style={styles.link}>
            Sign in
          </Link>
        </Text>
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
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Send reset link" onPress={submit} loading={busy} full />
    </AuthLayout>
  );
}
