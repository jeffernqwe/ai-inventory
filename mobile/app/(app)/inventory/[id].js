import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import Badge, { StatusBadge } from '../../../components/Badge';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import { CenterLoader, ErrorState, errorText } from '../../../components/ListState';
import Screen from '../../../components/Screen';
import { inventoryApi } from '../../../lib/api';
import { isSessionError, useSession } from '../../../lib/auth';
import { formatDateTime, formatNumber } from '../../../lib/format';
import { canAdjustStock } from '../../../lib/permissions';
import { radius, spacing, type } from '../../../lib/theme';
import { useTheme } from '../../../lib/theme-context';

function Row({ label, value, mono, danger }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (value == null || value === '') return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, mono && styles.fieldMono, danger && styles.fieldDanger]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function InventoryRowScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const { user, token, signOut } = useSession();
  const navigation = useNavigation();
  const canAdjust = canAdjustStock(user);

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryApi.get(token, id);
      setRow(data);
    } catch (err) {
      setError(err);
      if (isSessionError(err)) await signOut();
    } finally {
      setLoading(false);
    }
  }, [token, id, signOut]);

  // Reload when the screen regains focus so stock moved from here is reflected.
  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return () => unsub?.();
  }, [load, navigation]);

  if (loading && !row) return <CenterLoader label="Loading stock record…" />;
  if (error && !row) return <ErrorState title="Couldn't load the stock record" message={errorText(error)} onRetry={load} />;
  if (!row) return null;

  const productActive = row.product?.status === 'ACTIVE';
  const moveParams = {
    productId: row.product?.id,
    productName: row.product?.name,
    locationId: row.location?.id,
    locationName: row.location?.name,
  };

  return (
    <Screen scroll>
      <Card>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={2}>
            {row.product?.name ?? 'Unknown product'}
          </Text>
          <StatusBadge status={row.product?.status} />
        </View>
        <View style={styles.badgeRow}>
          {row.isLowStock ? <Badge text="Low stock" tone="low" /> : null}
          {row.isOutOfStock ? <Badge text="Out of stock" tone="danger" /> : null}
        </View>

        <View style={styles.divider} />
        <Row label="Location" value={row.location?.name} />
        <Row label="Product SKU" value={row.product?.sku} mono />
        <Row label="Unit" value={row.product?.unit} />
        <Row label="Minimum stock" value={row.product?.minimumStock != null ? formatNumber(row.product.minimumStock) : null} mono />
        <Row label="On hand" value={formatNumber(row.quantity)} mono />
        <Row label="Reserved" value={formatNumber(row.reservedQuantity)} mono />
        <Row label="Available" value={formatNumber(row.availableQuantity)} mono danger={row.isOutOfStock} />
        <Row label="Updated" value={formatDateTime(row.updatedAt)} />
      </Card>

      {productActive ? (
        <>
          <Text style={styles.sectionTitle}>Move stock</Text>
          <View style={styles.actions}>
            <Button title="Stock In" style={styles.flexBtn} onPress={() => router.push({ pathname: '/stock-in', params: moveParams })} />
            <Button title="Stock Out" variant="secondary" style={styles.flexBtn} onPress={() => router.push({ pathname: '/stock-out', params: moveParams })} />
            {canAdjust ? (
              <Button title="Adjust" variant="secondary" style={styles.flexBtn} onPress={() => router.push({ pathname: '/adjust', params: moveParams })} />
            ) : null}
          </View>
        </>
      ) : (
        <View style={styles.archivedNote}>
          <Text style={styles.archivedText}>This product is archived and cannot be used in new stock movements.</Text>
        </View>
      )}
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  name: { ...type.h2, color: colors.text, flex: 1 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: spacing.lg },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  fieldLabel: { ...type.body, color: colors.textMuted },
  fieldValue: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1, marginLeft: spacing.lg },
  fieldMono: { fontVariant: ['tabular-nums'] },
  fieldDanger: { color: colors.danger },
  sectionTitle: { ...type.h3, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  archivedNote: {
    marginTop: spacing.xxl,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  archivedText: { ...type.bodySmall, color: colors.warning, textAlign: 'center', fontWeight: '600' },
});
