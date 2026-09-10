import { useCallback, useMemo } from 'react';
import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import AccessDenied from '../../../components/AccessDenied';
import Button from '../../../components/Button';
import { PressableCard } from '../../../components/Card';
import { EmptyState, ErrorState, LoadingBlock, errorText } from '../../../components/ListState';
import Screen from '../../../components/Screen';
import { aiApi } from '../../../lib/api';
import { useSession } from '../../../lib/auth';
import { formatDateTime } from '../../../lib/format';
import { canUseAi } from '../../../lib/permissions';
import usePagedList from '../../../hooks/usePagedList';
import useRefetchOnFocus from '../../../hooks/useRefetchOnFocus';
import { radius, spacing, type } from '../../../lib/theme';
import { useTheme } from '../../../lib/theme-context';

function ConversationRow({ item }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <PressableCard style={styles.row} onPress={() => router.push(`/ai/${item.id}`)}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {item.title || 'New chat'}
      </Text>
      <Text style={styles.rowMeta}>{formatDateTime(item.updatedAt)}</Text>
    </PressableCard>
  );
}

export default function AiHubScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, token, signOut } = useSession();

  if (!canUseAi(user)) {
    return <AccessDenied message="Your role does not include access to the AI assistant." />;
  }

  const fetcher = useCallback((page, limit) => aiApi.conversations(token, { page, limit }), [token]);
  const list = usePagedList(fetcher, { onSessionError: signOut });
  // Refresh ordering/timestamps after a chat screen pushes and pops.
  useRefetchOnFocus(list.reload);

  const header = (
    <View>
      <Button title="＋  New chat" onPress={() => router.push('/ai/new')} full style={styles.newBtn} />
      <View style={styles.noteCard}>
        <Text style={styles.noteText}>
          The assistant reads your catalog and stock to answer questions. It is read-only and never changes data.
        </Text>
      </View>
      {list.total > 0 ? (
        <Text style={styles.count}>
          {list.total} conversation{list.total === 1 ? '' : 's'} · newest first
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen>
      {list.loading && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<LoadingBlock label="Loading chats…" />} contentContainerStyle={styles.content} />
      ) : list.error && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<ErrorState title="Couldn't load your chats" message={errorText(list.error)} onRetry={list.reload} />} contentContainerStyle={styles.content} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ConversationRow item={item} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              title="No conversations yet"
              message="Start a chat and ask your assistant anything about your stock."
              action={<Button title="Start a chat" onPress={() => router.push('/ai/new')} />}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={list.loadingMore ? <LoadingBlock label="Loading more…" /> : null}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.huge, flexGrow: 1 },
  newBtn: { marginBottom: spacing.md },
  noteCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noteText: { ...type.caption, color: colors.primaryDark, lineHeight: 17 },
  count: { ...type.caption, color: colors.textMuted, marginBottom: spacing.md },
  row: {},
  rowTitle: { ...type.body, color: colors.text, fontWeight: '700' },
  rowMeta: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs + 2 },
  separator: { height: spacing.md },
});
