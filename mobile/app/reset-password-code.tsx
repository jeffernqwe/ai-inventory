import { useEffect, useMemo, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import CodeInput from '../components/CodeInput';
import { requestPasswordResetCode, verifyPasswordResetCode } from '../lib/api';
import { ApiError } from '../lib/client';
import { beginVerifiedReset } from '../lib/passwordResetSession';
import { spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * AUTH-06 (two-step recovery) — STEP ONE: verify the emailed reset code.
 *
 * WHY THIS SCREEN EXISTS. Firebase's reset email can no longer be pointed at a destination we
 * choose — the project's email-template editor refuses every write
 * (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`) — so the "click a link, finish in a browser" journey is
 * both unconfigurable and, when it works, a browser form that revokes nothing. The code arrives by
 * email, the person types it here, and the rest happens inside the app.
 *
 * IT ASKS FOR THE CODE AND NOTHING ELSE. The new password lives on the next screen, because two
 * questions on one form made the journey read as one long step and made a wrong code and a
 * rejected password indistinguishable in the same error slot. This screen has one job, one field
 * and one button.
 *
 * WHAT IT NEVER CARRIES. The code lives in this component's state and leaves only in the request
 * body; it is never rendered back, logged, persisted or put in a route param. On success the
 * server's short-lived authorization is handed to `lib/passwordResetSession` — memory, not
 * navigation state — and the next screen reads it from there. The only route parameter is the
 * ADDRESS, which the person typed on the previous screen and which identifies no account on its
 * own: the server resolves the account from the challenge the code belongs to.
 *
 * A VERIFIED CODE IS SPENT. The server refuses to verify the same code twice, so a person who
 * leaves this journey after verifying asks for a new code; the resend control here is exactly that
 * route, and it starts a fresh challenge which supersedes the old one.
 */
const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;
/**
 * The server's `PASSWORD_RESET_CODE_TTL_MINUTES`, stated to the person because an expired code is
 * otherwise indistinguishably "wrong". Pinned to the server's own source by
 * `__tests__/password-reset-verify.test.tsx`, so the two cannot drift apart silently — the guard
 * `verify-email.tsx` already uses for the same number.
 */
const CODE_TTL_MINUTES = 10;

const CODE_SENT_MESSAGE = 'Password reset code sent. Check your inbox and spam folder.';
const GENERIC_FAILURE = 'Something went wrong. Please try again.';
const EMPTY_CODE_MESSAGE = 'Enter the 6-digit code from your email.';

const SUBTITLE = `Enter the ${CODE_LENGTH}-digit code we emailed you. It expires in ${CODE_TTL_MINUTES} minutes — you will choose a new password on the next screen.`;

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
    linkRow: {
      ...type.bodySmall,
      color: colors.textMuted,
      alignSelf: 'stretch',
      textAlign: 'center',
      marginTop: spacing.md,
    },
  });

export default function ResetPasswordCodeScreen() {
  // The address comes from the request screen. A missing one is a broken route rather than a
  // failure: the person is sent back to ask for a code, which is the only thing that fixes it.
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email.trim() : '';

  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // IN MEMORY ONLY, deliberately: a cooldown describes the server's current window, and persisting
  // it would keep the control disabled after the window has moved on.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

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
    // A FRIENDLY PRE-CHECK THAT SAVES SOMETHING REAL: the challenge allows five attempts, and a
    // half-typed code would be refused by the server as an invalid code, spending a guess the
    // person never made.
    if (code.length !== CODE_LENGTH) {
      setFieldErrors({ code: EMPTY_CODE_MESSAGE });
      return;
    }

    setBusy(true);
    setFormError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const verified = await verifyPasswordResetCode({ email, code });
      // THE SERVER'S OWN WINDOW, not a client constant, and held in memory rather than in the
      // navigation route — see `lib/passwordResetSession.ts`.
      beginVerifiedReset({
        email,
        resetToken: verified.resetToken,
        expiresInSeconds: verified.expiresInSeconds,
      });
      // `replace`, not `push`: the code has just been spent, so going back to this screen could
      // only offer a field that the server will refuse.
      router.replace('/reset-password-new');
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else
        setFormError(
          (err as { message?: string } | null)?.message ||
            'That code could not be verified. Please try again.'
        );
    } finally {
      setBusy(false);
    }
  }

  const resendLabel = coolingDown
    ? `Resend code in ${formatRemaining(remainingSeconds)}`
    : 'Resend code';

  return (
    <AuthLayout
      title="Enter your reset code"
      subtitle={SUBTITLE}
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
      <Banner type="success" text={notice} />
      <CodeInput
        label="Reset code"
        value={code}
        onChangeText={(value: string) => {
          // Typing is the person acting on the previous refusal, so the stale reason goes with it.
          if (fieldErrors.code) setFieldErrors({});
          setCode(value);
        }}
        error={fieldErrors.code}
        required
        // The field declares itself as a one-time code to the platform (inside `CodeInput`), which
        // is what lets Android's autofill and the iOS QuickType bar offer all six digits instead of
        // making the person leave the app to copy them.
        onSubmitEditing={submit}
      />
      <Button
        title="Verify code"
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
        We will ask for your new password once the code is verified. Checking the code does not
        change anything on your account yet.
      </Text>
      <Text style={styles.linkRow}>
        Wrong address?{' '}
        <Link href="/forgot-password" style={styles.link}>
          Start over
        </Link>
      </Text>
    </AuthLayout>
  );
}
