import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import Banner from '../../components/Banner';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Input from '../../components/Input';
import Screen from '../../components/Screen';
import { updateMe } from '../../lib/api';
import { ApiError } from '../../lib/client';
import { useSession } from '../../lib/auth';
import { spacing } from '../../lib/theme';

function fieldMap(err) {
  const out = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

/**
 * Edit the signed-in user's display name (Phase 15). PATCH /api/auth/me accepts
 * ONLY `name` — identity comes from the authenticated session, and the server
 * rejects every other field. After a successful save the session user is
 * refreshed from /api/auth/me.
 */
export default function EditNameScreen() {
  const { user, token, refresh } = useSession();

  const [name, setName] = useState(user?.name ?? '');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldErrors({ name: 'Name is required' });
      return;
    }

    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await updateMe(token, { name: trimmed });
      await refresh(); // re-fetch /api/auth/me so the session user reflects the new name
      router.back();
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError(err?.message || 'Unable to update your name.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Name' }} />
      <Screen scroll contentStyle={styles.content}>
        <Banner type="error" text={formError} />
        <Card>
          <Input
            name="name"
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your display name"
            error={fieldErrors.name}
            required
            autoCapitalize="words"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </Card>
        <Button title="Save changes" onPress={submit} loading={busy} full />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.huge },
});
