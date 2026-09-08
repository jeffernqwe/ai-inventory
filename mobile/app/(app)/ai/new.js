import AiChat from '../../../components/AiChat';
import Screen from '../../../components/Screen';

/**
 * Start a brand-new AI conversation. The first message creates the
 * conversation server-side; AiChat keeps the returned id internally so every
 * follow-up in this screen continues the same thread.
 */
export default function NewAiChatScreen() {
  return (
    <Screen padded={false}>
      <AiChat conversationId={null} />
    </Screen>
  );
}
