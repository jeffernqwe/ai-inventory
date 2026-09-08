import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { CenterLoader } from '../components/ListState';
import { useSession } from '../lib/auth';
import { defaultHomePath } from '../lib/permissions';
import { colors } from '../lib/theme';

/**
 * '/' entry — resolves once, then redirects to the right first screen:
 *   loading  -> spinner while the stored session is restored on boot
 *   signedIn -> dashboard (MANAGER+) or inventory (STAFF fallback)
 *   signedOut-> login
 */
export default function IndexRoute() {
  const { status, user } = useSession();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <CenterLoader label="Loading your workspace…" />
      </View>
    );
  }

  if (status === 'signedIn') {
    return <Redirect href={defaultHomePath(user)} />;
  }
  return <Redirect href="/login" />;
}
