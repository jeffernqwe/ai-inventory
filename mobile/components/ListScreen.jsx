import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { spacing } from '../lib/theme';
import { useTheme } from '../lib/theme-context';
import { EmptyState, ErrorState, LoadingBlock, errorText } from './ListState';
import Screen from './Screen';

const createStyles = (colors) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingBottom: spacing.huge, flexGrow: 1 },
    separator: { height: spacing.md },
  });

/**
 * Standard paged-list screen shell: safe-area background, pull-to-refresh,
 * loading / error / empty states, and infinite scroll. Encapsulates the list
 * plumbing every list screen repeats so a screen only supplies data + rows.
 *
 * Not yet adopted by existing screens (Phase 18B does that); it is the
 * primitive the redesigned list screens are built on.
 */
export function ListScreen({
  items,
  renderItem,
  keyExtractor,
  header,
  refreshing,
  onRefresh,
  onEndReached,
  loading,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  loadingMore,
  separator = true,
  contentStyle,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const listProps = {
    data: items,
    renderItem,
    keyExtractor,
    ListHeaderComponent: header,
    ItemSeparatorComponent: separator ? () => <View style={styles.separator} /> : undefined,
    contentContainerStyle: [styles.content, contentStyle],
    refreshControl: onRefresh ? (
      <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
    ) : undefined,
    onEndReached,
    onEndReachedThreshold: 0.4,
    ListFooterComponent: loadingMore ? <LoadingBlock label="Loading more…" /> : null,
    keyboardShouldPersistTaps: 'handled',
    showsVerticalScrollIndicator: false,
  };

  if (loading && items.length === 0) {
    return (
      <Screen>
        <FlatList {...listProps} ListEmptyComponent={<LoadingBlock label="Loading…" />} />
      </Screen>
    );
  }

  if (error && items.length === 0) {
    return (
      <Screen>
        <FlatList {...listProps} ListEmptyComponent={<ErrorState message={errorText(error)} onRetry={onRetry} />} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList {...listProps} ListEmptyComponent={<EmptyState title={emptyTitle} message={emptyMessage} />} />
    </Screen>
  );
}

export default ListScreen;
