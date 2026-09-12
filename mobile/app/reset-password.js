import { useEffect, useMemo, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Input from '../components/Input';
import { resetPassword } from '../lib/api';
import { useSession } from '../lib/auth';
import { ApiError } from '../lib/client';
import { type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const RESET_COMPLETED = 'Password changed. Please sign in again.';

/**
 * The token arrives from the deep link and from nowhere else. A missing param is
 * `undefined`, and a link carrying the key twice yields an array — neither is a
 * usable token, and neither should ever reach the network. Only the length is
 * checked: the token is base64url and opaque, so any client-side rule about its
 * shape could only ever reject a valid link.
 */
function readToken(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function fieldMap(err) {
  const out = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

const createStyles = (colors) =>
  StyleSheet.create({
    footerText: {
      ...type.bodySmall,
      color: colors.textMuted,
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    link: { color: colors.link, fontWeight: '700' },
  });

/**
 * Complete a password reset (Phase 27). PUBLIC, and a sibling of login/register
 * rather than a member of the `(app)` group: the group layout redirects anyone
 * who is not signed in, which would discard the incoming token before this
 * screen could read it.
 *
 * The token is held only in route params for as long as the screen is mounted —
 * it is never rendered, logged, persisted, or copied into another navigation.
 * It leaves the app in exactly one place: the body of the reset POST.
 */
export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { clearSession } = useSession();

  // Read from the focused route's params rather than latched into state, so a
  // second link delivered while this screen is already open supersedes the first.
  const params = useLocalSearchParams();
  const token = readToken(params.token);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // A new link resets the screen completely — including a success state, which a
  // fresh attempt must never inherit.
  useEffect(() => {
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setFormError(null);
    setDone(false);
    setBusy(false);
  }, [token]);

  async function submit() {
    // Friendly pre-checks mirroring the server rules. `confirmPassword` keeps the
    // server's own field name so a server-side error for it lands on this input.
    const problems = {};
    if (!newPassword) problems.newPassword = 'New password is required';
    else if (newPassword.length < 8) problems.newPassword = 'Password must be at least 8 characters';
    if (confirmPassword !== newPassword) problems.confirmPassword = 'Passwords do not match';
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      return;
    }

    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await resetPassword({ token, newPassword, confirmPassword });
      setDone(true);
      // The reset revoked every session this user held, so the client's copy is
      // already dead. Clearing it is also what stops the login screen's
      // `status === 'signedIn'` redirect from bouncing them into `(app)`.
      // clearSession rather than signOut: there is no live session left to
      // revoke, and signOut would fire a guaranteed-401 logout for nothing.
      await clearSession();
    } catch (err) {
      const fields = fieldMap(err);
      // The token has no input of its own, so a field error naming it would be
      // invisible; promote it to the form level instead of dropping it.
      const tokenProblem = fields.token;
      delete fields.token;
      if (Object.keys(fields).length) setFieldErrors(fields);
      const fallback = Object.keys(fields).length
        ? null
        : err?.message || 'Unable to reset the password.';
      setFormError(tokenProblem || fallback);
    } finally {
      setBusy(false);
    }
  }

  // No token in the link: there is nothing to submit, and no request is made.
  if (!token) {
    return (
      <AuthLayout title="Link incomplete" subtitle="This reset link is missing its token.">
        <Banner
          type="error"
          text="The link you followed is incomplete. Request a new one to continue."
        />
        <Button title="Request a new link" onPress={() => router.replace('/forgot-password')} full />
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

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a password for your account."
      footer={
        <Text style={styles.footerText}>
          <Link href="/forgot-password" style={styles.link}>
            Request a new link
          </Link>
        </Text>
      }
    >
      <Banner type="error" text={formError} />
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
      <Button title="Set new password" onPress={submit} loading={busy} full />
    </AuthLayout>
  );
}
