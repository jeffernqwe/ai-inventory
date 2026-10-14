import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import AssistantMarkdown from './AssistantMarkdown';
import Button from './Button';
import { Icon } from './icons';
import { CenterLoader, ErrorState, errorText } from './ListState';
import { aiApi } from '../lib/api';
import type { ApiResponse } from '../lib/api';
import { isSessionError, useSession } from '../lib/auth';
import { formatTime } from '../lib/format';
import { radius, spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/** Server default for AI_MAX_MESSAGE_CHARS — keep the composer bounded to match. */
const MAX_MESSAGE_CHARS = 4000;

const SUGGESTIONS = [
  'Which products are low on stock?',
  'Is anything out of stock?',
  'How much stock do we hold?',
  'What has moved recently?',
];

/** The error fields this module reads. Narrowed at the untrusted boundary. */
interface SendErrorLike {
  code?: string;
  isNetwork?: boolean;
  message?: string;
  fields?: { field?: string; message?: string }[] | null;
}

/**
 * The two codes that mean "we waited as long as we agreed to, then stopped".
 *
 * `NETWORK_TIMEOUT` is this client giving up on its own budget;
 * `AI_TIMEOUT` is the server reporting that a whole turn outlasted
 * `AI_TURN_DEADLINE_MS` (AI-1's 504). From the user's side these are the same
 * fact — the assistant was slow — and neither is a connectivity problem.
 */
const TIMEOUT_CODES = ['NETWORK_TIMEOUT', 'AI_TIMEOUT'];

/**
 * Maps a failed send onto a friendly, secret-free client message. The server
 * may answer 503 (AI not configured), 504 (turn deadline), 502 (provider down),
 * 429 `AI_RATE_LIMITED` (this member is sending too fast) or 429
 * `AI_QUOTA_EXCEEDED` (the assistant's allowance is spent) — all normal for an
 * assistant that reads data through the backend.
 *
 * Exported because the ordering below is the fix, not an implementation detail:
 * a timeout is ALSO a `status === 0` error, so the previous code — which tested
 * `e.isNetwork` before it looked at `e.code` — reported every slow answer as
 * "Cannot reach the server" and sent the user to check a connection that was
 * working (ISS-21 / RC-3). `__tests__/ai1-timeout-copy.test.ts` pins both
 * directions of that distinction.
 *
 * AI-6 adds the other half of the same rule, one layer up: the two 429s must
 * read differently, because their remedies are opposites. `AI_RATE_LIMITED`
 * clears in seconds and says so; `AI_QUOTA_EXCEEDED` is a spent allowance that
 * waiting a moment cannot refill, so it must NOT borrow the "temporarily
 * unavailable / try again in a moment" sentence it used to arrive as.
 */
export function sendErrorMessage(err: unknown): string {
  const e = (err ?? {}) as SendErrorLike;
  if (e.code === 'AI_NOT_CONFIGURED') {
    return 'The AI assistant is not enabled on this server yet. Ask an administrator to turn it on.';
  }
  if (e.code === 'AI_UNAVAILABLE') {
    return 'The AI service is temporarily unavailable. Please try again in a moment.';
  }
  if (e.code === 'AI_RATE_LIMITED') {
    return "You're sending messages too quickly — wait a moment and try again.";
  }
  // AI-6 — a spent allowance, not a fault and not something a moment's wait
  // fixes. Reported before the network check like every other code.
  if (e.code === 'AI_QUOTA_EXCEEDED') {
    return 'The assistant has reached its usage limit for now. Please try again later.';
  }
  // Checked BEFORE `isNetwork` on purpose — see this function's doc comment.
  if (e.code && TIMEOUT_CODES.includes(e.code)) {
    return 'The assistant took too long to answer. Please try again.';
  }
  if (e.isNetwork) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  const field = Array.isArray(e.fields) ? e.fields.find((f) => f?.field === 'message') : null;
  return field?.message || e.message || 'Your message could not be sent.';
}

/** One rendered bubble. */
interface ChatRow {
  key: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  toolsUsed?: string[];
}

function toRows(serverMessages: ApiResponse[]): ChatRow[] {
  return serverMessages.map((m) => ({
    key: m.id,
    role: m.role === 'USER' ? 'user' : 'assistant',
    content: m.content,
    createdAt: m.createdAt,
    toolsUsed: m.toolsUsed,
  }));
}

function MessageBubble({ item }: { item: ChatRow }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = item.role === 'user';
  return (
    <View style={[styles.bubbleRow, user ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, user ? styles.bubbleUser : styles.bubbleAssistant]}>
        {/* The member's own words are shown exactly as typed. The model's answer
            is RENDERED (AI-4): headings, lists and tables become real layout
            instead of a wall of markers — see components/AssistantMarkdown. One
            path for both loaded history and the live reply. */}
        {user ? (
          <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{item.content}</Text>
        ) : (
          <AssistantMarkdown content={item.content} />
        )}
        {!user && item.toolsUsed?.length ? (
          <Text style={styles.tools} numberOfLines={2}>
            Read: {item.toolsUsed.join(' · ')}
          </Text>
        ) : null}
        {item.createdAt ? <Text style={[styles.time, user && styles.timeUser]}>{formatTime(item.createdAt)}</Text> : null}
      </View>
    </View>
  );
}

function ThinkingRow() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.bubbleRow, styles.rowAssistant]}>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.thinking]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.thinkingText}>Analyzing your inventory…</Text>
      </View>
    </View>
  );
}

