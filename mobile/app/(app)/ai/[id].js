import { useLocalSearchParams } from 'expo-router';

import AiChat from '../../../components/AiChat';
import Screen from '../../../components/Screen';

function str(v) {
  return Array.isArray(v) ? v[0] : v;
}

/** One existing AI conversation, loaded from the server and continued here. */
export default function AiChatScreen() {
  const { id } = useLocalSearchParams();
  const conversationId = str(id);

  return (
    <Screen padded={false}>
      <AiChat conversationId={conversationId} />
    </Screen>
  );
}
