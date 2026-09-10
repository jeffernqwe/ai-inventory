import { Stack } from 'expo-router';
import { View } from 'react-native';

import AccessDenied from '../../../components/AccessDenied';
import UserForm from '../../../components/UserForm';
import { useSession } from '../../../lib/auth';
import { canManageUsers } from '../../../lib/permissions';
import { useTheme } from '../../../lib/theme-context';

export default function NewUserScreen() {
  const { colors } = useTheme();
  const { user } = useSession();
  return (
    <>
      <Stack.Screen options={{ title: 'New User' }} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {canManageUsers(user) ? (
          <UserForm />
        ) : (
          <AccessDenied message="Only the business owner and admins can manage users." />
        )}
      </View>
    </>
  );
}
