import { useCallback, useEffect, useState } from 'react';
import { router, useNavigation } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Badge, { TypeBadge } from '../../components/Badge';
import AccessDenied from '../../components/AccessDenied';
import Button from '../../components/Button';
import Card, { PressableCard } from '../../components/Card';
import { CenterLoader, EmptyState, ErrorState, errorText } from '../../components/ListState';
import Screen from '../../components/Screen';
import { dashboardApi, productsApi } from '../../lib/api';
import { isSessionError, useSession } from '../../lib/auth';
import { confirm } from '../../lib/confirm';
import { formatDateTime, formatNumber } from '../../lib/format';
import { canAdjustStock, canUseAi, canViewDashboard, roleLabel } from '../../lib/permissions';
import { colors, radius, spacing, type } from '../../lib/theme';

function deltaText(t) {
  if (t.type === 'STOCK_IN') return `+${t.quantity}`;
  if (t.type === 'STOCK_OUT') return `−${t.quantity}`;
  const d = t.newQuantity - t.previousQuantity;
  return d >= 0 ? `+${d}` : `−${Math.abs(d)}`;
}
function deltaTone(t) {
  if (t.type === 'STOCK_IN') return colors.success;
  if (t.type === 'STOCK_OUT') return colors.danger;
  return colors.textSecondary;
}

function ActivityRow({ item }) {
  return (
    <PressableCard style={styles.activityRow} onPress={() => router.push('/history')}>
      <TypeBadge type={item.type} />
      <View style={styles.activityBody}>
        <Text style={styles.activityName} numberOfLines={1}>
          {item.product?.name ?? 'Unknown product'}
        </Text>
        <Text style={styles.activityMeta} numberOfLines={1}>
          {item.location?.name ?? 'No location'} · {formatDateTime(item.createdAt)}
        </Text>
      </View>
      <Text style={[styles.delta, { color: deltaTone(item) }]}>{deltaText(item)}</Text>
    </PressableCard>
  );
}

/** One "needs restock" preview row — taps into the product detail for stock-in. */
function ReorderRow({ item }) {
  const isOut = item.stockStatus === 'OUT_OF_STOCK';
  return (
    <PressableCard style={styles.activityRow} onPress={() => router.push(`/products/${item.id}`)}>
      <Badge text={isOut ? 'Out' : 'Low'} tone={isOut ? 'danger' : 'low'} />
      <View style={styles.activityBody}>
        <Text style={styles.activityName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.activityMeta} numberOfLines={1}>
          {formatNumber(item.availableQuantity)} available · min {formatNumber(item.minimumStock)}
        </Text>
      </View>
    </PressableCard>
  );
}

