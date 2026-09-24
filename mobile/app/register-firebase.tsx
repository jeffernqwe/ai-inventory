import { useMemo, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Input from '../components/Input';
import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { FirebaseAuthError } from '../lib/firebase-auth';
import { defaultHomePath } from '../lib/permissions';
import { type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * Phase 32J — onboarding for an identity Firebase has ALREADY authenticated.
 *
 * WHY THIS SCREEN EXISTS AND `/register` COULD NOT DO THE JOB. `REGISTRATION_REQUIRED`
 * is answered by `POST /api/auth/firebase/exchange` for an identity that Firebase
 * verified but that owns no Inventory AI account. That identity is signed in to
 * Firebase at the moment of the refusal, and it is the ONLY thing that may be
 * registered — so the remaining question is a business name. The email/password
 * form asks for an email the user has just proved and a password that would cause
 * `ensureFirebaseAccount` to mint a SECOND Firebase identity, which the server then
 * refuses (`EMAIL_IN_USE`) or which simply is not the identity that was
 * authenticated. Neither outcome can produce a tenant.
 *
 * This screen therefore collects exactly what is missing:
 *
 *   required  businessName
 *   optional  name
 *
 * It collects no email, no password, no confirmation, and nothing that could be
 * mistaken for an identity or an authorization claim. The identity is not a field
 * of anything here — it is read from the Firebase Auth layer inside
 * `completeFirebaseRegistration` (lib/auth.tsx), so no token, uid or email is held
 * by this component, passed as a route parameter, or persisted anywhere.
 *
 * WHAT IT DOES NOT DO. It never links the identity to an existing account: a 409
 * `EMAIL_IN_USE` is reported and the user is pointed at Sign in, because Phase 32H
 * requires an explicit authenticated link over an existing session rather than an
 * address match. It also never retries registration to recover from a failed
 * exchange — the context resumes at the exchange, so a retry cannot create a second
 * business.
 */

/** The server's code for "this email already belongs to an Inventory AI account". */
const EMAIL_IN_USE = 'EMAIL_IN_USE';

/**
 * Fixed client copy for every failure this screen cannot describe precisely.
 *
 * A fixed sentence is used rather than the thrown error's own message because the
 * one failure the backend reports generically is the Firebase UID collision, which
 * reaches the client as an ordinary 500 whose text is a server implementation
 * detail. Relaying it would leak internals and help nobody; a person can act on
 * "please try again" and an operator can read the server log. This is the same
 * reasoning Phase 26B-3 used for mail and Phase 32H for link conflicts.
 */
const GENERIC_FAILURE_MESSAGE = 'We could not create your account. Please try again.';

/**
 * The `EMAIL_IN_USE` sentence, written here rather than relayed.
 *
 * The server's own message ("An account with this email already exists") states the
 * fact but not the way out; this one names the action, which is the whole point of
 * the case — the identity must be linked from inside its existing account, never
 * attached from here.
 */
const EXISTING_ACCOUNT_MESSAGE =
  'An existing Inventory AI account already uses this email. Sign in to that account to continue.';

/** The identity is gone, so there is nothing to register on this device. */
const NO_SESSION_MESSAGE = 'Your sign-in has expired. Sign in again to continue.';

/** Fields this screen renders; a server field error for anything else has no input. */
const OWN_FIELDS = new Set(['businessName', 'name']);

/** Same mapping `/register` uses: server field errors become per-input errors. */
function fieldMap(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

/**
 * The sentence to show at form level. Never returns a raw unknown error's message,
 * so a collision (a generic 500) can only ever produce `GENERIC_FAILURE_MESSAGE`.
 */
function messageFor(err: unknown): string {
  if (err instanceof ApiError && err.code === EMAIL_IN_USE) return EXISTING_ACCOUNT_MESSAGE;
  if (err instanceof FirebaseAuthError) return err.message || GENERIC_FAILURE_MESSAGE;
  return GENERIC_FAILURE_MESSAGE;
}

/** True for the two failures whose remedy is "sign in instead", not "try again". */
function offersSignIn(err: unknown): boolean {
  return err instanceof FirebaseAuthError || (err instanceof ApiError && err.code === EMAIL_IN_USE);
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    // alignSelf:'stretch' + centred text so the footer line wraps cleanly instead
    // of shrink-wrapping off-centre at large scales — the same treatment
    // `login.tsx` and `register.tsx` give their footers.
    footerText: {
      ...type.bodySmall,
      color: colors.textMuted,
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    actionRow: { ...type.bodySmall, alignSelf: 'stretch', textAlign: 'center' },
    link: { color: colors.link, fontWeight: '700' },
  });

export default function FirebaseRegisterScreen() {
  const { status, user, firebaseRegistrationRequired, completeFirebaseRegistration } = useSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [signInInstead, setSignInInstead] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Redirect href={defaultHomePath(user)} />;

  /**
   * Nothing outstanding means nothing to register.
   *
   * `firebaseRegistrationRequired` is armed only by the refusal that creates this
   * journey, so reaching this route without it — a stale deep link, a cold start
   * after the process was killed — means the Firebase identity it belonged to is
   * gone too: `inMemoryPersistence` (Phase 32D) means a restart has no Firebase user
   * at all. Rendering the form anyway would invite the user to type a business name
   * and then fail on submit, so the honest answer is the one action that helps. This
   * is the documented cold-start limitation stated plainly rather than papered over,
   * and it fails SAFE: no request is made, nothing is fabricated, and no credential
   * is reconstructed.
   */
  if (!firebaseRegistrationRequired) {
    return (
      <AuthLayout
        title="Start again"
        subtitle="There is no sign-in to finish registering."
        footer={
          <Text style={styles.footerText}>
            Already have an account?{' '}
            <Link href="/login" style={styles.link}>
              Sign in
            </Link>
          </Text>
        }
      >
        <Banner type="error" text={NO_SESSION_MESSAGE} />
      </AuthLayout>
    );
  }

  async function submit(): Promise<void> {
    // UX validation only — the client guard saves a round trip, and the backend
    // remains authoritative (`validateFirebaseRegister` requires `businessName` and
    // bounds it to the same length this form does not exceed).
    const trimmedBusinessName = businessName.trim();
    if (!trimmedBusinessName) {
      setFieldErrors({ businessName: 'Business name is required' });
      return;
    }

    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    setSignInInstead(false);
    try {
      await completeFirebaseRegistration({
        businessName: trimmedBusinessName,
        // Omitted rather than sent empty: the server treats an absent name as
        // "provider supplied none" and falls back to the email's local part, while
        // an empty string would be a value a reader has to interpret.
        name: name.trim() || undefined,
      });
      // Navigation: on success the signedIn guard above redirects this screen away,
      // so the new owner lands in the app without a second sign-in.
    } catch (err) {
      const fields = fieldMap(err);
      const own: Record<string, string> = {};
      const orphaned: string[] = [];
      for (const [field, message] of Object.entries(fields)) {
        if (OWN_FIELDS.has(field)) own[field] = message;
        else orphaned.push(message);
      }
      if (Object.keys(own).length) setFieldErrors(own);
      // A field error naming an input this screen does not render — `idToken`, for
      // instance, when a verified identity carries no email — has nowhere to land,
      // so it is promoted to form level rather than dropped silently (the rule
      // Phase 27 established for a field error with no input of its own).
      if (orphaned.length) setFormError(orphaned[0] ?? null);
      else if (Object.keys(fields).length === 0) setFormError(messageFor(err));
      setSignInInstead(offersSignIn(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Your sign-in is verified. Name your business to finish."
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
      {signInInstead ? (
        <Text style={styles.actionRow}>
          <Link href="/login" style={styles.link}>
            Sign in to your existing account
          </Link>
        </Text>
      ) : null}
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
        helper="Optional — defaults to your email name"
        error={fieldErrors.name}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Create Account" onPress={submit} loading={busy} full />
    </AuthLayout>
  );
}
