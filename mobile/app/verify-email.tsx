import { useEffect, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
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

/**
 * AUTH-04-F — the email-verification screen, now the CUSTOM 6-DIGIT CODE flow.
 *
 * WHY IT EXISTS. An identity Firebase has authenticated but whose address is not verified
 * owns no Inventory AI User and therefore no session, so it never reaches the `(app)`
 * group (whose layout redirects anyone who is not signed in). It is held here instead.
 *
 * WHAT IT DOES NOT DO. It never carries a token, uid or email: the identity is read from
 * the Firebase layer inside `lib/auth.tsx`, the business details come from the in-memory
 * onboarding state, and the code leaves this screen only in the body of the confirm
 * request. It never signs anyone in by itself — only a server-issued session does, and the
 * signedIn guard below is what leaves this screen. No route parameter is read.
 *
 * THREE STATES, decided entirely by the in-memory onboarding value:
 *
 *   'none'               nothing is waiting -> Login (a redirect, not a dead end).
 *   'verify-unreachable' a persisted identity exists but its state could not be read ->
 *                        the safe unreachable state: Try Again + Wrong account? Sign out.
 *   'verify-email'       the code form.
 *
 * THE CODE FLOW. "Send verification code" (or "Resend code" once one has been sent) asks
 * the AUTH-04 request endpoint for a fresh six-digit code; the code is mailed by the
 * server and never returned to this app. "Verify" submits it to the confirm endpoint, and
 * on success the context reloads Firebase, mints a forced-refresh token, registers a
 * pending tenant, and exchanges — after which the signedIn guard redirects away.
 *
 * THE RESEND COOLDOWN IS THE SERVER'S NUMBER. A 429 carries `Retry-After`, which is read
 * verbatim; a successful send starts the server's documented 60-second window locally, so
 * the button cannot be used to earn a guaranteed immediate 429. Nothing here invents a
 * cooldown length.
 */
const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;

const CODE_SENT_MESSAGE = 'Verification code sent. Check your inbox and spam folder.';
const STILL_UNVERIFIED_MESSAGE =
  'That code was accepted, but your email is not verified yet. Try again in a moment.';
const GENERIC_FAILURE_MESSAGE = 'Something went wrong. Please try again.';
const EMPTY_CODE_MESSAGE = 'Enter the 6-digit code from your email.';

const UNREACHABLE_TITLE = 'Check your connection';
const UNREACHABLE_SUBTITLE = 'We could not confirm your sign-in just now.';
const UNREACHABLE_BODY =
  'We could not reach the verification service. Check your connection, then try again.';

/** Server field errors become per-input errors, exactly as on the other auth screens. */
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
  });

export default function VerifyEmailScreen() {
  const {
    status,
    user,
    firebaseOnboarding,
    requestVerificationCode,
    confirmVerificationCode,
    retryVerificationResume,
    cancelFirebaseOnboarding,
    verificationEntryError,
    clearVerificationEntryError,
  } = useSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  // IN-MEMORY ONLY, deliberately: a cooldown is a fact about the server's current window,
  // and persisting it would keep the button disabled after the window has moved on.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Ticks only while a cooldown is running, and clears the stale notice with it.
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

  // AUTH-04-F (Option B) — a registration whose INITIAL code request failed arrives here
  // with a one-shot reason (a safe sentence only). It is shown until the person acts, at
  // which point their own action's outcome takes over. It is never re-sent automatically.
  const shownError = error ?? verificationEntryError;

  if (status === 'signedIn') return <Redirect href={defaultHomePath(user)} />;
  // Nothing is waiting to be verified: the probe found no identity, or a verified one.
  // A redirect rather than a dead-end screen — the probe already decided this.
  if (firebaseOnboarding === 'none') return <Redirect href="/login" />;

  function errorMessage(err: unknown): string {
    return (err as { message?: string } | null)?.message || GENERIC_FAILURE_MESSAGE;
  }

  async function wrongAccount(): Promise<void> {
    setBusy(true);
    setError(null);
    clearVerificationEntryError();
    try {
      await cancelFirebaseOnboarding();
    } catch {
      setError(GENERIC_FAILURE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(): Promise<void> {
    if (coolingDown) return;
    setSending(true);
    setError(null);
    setNotice(null);
    clearVerificationEntryError();
    try {
      await requestVerificationCode();
      setCodeSent(true);
      setNotice(CODE_SENT_MESSAGE);
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    } catch (err) {
      // The server states the wait on a 429; honour it verbatim rather than guessing.
      const wait = err instanceof ApiError ? err.retryAfter : null;
      if (typeof wait === 'number' && wait > 0) {
        setCooldownUntil(Date.now() + wait * 1000);
      }
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function submit(): Promise<void> {
    const trimmed = code.trim();
    if (!trimmed) {
      setFieldErrors({ code: EMPTY_CODE_MESSAGE });
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    clearVerificationEntryError();
    try {
      const signedIn = await confirmVerificationCode(trimmed);
      // `null` means Firebase still reports the address unverified after a successful
      // confirm — an ordinary state, not a failure.
      if (!signedIn) setNotice(STILL_UNVERIFIED_MESSAGE);
      // On success the signedIn guard above redirects this screen away.
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function tryAgain(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await retryVerificationResume();
    } catch {
      setError(GENERIC_FAILURE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  if (firebaseOnboarding === 'verify-unreachable') {
    return (
      <AuthLayout
        title={UNREACHABLE_TITLE}
        subtitle={UNREACHABLE_SUBTITLE}
        footer={
          <Text style={styles.footerText}>
            Wrong account?{' '}
            <Text style={styles.link} onPress={wrongAccount}>
              Sign out
            </Text>
          </Text>
        }
      >
        <Banner type="info" text={UNREACHABLE_BODY} />
        <Banner type="error" text={error} />
        <Button title="Try again" onPress={tryAgain} loading={busy} full />
      </AuthLayout>
    );
  }

  const resendLabel = coolingDown
    ? `Resend code in ${formatRemaining(remainingSeconds)}`
    : codeSent
      ? 'Resend verification code'
      : 'Send verification code';

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Enter the 6-digit code we sent to your email address."
      footer={
        <Text style={styles.footerText}>
          Wrong account?{' '}
          <Text style={styles.link} onPress={wrongAccount}>
            Sign out
          </Text>
        </Text>
      }
    >
      {notice ? <Banner type="info" text={notice} /> : null}
      <Banner type="error" text={shownError} />
      <Input
        name="code"
        label="Verification code"
        value={code}
        onChangeText={(value: string) =>
          setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH))
        }
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        placeholder="123456"
        error={fieldErrors.code}
        required
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button
        title="Verify"
        onPress={submit}
        loading={busy}
        disabled={sending || coolingDown || code.length === 0}
        full
      />
      <Button
        title={resendLabel}
        variant="secondary"
        onPress={sendCode}
        loading={sending}
        disabled={busy || sending || coolingDown}
        full
      />
    </AuthLayout>
  );
}
