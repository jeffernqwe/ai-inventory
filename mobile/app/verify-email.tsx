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
 *
 * A CODE MAY ALREADY HAVE BEEN SENT WHEN THIS SCREEN OPENS. Registration requests one
 * before it navigates, so `verificationCodeIssuedAt` (in-memory context state) says so and
 * the screen opens with the truthful subtitle, the "Resend" wording and the remainder of
 * the server's window already counting down. A sign-in for an unverified identity passes
 * `null`, and then the screen correctly says a code will be sent rather than pretending
 * one already was.
 */
const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;
/**
 * The server's `EMAIL_VERIFICATION_TTL_MINUTES`, stated to the person because an
 * expired code is otherwise indistinguishably "wrong". The number is pinned to the
 * server's own source by `__tests__/auth-ux-hardening.test.tsx`, so the two cannot
 * drift apart silently — the same guard `lib/validation.ts` uses for the email and
 * password rules.
 */
const CODE_TTL_MINUTES = 10;

const CODE_SENT_MESSAGE = 'Verification code sent. Check your inbox and spam folder.';
const STILL_UNVERIFIED_MESSAGE =
  'That code was accepted, but your email is not verified yet. Try again in a moment.';
const GENERIC_FAILURE_MESSAGE = 'Something went wrong. Please try again.';
const EMPTY_CODE_MESSAGE = 'Enter the 6-digit code from your email.';

const SUBTITLE_SENT = `Enter the ${CODE_LENGTH}-digit code we emailed you. It expires in ${CODE_TTL_MINUTES} minutes.`;
const SUBTITLE_NOT_SENT =
  `We'll email you a ${CODE_LENGTH}-digit code to confirm this address. It expires in ` +
  `${CODE_TTL_MINUTES} minutes.`;

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
    verificationCodeIssuedAt,
    firebaseRegistrationRequired,
  } = useSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // REGISTRATION SENDS BEFORE IT NAVIGATES, so the screen can open knowing a code is
  // already in flight. Without that, it opened on an enabled "Send verification code"
  // whose only possible answer was the server's resend refusal — a dead control offered
  // at the exact moment the person should be reading their inbox.
  // `typeof === 'number'` rather than `!== null`, so a context value that predates the
  // field (undefined) reads as "nothing sent" instead of claiming a code is in flight.
  const [codeSent, setCodeSent] = useState(typeof verificationCodeIssuedAt === 'number');
  // IN-MEMORY ONLY, deliberately: a cooldown is a fact about the server's current window,
  // and persisting it would keep the button disabled after the window has moved on. The
  // initial value continues the server's 60-second window from the send registration
  // already made, so the countdown is the wait that actually remains rather than a fresh
  // minute invented by this mount.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(() => {
    if (typeof verificationCodeIssuedAt !== 'number') return null;
    const end = verificationCodeIssuedAt + RESEND_COOLDOWN_SECONDS * 1000;
    return end > Date.now() ? end : null;
  });
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
  /**
   * VERIFIED, BUT WITH NO TENANT TO CREATE — FOUND ON A DEVICE.
   *
   * A confirmation that succeeds while `pendingRegistration` is absent (the ordinary
   * result of a cold start: registration details are in-memory, and the restart/resume
   * probe restores only the identity) ends at the exchange, which refuses with
   * `REGISTRATION_REQUIRED`. That refusal armed the registration route — and this screen
   * then sat on its own form showing the refusal's sentence, with no control that goes
   * anywhere. Retrying Verify only re-ran the same exchange, and the only way out was
   * "Wrong account? Sign out" followed by a fresh sign-in.
   *
   * So when the registration route is armed, this screen hands off to it, exactly as the
   * login screen does for the same refusal. The screen does not render a second copy of
   * that journey's form: it holds no identity, and `register-firebase` is where the
   * business name is collected from the authenticated Firebase identity.
   */
  if (firebaseRegistrationRequired) return <Redirect href="/register-firebase" />;
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
    // THE ATTEMPT BUDGET IS FIVE PER CHALLENGE, so an obviously incomplete value must not
    // spend one. The field already strips non-digits and caps at six, which means anything
    // shorter here is an unfinished entry: the server would answer its one
    // indistinguishable "invalid or has expired", describing a malformed submission as a
    // wrong code and burning a guess the person never made.
    if (trimmed.length !== CODE_LENGTH) {
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
      subtitle={codeSent ? SUBTITLE_SENT : SUBTITLE_NOT_SENT}
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
        onChangeText={(value: string) => {
          // Typing is the person acting on the previous refusal, so the stale reason goes
          // with it: leaving "that code is invalid or has expired" under a code they are
          // halfway through replacing describes the old value, not this one.
          if (fieldErrors.code) setFieldErrors({});
          setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH));
        }}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        placeholder="123456"
        error={fieldErrors.code}
        required
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {/**
       * THE RESEND COOLDOWN MUST NOT BLOCK VERIFYING. It used to: `coolingDown` was part
       * of this button's `disabled`, so after a resend — or after the cooldown the screen
       * starts on a successful send — the code in the person's inbox could not be
       * submitted for a whole minute. The cooldown belongs to the SEND below, which
       * already carries it.
       */}
      <Button
        title="Verify"
        onPress={submit}
        loading={busy}
        disabled={sending || code.length !== CODE_LENGTH}
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
