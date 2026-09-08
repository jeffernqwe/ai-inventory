import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import Badge, { StatusBadge } from '../../../../components/Badge';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import { CenterLoader, EmptyState, ErrorState, errorText } from '../../../../components/ListState';
import Screen from '../../../../components/Screen';
import { inventoryApi, productsApi } from '../../../../lib/api';
import { useSession } from '../../../../lib/auth';
import { confirm } from '../../../../lib/confirm';
import { formatDateTime, formatMoney, formatNumber } from '../../../../lib/format';
import { canAdjustStock, canManageProducts } from '../../../../lib/permissions';
import { useProductDetail } from '../../../../hooks/useProductDetail';
import useRefetchOnFocus from '../../../../hooks/useRefetchOnFocus';
import { colors, radius, spacing, type } from '../../../../lib/theme';

function Field({ label, value, mono }) {
  if (value == null || value === '' || value === false) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, mono && styles.fieldMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StockRow({ row }) {
  return (
    <View style={styles.stockRow}>
      <View style={styles.stockInfo}>
        <Text style={styles.stockLocation} numberOfLines={1}>
          {row.location?.name ?? 'Unknown location'}
        </Text>
        <Text style={styles.stockQty}>
          {formatNumber(row.availableQuantity)} available
        </Text>
      </View>
      <View style={styles.stockBadges}>
        {row.isLowStock ? <Badge text="Low" tone="low" /> : null}
        {row.isOutOfStock ? <Badge text="Out" tone="danger" /> : null}
      </View>
    </View>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user, token } = useSession();
  const manage = canManageProducts(user);
  const canAdjust = canAdjustStock(user);

  const { product, loading, error, reload } = useProductDetail(id);

  const [stock, setStock] = useState([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [busyArchive, setBusyArchive] = useState(false);

  const loadStock = useCallback(async () => {
    if (!token || !id) return;
    setStockLoading(true);
    try {
      const res = await inventoryApi.list(token, { productId: id, page: 1, limit: 100 });
      setStock(res?.items ?? []);
    } catch (err) {
      if (err?.message) {
        // Stock list is secondary; keep silent failures non-blocking.
        if (err?.status === 403) Alert.alert('Inventory', 'You do not have permission to view stock.');
      }
    } finally {
      setStockLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  // Reload when returning from edit or a stock movement screen pushed from here.
  useRefetchOnFocus(() => {
    reload();
    loadStock();
  });

  async function onToggleArchive() {
    if (!product || busyArchive) return;
    const restoring = product.status === 'ARCHIVED';
    if (!restoring) {
      const ok = await confirm(
        'Archive product?',
        `"${product.name}" is kept for history but hidden from new stock movements.`,
        { confirmText: 'Archive', destructive: true }
      );
      if (!ok) return;
    }
    setBusyArchive(true);
    try {
      if (restoring) await productsApi.restore(token, product.id);
      else await productsApi.archive(token, product.id);
      await reload();
      await loadStock();
    } catch (err) {
      Alert.alert('Could not update the product', errorText(err));
    } finally {
      setBusyArchive(false);
    }
  }

  if (loading && !product) return <CenterLoader label="Loading product…" />;
  if (error && !product) return <ErrorState title="Couldn't load the product" message={errorText(error)} onRetry={reload} />;
  if (!product) return null;

  const moveParams = { productId: product.id, productName: product.name };
  const canMove = product.status === 'ACTIVE';

  return (
    <Screen scroll contentStyle={{}}>
      <Card>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <StatusBadge status={product.status} />
        </View>
        {product.description ? (
          <Text style={styles.description}>{product.description}</Text>
        ) : null}

        <View style={styles.divider} />
        <Field label="SKU" value={product.sku} mono />
        <Field label="Barcode" value={product.barcode} mono />
        <Field label="Category" value={product.category?.name} />
        <Field label="Unit" value={product.unit} />
        <Field label="Cost price" value={product.costPrice != null ? formatMoney(product.costPrice) : null} mono />
        <Field label="Selling price" value={product.sellingPrice != null ? formatMoney(product.sellingPrice) : null} mono />
        <Field label="Minimum stock" value={product.minimumStock != null ? formatNumber(product.minimumStock) : null} mono />
        <Field label="Updated" value={formatDateTime(product.updatedAt)} />
      </Card>

      {manage ? (
        <View style={styles.actions}>
          <Button title="Edit" variant="secondary" style={styles.flexBtn} onPress={() => router.push(`/products/${product.id}/edit`)} />
          <Button
            title={product.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
            variant={product.status === 'ARCHIVED' ? 'secondary' : 'danger'}
            style={styles.flexBtn}
            loading={busyArchive}
            onPress={onToggleArchive}
          />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Stock</Text>
      {stockLoading ? (
        <Card>
          <CenterLoader label="Loading stock…" />
        </Card>
      ) : stock.length === 0 ? (
        <Card>
          <EmptyState title="No stock yet" message="Stock in this product at a location to create a record." />
        </Card>
      ) : (
        <View style={styles.stockList}>
          {stock.map((row) => (
            <StockRow key={row.id} row={row} />
          ))}
        </View>
      )}

      {canMove ? (
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
      ) : null}

      {canMove ? null : (
        <Pressable style={styles.archivedNote} onPress={manage ? onToggleArchive : null}>
          <Text style={styles.archivedText}>
            {manage
              ? 'This product is archived. Restore it to use it in stock movements.'
              : 'This product is archived and cannot be used in stock movements.'}
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  name: { ...type.h2, color: colors.text, flex: 1 },
  description: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: spacing.lg },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  fieldLabel: { ...type.body, color: colors.textMuted },
  fieldValue: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1, marginLeft: spacing.lg },
  fieldMono: { fontVariant: ['tabular-nums'] },
  sectionTitle: { ...type.h3, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  flexBtn: { flex: 1 },
  stockList: { gap: spacing.sm },
  stockRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stockInfo: { flex: 1, marginRight: spacing.md },
  stockLocation: { ...type.body, color: colors.text, fontWeight: '600' },
  stockQty: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  stockBadges: { flexDirection: 'row', gap: 6 },
  archivedNote: {
    marginTop: spacing.xxl,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  archivedText: { ...type.bodySmall, color: colors.warning, textAlign: 'center', fontWeight: '600' },
});
