import { useMemo, useState } from 'react';
import { Link, router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Input from '../components/Input';
import { forgotPassword } from '../lib/api';
import { ApiError } from '../lib/client';
import { sendFirebasePasswordResetEmail } from '../lib/firebase-auth';
import { spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';
import { emailProblem } from '../lib/validation';

/**
 * Fixed on purpose, and never derived from the response.
 *
 * The server answers one identical 202 whether or not the address exists — and a
 * mail delivery failure raised *after* the account lookup is logged and swallowed
 * to that same 202, because a distinguishable failure there would be an
 * account-existence oracle. Rendering the response body would be the one place
 * the client could undo that, so this screen does not read it.
 *
 * N-3 EXTENDS THAT RULE TO THE FIREBASE PATH, and the text is unchanged because the
 * requirement is the same one. Firebase answers differently depending on a project
 * setting — success for an unknown address with email-enumeration protection on, and
 * `auth/user-not-found` for the same address with it off — so the classification
 * layer reports all of those as sent (see `sendFirebasePasswordResetEmail`), and this
 * one constant is what both paths and both settings show. The precise wording is
 * therefore load-bearing rather than cosmetic: it may not be made more specific
 * without reopening the oracle.
 */
const REQUEST_ACCEPTED =
  'If an account exists for that email, a password reset link has been sent.';

/**
 * The developer-only failure diagnostic, and the one thing this screen adds for it.
 *
 * WHY IT EXISTS. Every failure this screen can report is deliberately reduced to SAFE
 * copy — the request path's own sentence, or the phrase the classification layer chose —
 * and the SDK's code is dropped at exactly the moment it becomes the only thing worth
 * knowing. That is correct for a user and useless for an operator: a send that fails on
 * a real device arrives here as one sentence, and there is no way to tell an expired
 * action code from an unnormalised native code from a code-less native throw, because
 * all three render identically. That is not hypothetical — it is what made the
 * `auth/email-not-found` gap invisible until the platform's own error mapping was read
 * by hand.
 *
 * SO THE CODE IS SHOWN AGAIN, BEHIND `__DEV__`. The guilding rule is that the user's
 * sentence may not change and nothing may be shown to a person who is not developing the
 * app, so this is a second element rather than an appended clause: `__DEV__` is false in
 * every release bundle, the copy above it is byte-identical with and without it, and the
 * code it prints is a Firebase error name — no token, no address, no credential and no
 * SDK message. It names the SOURCE too, because which side failed is the first thing to
 * know and the two are otherwise indistinguishable: `firebase:` is the SDK, `server:` is
 * the custom 26B endpoint.
 */
const DEV_DIAGNOSTIC_PREFIX = 'Diagnostic (dev only) — ';

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
    // Developer-only, so it is styled to read as a note rather than as app copy.
    diagnostic: {
      ...type.bodySmall,
      color: colors.textMuted,
      alignSelf: 'stretch',
      marginBottom: spacing.sm,
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
 *
 * N-3: THE BUILD DECIDES WHICH MAIL IS SENT. A Firebase-configured build asks Firebase
 * to send its own reset email (`sendFirebasePasswordResetEmail`), and only an
 * UNCONFIGURED build falls through to the custom 26B endpoint below. A configured but
 * failing Firebase does NOT fall back — the classification layer reports a failure and
 * this screen shows it — because treating an outage as "try the other mail system"
 * would let anyone who can break Firebase choose the weaker door. Both paths end in the
 * same success state and the same single sentence.
 */
export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Set on every failure, rendered only under `__DEV__`. See DEV_DIAGNOSTIC_PREFIX.
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const value = email.trim();
    // PRESENCE *AND* SHAPE, and the shape rule is still NOT written here.
    //
    // This screen used to check presence only, on the recorded reasoning that a second
    // copy of the server's shape rule would drift away from it. That reasoning was right
    // about the risk and wrong about the only way to avoid it: the rule now lives in
    // exactly ONE client place (`lib/validation.ts`), which does not duplicate it per
    // screen, names the server rule it mirrors, and is pinned to it by
    // `__tests__/auth-validation-rules.test.ts` — a guard that fails if the two ever
    // disagree. So the drift the old comment feared is now a test failure rather than a
    // silent divergence.
    //
    // What that buys is the case this screen could not describe: `owner@company` has no
    // domain suffix, so nothing was caught here, and the outcome depended on the build —
    // Firebase would report it, and a build with no Firebase configuration would send it
    // to the server to be answered in a developer's words. It is now refused before a
    // request is made, and a real typo is distinguished from an empty field.
    const emailIssue = emailProblem(value);
    if (emailIssue) {
      setFieldErrors({ email: emailIssue });
      return;
    }

    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    setDiagnostic(null);
    try {
      // FIREBASE FIRST (N-3). `legacyFallback` is the one state that licenses the custom
      // endpoint, and it means this build has no Firebase configuration at all — it is
      // not a route out of a Firebase failure, which is reported below instead.
      const outcome = await sendFirebasePasswordResetEmail(value);
      if (outcome.kind === 'legacyFallback') {
        await forgotPassword(value);
      } else if (outcome.kind === 'failure') {
        // The code the classification layer decided from — kept for the developer and
        // shown to nobody else. A `null` code is itself the answer: the failure was not
        // a Firebase rejection at all, which is what a native or module error looks like.
        setDiagnostic(`firebase: ${outcome.code ?? '(no code)'}`);
        // A malformed address belongs on the input; everything else is a statement
        // about the request and goes above the form.
        if (outcome.field === 'email') setFieldErrors({ email: outcome.message });
        else setFormError(outcome.message);
        return;
      }
      setDone(true);
    } catch (err) {
      // The other source: the custom 26B endpoint, reached only on an unconfigured
      // build. Its `code` is the server's own — `MAIL_NOT_CONFIGURED` is the one that
      // means no mail transport is set up on the deployment.
      setDiagnostic(`server: ${(err as { code?: string | null } | null)?.code ?? '(no code)'}`);
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
        {/*
          * Deliberately claims nothing about HOW the link is delivered. The earlier
          * wording said the link "opens the Inventory AI app directly", which is only
          * true if Firebase's hosted action handler honours the custom-scheme settings
          * — the open gate L-17/B-2, which no test on this host can settle. A sentence
          * a user reads is not the place to assert an unverified behaviour.
          */}
        <Text style={styles.body}>
          Open the link to choose a new password. It can only be used once.
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
      {__DEV__ && diagnostic ? (
        <Text style={styles.diagnostic} selectable>
          {DEV_DIAGNOSTIC_PREFIX}
          {diagnostic}
        </Text>
      ) : null}
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
