import { useCallback, useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import AccessDenied from '../../../components/AccessDenied';
import { CenterLoader, ErrorState, errorText } from '../../../components/ListState';
import Screen from '../../../components/Screen';
import UserForm from '../../../components/UserForm';
import { usersApi } from '../../../lib/api';
import { isSessionError, useSession } from '../../../lib/auth';
import { canManageUsers } from '../../../lib/permissions';

/**
 * Edit a business user's role/status. Fetches the target fresh (deep-link
 * safe), then hands the public user DTO to the shared UserForm in edit mode.
 */
export default function EditUserScreen() {
  const { user, token, signOut } = useSession();
  const { id } = useLocalSearchParams();
  const [target, setTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setError(null);
    setLoading(true);
    try {
      const u = await usersApi.get(token, id);
      setTarget(u);
    } catch (err) {
      setError(err);
      setTarget(null);
      if (isSessionError(err)) await signOut();
    } finally {
      setLoading(false);
    }
  }, [token, id, signOut]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ title: 'Edit User' }} />
      {!canManageUsers(user) ? (
        <AccessDenied message="Only the business owner and admins can manage users." />
      ) : loading && !target ? (
        <Screen>
          <CenterLoader label="Loading user…" />
        </Screen>
      ) : error && !target ? (
        <Screen>
          <ErrorState title="Couldn't load this user" message={errorText(error)} onRetry={load} />
        </Screen>
      ) : target ? (
        <UserForm initial={target} key={target.id} />
      ) : null}
    </>
  );
}
