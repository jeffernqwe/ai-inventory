import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import Banner from '../../../../components/Banner';
import { PoStatusBadge } from '../../../../components/Badge';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import { CenterLoader, EmptyState, ErrorState, errorText } from '../../../../components/ListState';
import { poErrorMessage } from '../../../../components/PoForm';
import Screen from '../../../../components/Screen';
import AccessDenied from '../../../../components/AccessDenied';
import { purchaseOrdersApi } from '../../../../lib/api';
import { isSessionError, useSession } from '../../../../lib/auth';
import { alert, confirm } from '../../../../lib/confirm';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../../../../lib/format';
import {
  canManagePurchaseOrders,
  canReceivePurchaseOrders,
  canViewPurchaseOrders,
} from '../../../../lib/permissions';
import { radius, spacing, type } from '../../../../lib/theme';
import { useTheme } from '../../../../lib/theme-context';

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

function statusNote(status) {
  if (status === 'DRAFT') return 'This order has not been issued yet, so it cannot be received.';
  if (status === 'RECEIVED') return 'This order is fully received.';
  if (status === 'CANCELED') return 'This order was canceled and can no longer be received.';
  return null;
}

export default function PurchaseOrderDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const { user, token, signOut } = useSession();
  const navigation = useNavigation();
  const canReceive = canReceivePurchaseOrders(user);
  const canManage = canManagePurchaseOrders(user);

  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseOrdersApi.get(token, id);
      setPo(data);
    } catch (err) {
      setError(err);
      if (isSessionError(err)) await signOut();
    } finally {
      setLoading(false);
    }
  }, [token, id, signOut]);

  // Reload when the screen regains focus so a receive completed from here (or
  // from the receive form pushed on top) is reflected immediately.
  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return () => unsub?.();
  }, [load, navigation]);

  if (!canViewPurchaseOrders(user)) {
    return <AccessDenied message="Your role does not allow viewing purchase orders." />;
  }

  if (loading && !po) return <CenterLoader label="Loading purchase order…" />;
  if (error && !po) return <ErrorState title="Couldn't load the purchase order" message={errorText(error)} onRetry={load} />;
  if (!po) return null;

  const totals = po.totals ?? {};
  const nameById = new Map((po.items ?? []).map((i) => [i.productId, i.productName]));
  const pendingUnits = (po.pendingClaims ?? []).reduce((sum, c) => sum + (c.quantity || 0), 0);
  const note = statusNote(po.status);

  async function onIssue() {
    const ok = await confirm('Issue order', `${po.number} will be opened for receiving. This cannot be undone.`, {
      confirmText: 'Issue',
    });
    if (!ok) return;
    try {
      const updated = await purchaseOrdersApi.issue(token, po.id);
      await load();
      await alert('Order issued', `${updated?.number ?? po.number} is now open for receiving.`);
    } catch (err) {
      await alert('Could not issue', poErrorMessage(err));
      await load();
    }
  }

  async function onCancel() {
    const ok = await confirm('Cancel order', `${po.number} will be marked canceled and can no longer be received or changed.`, {
      confirmText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    try {
      const updated = await purchaseOrdersApi.cancel(token, po.id);
      await load();
      await alert('Order canceled', `${updated?.number ?? po.number} was canceled.`);
    } catch (err) {
      await alert('Could not cancel', poErrorMessage(err));
      await load();
    }
  }

  return (
    <Screen scroll>
      {pendingUnits > 0 ? (
        <Banner
          type="warn"
          text={`${formatNumber(pendingUnits)} unit(s) are reserved by an interrupted receive and cannot be received until this order is canceled and re-created.`}
        />
      ) : null}

      <Card>
        <View style={styles.titleRow}>
          <Text style={styles.number} numberOfLines={1}>
            {po.number}
          </Text>
          <PoStatusBadge status={po.status} />
        </View>
        {po.notes ? <Text style={styles.notes}>{po.notes}</Text> : null}

        <View style={styles.divider} />
        <Row label="Supplier" value={po.supplier?.name} />
        <Row label="Location" value={po.location?.name} />
        <Row label="Expected" value={po.expectedAt ? formatDate(po.expectedAt) : null} />
        <Row label="Created" value={formatDateTime(po.createdAt)} />
        {totals.estimatedCost ? <Row label="Est. cost" value={formatMoney(totals.estimatedCost)} mono /> : null}

        <View style={styles.divider} />
        <Row label="Ordered" value={formatNumber(totals.quantityOrdered)} mono />
        <Row label="Received" value={formatNumber(totals.quantityReceived)} mono />
        <Row label="Remaining" value={formatNumber(totals.remainingQuantity)} mono />
      </Card>

      {canManage && (po.status === 'DRAFT' || po.status === 'OPEN') ? (
        <>
          <Text style={styles.sectionTitle}>Manage</Text>
          <View style={styles.manageRow}>
            {po.status === 'DRAFT' ? (
              <Button title="Edit" variant="secondary" onPress={() => router.push(`/purchase-orders/${po.id}/edit`)} style={styles.manageBtn} />
            ) : null}
            {po.status === 'DRAFT' ? (
              <Button title="Issue" onPress={onIssue} style={styles.manageBtn} />
            ) : null}
            <Button title="Cancel" variant="danger" onPress={onCancel} style={styles.manageBtn} />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Items</Text>
      <Card>
        {(po.items ?? []).length === 0 ? (
          <EmptyState title="No items" message="This order has no product lines." />
        ) : (
          <View style={styles.itemList}>
            {(po.items ?? []).map((item) => (
              <View key={item.productId} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.productName ?? 'Unknown product'}
                </Text>
                {item.sku ? (
                  <Text style={styles.itemSku} numberOfLines={1}>
                    SKU · {item.sku}
                  </Text>
                ) : null}
                <Text style={styles.itemQty}>
                  Ordered {formatNumber(item.quantityOrdered)} · Received {formatNumber(item.quantityReceived)} · Remaining{' '}
                  {formatNumber(item.remainingQuantity)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Text style={styles.sectionTitle}>Receiving history</Text>
      {(po.receipts ?? []).length === 0 ? (
        <Card>
          <EmptyState title="Nothing received yet" message="Stock received against this order will appear here." />
        </Card>
      ) : (
        <View style={styles.receiptList}>
          {(po.receipts ?? []).map((receipt, idx) => {
            const units = (receipt.lines ?? []).reduce((sum, l) => sum + (l.quantity || 0), 0);
            return (
              <Card key={`${receipt.receivedAt}-${idx}`} style={styles.receiptCard}>
                <View style={styles.receiptTop}>
                  <Text style={styles.receiptDate}>{formatDateTime(receipt.receivedAt)}</Text>
                  <Text style={styles.receiptUnits}>{formatNumber(units)} unit(s)</Text>
                </View>
                {receipt.reference ? (
                  <Text style={styles.receiptRef} numberOfLines={1}>
                    Reference · {receipt.reference}
                  </Text>
                ) : null}
                <View style={styles.receiptLines}>
                  {(receipt.lines ?? []).map((line) => (
                    <Text key={line.productId + String(idx)} style={styles.receiptLine} numberOfLines={1}>
                      {nameById.get(line.productId) ?? 'Unknown product'} +{formatNumber(line.quantity)}
                    </Text>
                  ))}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {canReceive ? (
        po.status === 'OPEN' ? (
          <>
            <Text style={styles.sectionTitle}>Receive stock</Text>
            <Button title="Receive Stock" full onPress={() => router.push(`/purchase-orders/${po.id}/receive`)} />
          </>
        ) : note ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        ) : null
      ) : null}
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    number: { ...type.h2, color: colors.text, flex: 1, fontVariant: ['tabular-nums'] },
    notes: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: spacing.lg },
    fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    fieldLabel: { ...type.body, color: colors.textMuted },
    fieldValue: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1, marginLeft: spacing.lg },
    fieldMono: { fontVariant: ['tabular-nums'] },
    fieldDanger: { color: colors.danger },
    manageRow: { flexDirection: 'row', gap: spacing.md },
    manageBtn: { flex: 1 },
    sectionTitle: { ...type.h3, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md },
    itemList: { gap: spacing.lg },
    itemRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, paddingBottom: spacing.lg },
    itemName: { ...type.body, color: colors.text, fontWeight: '700' },
    itemSku: { ...type.caption, color: colors.textMuted, marginTop: 2 },
    itemQty: { ...type.bodySmall, color: colors.textSecondary, marginTop: 6, fontVariant: ['tabular-nums'] },
    receiptList: { gap: spacing.sm },
    receiptCard: { padding: spacing.md },
    receiptTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    receiptDate: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
    receiptUnits: { ...type.caption, color: colors.textMuted, fontVariant: ['tabular-nums'] },
    receiptRef: { ...type.caption, color: colors.textMuted, marginTop: 4 },
    receiptLines: { marginTop: 6, gap: 2 },
    receiptLine: { ...type.caption, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    note: {
      marginTop: spacing.xxl,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    noteText: { ...type.bodySmall, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
  });
