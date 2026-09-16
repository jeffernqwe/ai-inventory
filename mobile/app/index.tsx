import { Redirect } from 'expo-router';

import { CenterLoader } from '../components/ListState';
import Screen from '../components/Screen';
import { useSession } from '../lib/auth';
import { defaultHomePath } from '../lib/permissions';

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
      <Screen padded={false}>
        <CenterLoader label="Loading your workspace…" />
      </Screen>
    );
  }

  if (status === 'signedIn') {
    return <Redirect href={defaultHomePath(user)} />;
  }
  return <Redirect href="/login" />;
}
