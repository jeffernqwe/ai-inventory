import { useMemo, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import { useSession } from '../lib/auth';
import { defaultHomePath } from '../lib/permissions';
import { type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * Phase 16 — the email-verification screen.
 *
 * WHY IT EXISTS. An identity Firebase has authenticated but whose address is not verified
 * owns no Inventory AI User and therefore no session, so it never reaches the `(app)`
 * group (whose layout redirects anyone who is not signed in). It is held here instead.
 *
 * WHAT IT DOES NOT DO. It never carries a token, uid or email: the identity is read from
 * the Firebase layer inside `lib/auth.tsx`, the business details come from the in-memory
 * onboarding state, and no credential travels through a route parameter. It also never
 * signs anyone in by itself — only a server-issued session does, and the signedIn guard
 * below is what leaves this screen.
 *
 * THE THREE ACTIONS. Resend asks Firebase to send the message again; continue reloads the
 * identity and, once Firebase reports the address verified, mints a FORCED-refresh token
 * and completes registration and the exchange; sign out abandons the journey and ends the
 * durable Firebase session. A still-unverified continue is an ordinary outcome and is
 * reported as a notice rather than an error.
 */
const NO_VERIFICATION_MESSAGE =
  'There is no sign-in waiting to be verified. Create an account or sign in to continue.';
const VERIFIED_NOT_YET_MESSAGE =
  'Your email is not verified yet. Open the link we sent you, then try again.';
const RESEND_SENT_MESSAGE = 'Verification email sent. Check your inbox and spam folder.';
const GENERIC_FAILURE_MESSAGE = 'Something went wrong. Please try again.';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    footerText: {
      ...type.bodySmall,
      color: colors.textMuted,
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    link: { color: colors.link, fontWeight: '700' },
  });

export default function VerifyEmailScreen() {
  const {
    status,
    user,
    firebaseOnboarding,
    resendVerificationEmail,
    completeEmailVerification,
    cancelFirebaseOnboarding,
  } = useSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Redirect href={defaultHomePath(user)} />;

  if (firebaseOnboarding !== 'verify-email') {
    return (
      <AuthLayout
        title="Start again"
        subtitle="There is no sign-in waiting to be verified."
        footer={
          <Text style={styles.footerText}>
            Already have an account?{' '}
            <Link href="/login" style={styles.link}>
              Sign in
            </Link>
          </Text>
        }
      >
        <Banner type="error" text={NO_VERIFICATION_MESSAGE} />
      </AuthLayout>
    );
  }

  async function resend(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await resendVerificationEmail();
      setNotice(RESEND_SENT_MESSAGE);
    } catch (err) {
      setError((err as { message?: string } | null)?.message || GENERIC_FAILURE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterVerification(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const signedIn = await completeEmailVerification();
      // `null` means the address is still unverified — an ordinary state, not a failure.
      if (!signedIn) setNotice(VERIFIED_NOT_YET_MESSAGE);
      // On success the signedIn guard above redirects this screen away.
    } catch (err) {
      setError((err as { message?: string } | null)?.message || GENERIC_FAILURE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function backToSignIn(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await cancelFirebaseOnboarding();
    } catch {
      setError(GENERIC_FAILURE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="We sent a verification link to your email address."
      footer={
        <Text style={styles.footerText}>
          Wrong account?{' '}
          <Text style={styles.link} onPress={backToSignIn}>
            Sign out
          </Text>
        </Text>
      }
    >
      {notice ? <Banner type="info" text={notice} /> : null}
      <Banner type="error" text={error} />
      <Button
        title="I have verified - continue"
        onPress={continueAfterVerification}
        loading={busy}
        full
      />
      <Button
        title="Resend verification email"
        variant="secondary"
        onPress={resend}
        disabled={busy}
        full
      />
    </AuthLayout>
  );
}
