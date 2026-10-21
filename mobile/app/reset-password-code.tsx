import { useEffect, useMemo, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Input from '../components/Input';
import { confirmPasswordResetCode, requestPasswordResetCode } from '../lib/api';
import { useSession } from '../lib/auth';
import { ApiError } from '../lib/client';
import { spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';
import { passwordStrengthProblem } from '../lib/validation';

/**
 * AUTH-06 — the in-app password reset: a six-digit code, then a new password.
 *
 * WHY THIS SCREEN EXISTS. Firebase's reset email can no longer be pointed at a destination we
 * choose — the project's email-template editor refuses every write
 * (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`) — so the "click a link, finish in a browser" journey is
 * both unconfigurable and, when it works, a browser form that revokes nothing. This screen is the
 * replacement: the code arrives by email, the person types it here, and the new password is set
 * without leaving the app.
 *
 * IT MIRRORS THE VERIFICATION SCREEN ON PURPOSE. Six digits, a ten-minute lifetime, a sixty-second
 * resend cooldown, `Retry-After` honoured verbatim — the same numbers the server enforces and the
 * same sentences the person already met when they created the account. Two different code
 * experiences in one product would be a difference nobody could explain.
 *
 * WHAT IT NEVER CARRIES. The code lives in this component's state and leaves only in the request
 * body; it is never rendered back, logged, persisted or put in a route param. The new password is
 * never stored anywhere either. The only route parameter is the ADDRESS, which the person typed on
 * the previous screen and which identifies no account on its own — the server resolves the account
 * from the challenge the code belongs to.
 *
 * A SUCCESSFUL RESET SIGNS NOBODY IN. The server has already ended every session, so the truthful
 * next step is signing in with the new password — which is also what proves to the person that the
 * change took effect.
 */
const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;
/**
 * The server's `PASSWORD_RESET_CODE_TTL_MINUTES`, stated to the person because an expired code is
 * otherwise indistinguishably "wrong". Pinned to the server's own source by
 * `__tests__/password-reset-code.test.tsx`, so the two cannot drift apart silently — the guard
 * `verify-email.tsx` already uses for the same number.
 */
const CODE_TTL_MINUTES = 10;

const CODE_SENT_MESSAGE = 'Password reset code sent. Check your inbox and spam folder.';
const RESET_COMPLETED = 'Password changed. Please sign in again.';
const GENERIC_FAILURE = 'Something went wrong. Please try again.';
const EMPTY_CODE_MESSAGE = 'Enter the 6-digit code from your email.';

const SUBTITLE = `Enter the ${CODE_LENGTH}-digit code we emailed you, then choose a new password. It expires in ${CODE_TTL_MINUTES} minutes.`;

function fieldMap(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

/** A short, human wait: seconds below a minute, otherwise minutes and seconds. */
function formatRemaining(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  }
  return `${seconds}s`;
}

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

export default function ResetPasswordCodeScreen() {
  // The address comes from the request screen. A missing one is a broken route rather than a
  // failure: the person is sent back to ask for a code, which is the only thing that fixes it.
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email.trim() : '';

  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  /**
   * THE LOCAL SESSION IS CLEARED ON SUCCESS, and this is the same decision `reset-password.tsx`
   * records at its own success path rather than a parallel one.
   *
   * The confirm revoked every session server-side, including any this device held. Leaving the
   * client's stored token in place would make the next screen bounce: *Go to sign in* reaches
   * `/login`, `/login` sees `status === 'signedIn'` and redirects into `(app)`, and the person is
   * dropped into the app on a session the server has already ended — until the first request fails
   * and signs them out. So the claim this screen makes ("every device signed in … is signed out")
   * is made true locally too, before the person is sent anywhere.
   *
   * `clearSession` rather than `signOut`: `signOut` would fire `POST /api/auth/logout` with a token
   * the reset has just killed, which can only fail — and `clearSession` is the half that actually
   * drops what this device holds.
   */
  const { clearSession } = useSession();

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // IN MEMORY ONLY, deliberately: a cooldown describes the server's current window, and persisting
  // it would keep the control disabled after the window has moved on.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [done, setDone] = useState(false);

  // Ticks only while a cooldown is running.
  useEffect(() => {
    if (cooldownUntil === null) return undefined;
    const tick = (): void => {
      const at = Date.now();
      if (at >= cooldownUntil) {
        setCooldownUntil(null);
        return;
      }
      setNow(at);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const remainingSeconds =
    cooldownUntil === null ? 0 : Math.ceil(Math.max(0, cooldownUntil - now) / 1000);
  const coolingDown = cooldownUntil !== null && remainingSeconds > 0;

  if (!email) {
    return (
      <AuthLayout title="Start again" subtitle="We need the email address first.">
        <Banner
          type="error"
          text="This screen is missing the email address it was opened for. Request a new code to continue."
        />
        <Button title="Request a code" onPress={() => router.replace('/forgot-password')} full />
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password changed" subtitle="Sign in with your new password.">
        <Banner type="success" text={RESET_COMPLETED} />
        <Button title="Go to sign in" onPress={() => router.replace('/login')} full />
      </AuthLayout>
    );
  }

  async function resend(): Promise<void> {
    if (coolingDown) return;
    setSending(true);
    setFormError(null);
    setNotice(null);
    try {
      await requestPasswordResetCode(email);
      setNotice(CODE_SENT_MESSAGE);
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    } catch (err) {
      // The server states the wait on a 429; honour it verbatim rather than guessing.
      const wait = err instanceof ApiError ? err.retryAfter : null;
      if (typeof wait === 'number' && wait > 0) {
        setCooldownUntil(Date.now() + wait * 1000);
      }
      setFormError((err as { message?: string } | null)?.message || GENERIC_FAILURE);
    } finally {
      setSending(false);
    }
  }

  async function submit(): Promise<void> {
    // FRIENDLY PRE-CHECKS MIRRORING THE SERVER RULES, and each one saves something real.
    //
    // The code check saves an ATTEMPT: the challenge allows five, and an unfinished entry would be
    // refused by the server as an invalid code, spending a guess the person never made. The
    // password checks save a round trip, and the confirmation check is what the server also does
    // before spending the code — a mismatched confirmation must never cost it.
    const problems: Record<string, string> = {};
    if (code.length !== CODE_LENGTH) problems.code = EMPTY_CODE_MESSAGE;
    if (!newPassword) problems.newPassword = 'New password is required';
    else {
      const strength = passwordStrengthProblem(newPassword);
      if (strength) problems.newPassword = strength;
    }
    if (!confirmPassword) problems.confirmPassword = 'Confirm password is required';
    else if (confirmPassword !== newPassword)
      problems.confirmPassword = 'Passwords do not match';
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      return;
    }

    setBusy(true);
    setFormError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      await confirmPasswordResetCode({ email, code, newPassword, confirmPassword });
      // Every session this device held is already dead server-side — see the note above.
      await clearSession();
      setDone(true);
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError((err as { message?: string } | null)?.message || GENERIC_FAILURE);
    } finally {
      setBusy(false);
    }
  }

  const resendLabel = coolingDown
    ? `Resend code in ${formatRemaining(remainingSeconds)}`
    : 'Resend code';

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={SUBTITLE}
      footer={
        <Text style={styles.footerText}>
          Wrong email?{' '}
          <Link href="/forgot-password" style={styles.link}>
            Start again
          </Link>
        </Text>
      }
    >
      {notice ? <Banner type="info" text={notice} /> : null}
      <Banner type="error" text={formError} />
      <Input
        name="code"
        label="Reset code"
        value={code}
        onChangeText={(value: string) => {
          // Typing is the person acting on the previous refusal, so the stale reason goes with it.
          if (fieldErrors.code) setFieldErrors({});
          setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH));
        }}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        placeholder="123456"
        error={fieldErrors.code}
        required
        // THE ONE FIELD NOBODY TYPES FROM MEMORY. Declaring what it holds is what lets the
        // platform offer the code from the notification or the mail app — `one-time-code` for
        // Android's autofill, `oneTimeCode` for the iOS QuickType bar — instead of making the
        // person leave the app and copy six digits by hand.
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      <Input
        name="newPassword"
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        placeholder="At least 8 characters"
        helper="Min 8 characters"
        error={fieldErrors.newPassword}
        required
        autoCapitalize="none"
      />
      <Input
        name="confirmPassword"
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholder="Repeat your new password"
        error={fieldErrors.confirmPassword}
        required
        autoCapitalize="none"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {/* THE COOLDOWN BELONGS TO THE RESEND, NEVER TO THE SUBMIT: a person who has just asked for
          a second code must still be able to submit the one already in their inbox. */}
      <Button
        title="Set new password"
        onPress={submit}
        loading={busy}
        disabled={sending || code.length !== CODE_LENGTH}
        full
      />
      <Button
        title={resendLabel}
        variant="secondary"
        onPress={resend}
        loading={sending}
        disabled={busy || sending || coolingDown}
        full
      />
      <Text style={styles.body}>
        Your old password stops working immediately, and every device signed in to this account is
        signed out.
      </Text>
    </AuthLayout>
  );
}
