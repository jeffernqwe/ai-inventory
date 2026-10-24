import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Card from '../components/Card';
import { previewInvitation } from '../lib/api';
import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { setPendingInvite, clearPendingInvite } from '../lib/pendingInvite';
import { defaultHomePath, roleLabel } from '../lib/permissions';
import { formatDate } from '../lib/format';
import { spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * The invitation a person was emailed (2026-10-25).
 *
 * REACHED TWO WAYS, ONE DESTINATION. The mail carries `inventoryai://invite?token=…` as
 * its app link and `https://<host>/invite?token=…` as its fallback for somebody reading
 * mail on a computer; the server's landing page forwards the token to the app's scheme.
 * Both arrive here as `?token=`, which is why this screen reads exactly one parameter.
 *
 * WHAT IT DOES WITH IT: one PUBLIC read (`GET /api/auth/invitation`) that says which
 * address was invited, which business and role it offers, and when it expires. It
 * redeems nothing, creates nothing, and issues no session. The token is then held in
 * MEMORY (`lib/pendingInvite`) for the length of the registration, never in a route
 * parameter and never persisted — a cold start forgets it, and the email is still there.
 *
 * WHY THERE IS NO "I already have an account" PATH. Invitation addresses are checked
 * against the globally unique `users.email`, so an address that already owns an account
 * is refused at invite time. Accepting therefore only ever CREATES a member; there is no
 * second account to sign into, and offering a sign-in link here would send people to a
 * refusal.
 *
 * A REFUSAL IS NOT AN ERROR PAGE. Unknown, expired, revoked and already-accepted all
 * answer the same 404 from the server, and this screen says the one useful thing: ask the
 * administrator for a new invitation. The pending invitation is cleared on that path so a
 * dead link cannot be retried by navigation.
 */

/** What the server knows about an invitation. Never the token itself. */
interface InvitationPreview {
  email: string;
  role: string;
  businessName: string | null;
  expiresAt: string;
}

/** The one server code every unusable token answers, whatever the reason. */
const INVITATION_INVALID = 'INVITATION_INVALID';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    label: { ...type.body, color: colors.textMuted },
    value: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
    note: { ...type.bodySmall, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.lg },
    footerText: { ...type.bodySmall, color: colors.textMuted, alignSelf: 'stretch', textAlign: 'center' },
    link: { color: colors.link, fontWeight: '700' },
  });

export default function InviteScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { status, user } = useSession();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = (rawToken ?? '').trim();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [unusable, setUnusable] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!token) {
      setUnusable(true);
      setProblem('This link is missing its invitation code. Open the link from your email again.');
      return;
    }
    setBusy(true);
    setProblem(null);
    setUnusable(false);
    try {
      const result = (await previewInvitation(token)) as unknown as InvitationPreview;
      setPreview(result);
    } catch (err) {
      // An unusable invitation and a failed request are different problems: the first
      // needs a new email, the second needs a retry. Telling them apart is the only way
      // either message can be actionable.
      const malformed = err instanceof ApiError && err.status === 400;
      const invalid = err instanceof ApiError && err.code === INVITATION_INVALID;
      setUnusable(invalid || malformed);
      setPreview(null);
      setProblem(
        invalid || malformed
          ? 'This invitation is no longer valid. Ask an administrator to send you a new one.'
          : (err as { message?: string } | null)?.message ||
              'We could not check this invitation. Please try again.'
      );
      if (invalid || malformed) clearPendingInvite();
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    // A signed-in device has no registration to offer, so the preview is not read at all:
    // one less public request, and the branch below has nothing to show anyway.
    if (status === 'signedIn') return;
    // `load` sets `busy` synchronously before its first await on purpose: the screen has
    // to say it is checking rather than render an empty card, and "no invitation yet" is
    // not the same state as "this invitation is unusable".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, status]);

  /**
   * An invitation creates an account, and this device already has one. Explaining that is
   * better than a form the server would refuse at the last step.
   */
  if (status === 'signedIn') {
    return (
      <AuthLayout
        title="Already signed in"
        subtitle="An invitation is for creating a new account."
        footer={
          <Text style={styles.footerText}>
            <Link href="/login" style={styles.link}>
              Back to sign in
            </Link>
          </Text>
        }
      >
        <Banner
          type="info"
          text={`You are signed in${user?.name ? ` as ${user.name}` : ''}. Sign out first if this invitation is for a different person.`}
        />
        <Button title="Go to the app" onPress={() => router.replace(defaultHomePath(user))} full />
      </AuthLayout>
    );
  }

  function accept(): void {
    if (!preview) return;
    setPendingInvite({
      token,
      email: preview.email,
      businessName: preview.businessName,
      role: preview.role,
    });
    router.replace('/register');
  }

  return (
    <AuthLayout
      title={preview ? `Join ${preview.businessName ?? 'the business'}` : "You're invited"}
      subtitle={
        preview
          ? `Create your account to join as ${roleLabel(preview.role).toLowerCase()}.`
          : 'Check your invitation, then create your account.'
      }
      footer={
        <Text style={styles.footerText}>
          Not expecting this?{' '}
          <Link href="/login" style={styles.link}>
            Go to sign in
          </Link>
        </Text>
      }
    >
      <Banner type={unusable ? 'warn' : 'error'} text={problem} />

      {preview ? (
        <>
          <Card>
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{preview.email}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Business</Text>
              <Text style={styles.value}>{preview.businessName ?? 'Not available'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Role</Text>
              <Text style={styles.value}>{roleLabel(preview.role)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Expires</Text>
              <Text style={styles.value}>{formatDate(preview.expiresAt)}</Text>
            </View>
          </Card>
          <Text style={styles.note}>
            You will sign up with this email address, verify it with a six-digit code, and choose
            your own password. No one else will know it.
          </Text>
          <Button title="Create your account" onPress={accept} full />
        </>
      ) : (
        <Button
          title={unusable ? 'Back to sign in' : 'Try again'}
          onPress={unusable ? () => router.replace('/login') : load}
          loading={busy}
          full
        />
      )}
    </AuthLayout>
  );
}
