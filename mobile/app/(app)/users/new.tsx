import { Stack } from 'expo-router';

import AccessDenied from '../../../components/AccessDenied';
import UserForm from '../../../components/UserForm';
import { useSession } from '../../../lib/auth';
import { canManageUsers } from '../../../lib/permissions';

export default function NewUserScreen() {
  const { user } = useSession();
  return (
    <>
      <Stack.Screen options={{ title: 'New User' }} />
      {canManageUsers(user) ? (
        <UserForm />
      ) : (
        <AccessDenied message="Only the business owner and admins can manage users." />
      )}
    </>
  );
}