function Welcome({ onAsk }: { onAsk: (text: string) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.welcome}>
      <View style={styles.welcomeIcon}>
        <Icon name="sparkles" color={colors.primary} size={34} />
      </View>
      <Text style={styles.welcomeTitle}>Ask about your inventory</Text>
      <Text style={styles.welcomeBody}>
        I can read your catalog and stock to answer questions about low stock, out-of-stock items and recent
        movements. I&apos;m read-only — I can&apos;t change products or stock.
      </Text>
      <View style={styles.suggestions}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} style={styles.suggestion} onPress={() => onAsk(s)} accessibilityRole="button">
            <Text style={styles.suggestionText}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export interface AiChatProps {
  /** Set for an existing thread; null starts a new one on the first message. */
  conversationId?: string | null;
}

/**
 * Chat thread for the AI assistant. Two entry modes:
 *  - `conversationId` set  -> the existing thread is loaded from the server.
 *  - `conversationId` null -> a brand-new chat; the conversation is created by
 *    the backend on the first message and remembered locally from then on.
 *
 * Messages come back as DB rows, so bubbles always reflect what the server
 * stored. Sends surface 503/502/429 through a banner above the composer rather
 * than pretending a reply exists.
 */
export default function AiChat({ conversationId = null }: AiChatProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token, signOut } = useSession();
  const [convId, setConvId] = useState<string | null>(conversationId);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [loadError, setLoadError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatRow>>(null);

  const loadThread = useCallback(async (): Promise<void> => {
    if (!conversationId || !token) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Fetch the whole transcript page by page (messages are stored oldest
      // first). Chats are short in practice, so this stays a plain loop.
      const all: ApiResponse[] = [];
      let page = 1;
      for (;;) {
        const res = await aiApi.messages(token, conversationId, { page, limit: 100 });
        all.push(...(res?.items ?? []));
        if (!res || all.length >= (res.total ?? 0)) break;
        page += 1;
      }
      setRows(toRows(all));
    } catch (err) {
      if (isSessionError(err)) {
        await signOut();
        return;
      }
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, token, signOut]);

  // Loads an existing thread when its screen opens. `conversationId` is a route
  // param and the current app navigation mounts a fresh AiChat for each thread,
  // so this Effect runs once for the mounted thread. `loading` starts as
  // `Boolean(conversationId)` and `loadError` starts as null, so the synchronous
  // writes are no-ops on the initial Effect path; they exist for the imperative
  // retry handler, where re-entering the loading state is intentional.
  //
  // `loading` is a lifecycle signal, not derived data: an empty conversation and
  // a conversation that has not loaded yet are indistinguishable from `rows`.
  // The UI depends on `loading && rows.length === 0` to show the initial loader,
  // while `loadError && rows.length === 0` controls the retry error state.
  //
  // This is a narrow lint-only exception, not a correctness fix. The current
  // component has no reachable overlapping thread-load flow, so request identity
  // or cancellation is intentionally outside this lint phase.
  useEffect(() => {
    // Deliberate, narrow exception at this one call site — not a suppression of
    // any dependency rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (conversationId) loadThread();
  }, [conversationId, loadThread]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    if (rows.length) scrollToEnd();
  }, [rows.length, sending, scrollToEnd]);

  async function send(text?: string): Promise<void> {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput('');
    setSendError(null);
    setRows((prev) => [...prev, { key: `pending-${Date.now()}`, role: 'user', content: message }]);
    setSending(true);
    try {
      const res = await aiApi.chat(token as string, { conversationId: convId, message });
      if (!convId) setConvId(res?.conversation?.id ?? null);
      const reply = res?.assistantMessage;
      if (!reply?.content) throw new Error('The assistant returned no answer.');
      setRows((prev) => [
        ...prev,
        { key: reply.id, role: 'assistant', content: reply.content, createdAt: reply.createdAt, toolsUsed: reply.toolsUsed },
      ]);
    } catch (err) {
      if (isSessionError(err)) {
        await signOut();
        return;
      }
      setSendError(sendErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (loading && rows.length === 0) {
    return <CenterLoader label="Loading conversation…" />;
  }
  if (loadError && rows.length === 0) {
    return <ErrorState title="Couldn't load this chat" message={errorText(loadError)} onRetry={loadThread} />;
  }

  return (
    <View style={styles.flex}>
      <FlatList
        ref={listRef}
        style={styles.flex}
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => <MessageBubble item={item} />}
        ListEmptyComponent={<Welcome onAsk={send} />}
        ListFooterComponent={sending ? <ThinkingRow /> : null}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToEnd}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.composerArea}>
        {sendError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{sendError}</Text>
          </View>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            style={[styles.composerInput, sending && styles.composerDisabled]}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your stock…"
            placeholderTextColor={colors.placeholder}
            editable={!sending}
            multiline
            maxLength={MAX_MESSAGE_CHARS}
            autoCorrect
          />
          <Button title="Send" onPress={() => send()} loading={sending} disabled={!input.trim()} style={styles.sendButton} />
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    listContent: { flexGrow: 1, justifyContent: 'flex-end', padding: spacing.lg },
    bubbleRow: { marginBottom: spacing.md, flexDirection: 'row' },
    rowUser: { justifyContent: 'flex-end' },
    rowAssistant: { justifyContent: 'flex-start' },
    bubble: {
      maxWidth: '84%',
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    bubbleUser: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: radius.sm,
    },
    bubbleAssistant: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: radius.sm,
    },
    bubbleText: { ...type.body, color: colors.text },
    bubbleTextUser: { color: colors.textOnPrimary },
    tools: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
    time: { ...type.caption, color: colors.textMuted, marginTop: 4, textAlign: 'right' },
    // On the primary-filled user bubble: readable in both themes without a
    // hardcoded white, which would vanish against the dark theme's light blue.
    timeUser: { color: colors.textOnPrimary, opacity: 0.75 },
    thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    thinkingText: { ...type.caption, color: colors.textMuted },

    welcome: { paddingVertical: spacing.xxl, alignItems: 'center' },
    welcomeIcon: { marginBottom: spacing.sm },
    // alignSelf:'stretch' keeps the title's layout box full-width: with only
    // textAlign:'center' the parent's alignItems:'center' shrink-wraps the box
    // to the *unwrapped* text width, which clips the title to one short line.
    welcomeTitle: { ...type.h3, color: colors.text, textAlign: 'center', alignSelf: 'stretch' },
    welcomeBody: { ...type.bodySmall, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, maxWidth: 320 },
    suggestions: { marginTop: spacing.lg, alignSelf: 'stretch', gap: spacing.sm },
    suggestion: {
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    suggestionText: { ...type.bodySmall, color: colors.primary, fontWeight: '600', textAlign: 'center' },

    composerArea: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.surface },
    errorBanner: {
      backgroundColor: colors.dangerSoft,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    errorText: { ...type.caption, color: colors.danger, fontWeight: '600' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    composerInput: {
      flex: 1,
      ...type.body,
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      minHeight: 44,
      maxHeight: 120,
    },
    composerDisabled: { opacity: 0.6 },
    sendButton: { minWidth: 84 },
  });