function StatCard({ label, value, tone, onPress, style }) {
  return (
    <Pressable style={[styles.stat, style]} onPress={onPress} disabled={!onPress}>
      <View style={[styles.statDot, { backgroundColor: tone }]} />
      <Text style={styles.statValue}>{formatNumber(value)}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { user, token, signOut } = useSession();
  const navigation = useNavigation();
  const [summary, setSummary] = useState(null);
  const [restock, setRestock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  if (!canViewDashboard(user)) {
    return <AccessDenied message="Only managers and above can view the dashboard." />;
  }

  const canAdjust = canAdjustStock(user);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const data = await dashboardApi.summary(token);
      setSummary(data);
      // "Needs restock" preview is secondary and never blocks the summary — if
      // it fails the health tiles still tell the story. Only fetched when the
      // dashboard itself reports something at or below minimum.
      if ((data.lowStockProducts ?? 0) + (data.outOfStockProducts ?? 0) > 0) {
        try {
          const list = await productsApi.reorder(token, { limit: 5 });
          setRestock(list.items ?? []);
        } catch {
          setRestock(null);
        }
      } else {
        setRestock([]);
      }
    } catch (err) {
      setError(err);
      setRestock(null);
      if (isSessionError(err)) await signOut();
    } finally {
      setLoading(false);
    }
  }, [token, signOut]);

  // Load on first mount and whenever the screen regains focus (stock actions on
  // other screens should be reflected here).
  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return () => {
      unsub?.();
    };
  }, [load, navigation]);

  async function onSignOut() {
    const ok = await confirm('Sign out', 'You will need to sign in again to manage inventory.', {
      confirmText: 'Sign Out',
      destructive: true,
    });
    if (ok) await signOut();
  }

  const tiles = [
    { label: 'Stock In', sub: 'Add quantity', route: '/stock-in' },
    { label: 'Stock Out', sub: 'Remove quantity', route: '/stock-out' },
    ...(canAdjust ? [{ label: 'Adjust', sub: 'Set exact stock', route: '/adjust' }] : []),
    { label: 'History', sub: 'All movements', route: '/history' },
    ...(canUseAi(user) ? [{ label: 'AI Assistant', sub: 'Ask about stock', route: '/ai' }] : []),
    { label: 'Inventory', sub: 'Rows & status', route: '/inventory' },
    { label: 'Products', sub: 'Catalog', route: '/products' },
    { label: 'Categories', sub: 'Group products', route: '/categories' },
    { label: 'Locations', sub: 'Where stock lives', route: '/locations' },
    { label: 'Profile', sub: 'Account', route: '/profile' },
  ];

  return (
    <Screen scroll refreshing={loading} onRefresh={load}>
      <TopBar name={user?.name} role={user?.role} onSignOut={onSignOut} />

      {!summary && loading ? (
        <CenterLoader label="Loading dashboard…" />
      ) : !summary && error ? (
        <ErrorState title="Couldn't load the dashboard" message={errorText(error)} onRetry={load} />
      ) : summary ? (
        <>
          <Text style={styles.greeting}>Good day, {firstName} 👋</Text>
          <Text style={styles.greetingSub}>Here's how your stock is doing.</Text>
          {error ? (
            <Pressable style={styles.stale} onPress={load}>
              <Text style={styles.staleText}>Showing earlier data — pull to retry.</Text>
            </Pressable>
          ) : null}

          <Text style={styles.sectionTitle}>Inventory health</Text>
          <View style={styles.statGrid}>
            <StatCard style={styles.statThird} label="In stock" value={summary.inStockProducts} tone={colors.success} onPress={() => router.push('/products')} />
            <StatCard style={styles.statThird} label="Low stock" value={summary.lowStockProducts} tone={colors.warning} onPress={() => router.push('/inventory?status=low')} />
            <StatCard style={styles.statThird} label="Out of stock" value={summary.outOfStockProducts} tone={colors.danger} onPress={() => router.push('/inventory?status=out')} />
            <StatCard label="Active products" value={summary.totalProducts} tone={colors.primary} onPress={() => router.push('/products')} />
            <StatCard label="Total on-hand qty" value={summary.totalInventoryQuantity} tone={colors.textSecondary} onPress={() => router.push('/inventory')} />
          </View>

          {restock && restock.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Needs restock</Text>
              <View style={styles.activityList}>
                {restock.map((item) => (
                  <ReorderRow key={item.id} item={item} />
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.tileGrid}>
            {tiles.map((t) => (
              <PressableCard key={t.route} style={styles.tile} onPress={() => router.push(t.route)}>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={styles.tileSub} numberOfLines={1}>
                  {t.sub}
                </Text>
              </PressableCard>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Recent activity</Text>
          {summary.recentActivity?.length ? (
            <View style={styles.activityList}>
              {summary.recentActivity.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </View>
          ) : (
            <Card>
              <EmptyState title="No activity yet" message="Stock in/out and adjustments will appear here." />
            </Card>
          )}

          <Button title="Sign out" onPress={onSignOut} variant="secondary" style={styles.signOut} />
        </>
      ) : null}
    </Screen>
  );
}

function TopBar({ name, role, onSignOut }) {
  return (
    <View style={styles.topBar}>
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>Inventory AI</Text>
        <View style={styles.roleRow}>
          <Text style={styles.userName} numberOfLines={1}>
            {name}
          </Text>
          <Badge text={roleLabel(role)} tone="neutral" />
        </View>
      </View>
      <Pressable onPress={onSignOut} hitSlop={10} style={styles.signOutIcon} accessibilityRole="button">
        <Text style={styles.signOutIconText}>⎋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.xl },
  brandBlock: { flex: 1, marginRight: spacing.md },
  brand: { ...type.caption, color: colors.primary, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  userName: { ...type.h3, color: colors.text, flexShrink: 1 },
  signOutIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutIconText: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },
  greeting: { ...type.h1, color: colors.text },
  greetingSub: { ...type.body, color: colors.textSecondary, marginTop: 2 },
  stale: {
    marginTop: spacing.md,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  staleText: { ...type.caption, color: colors.warning, fontWeight: '600' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xl },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minWidth: '45%',
  },
  statThird: { flexBasis: '30%', minWidth: '30%' },
  statDot: { width: 10, height: 10, borderRadius: 5, marginBottom: spacing.sm },
  statValue: { ...type.h1, color: colors.text },
  statLabel: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { ...type.h3, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flexBasis: '30%', flexGrow: 1, minWidth: '30%', minHeight: 92, padding: spacing.md },
  tileLabel: { ...type.label, color: colors.text },
  tileSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  activityList: { gap: spacing.sm },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  activityBody: { flex: 1 },
  activityName: { ...type.body, color: colors.text, fontWeight: '600' },
  activityMeta: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  delta: { ...type.button, fontSize: 16 },
  signOut: { marginTop: spacing.xxl },
});
