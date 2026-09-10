import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import Banner from '../../../../components/Banner';
import { PoStatusBadge } from '../../../../components/Badge';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import Input from '../../../../components/Input';
import { CenterLoader, EmptyState, ErrorState, errorText } from '../../../../components/ListState';
import Screen from '../../../../components/Screen';
import AccessDenied from '../../../../components/AccessDenied';
import { purchaseOrdersApi } from '../../../../lib/api';
import { ApiError } from '../../../../lib/client';
import { isSessionError, useSession } from '../../../../lib/auth';
import { alert } from '../../../../lib/confirm';
import { formatNumber } from '../../../../lib/format';
import { canReceivePurchaseOrders } from '../../../../lib/permissions';
import { radius, spacing, type } from '../../../../lib/theme';
import { useTheme } from '../../../../lib/theme-context';

function str(v) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Amount of a line that can actually be received right now. The server's item
 * DTO reports remaining = ordered − received (the ledger truth) but reserves are
 * ALSO taken out of what a receive may claim. Pending claims (an interrupted
 * receive) therefore reduce the offered maximum; at rest they are empty.
 */
function offeredQuantity(line, pendingByProduct) {
  return Math.max(0, (line.remainingQuantity || 0) - (pendingByProduct.get(line.productId) || 0));
}

/** Receivable lines — items with some remaining after any pending claims. */
function receivableLines(po) {
  const pending = new Map();
  for (const c of po.pendingClaims ?? []) pending.set(c.productId, (pending.get(c.productId) || 0) + (c.quantity || 0));
  return (po.items ?? [])
    .map((item) => ({ ...item, offered: offeredQuantity(item, pending) }))
    .filter((item) => item.offered > 0);
}

/** Per-line default: receive everything still remaining (edit down for partial). */
function defaultQuantities(po) {
  const out = {};
  for (const line of receivableLines(po)) out[line.productId] = String(line.offered);
  return out;
}

function entry(raw, offered) {
  const s = (raw ?? '').trim();
  if (s === '') return { kind: 'empty' };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return { kind: 'invalid', msg: 'Enter a whole number of units.' };
  if (n === 0) return { kind: 'empty' };
  if (n > offered) return { kind: 'invalid', msg: `Only ${formatNumber(offered)} remaining on this line.` };
  return { kind: 'ok', n };
}

const CODE_MESSAGES = {
  PO_NOT_FOUND: 'This purchase order no longer exists.',
  PO_NOT_ISSUED: 'Issue the purchase order before receiving it.',
  PO_ALREADY_RECEIVED: 'This purchase order has already been received.',
  PO_CANCELED: 'This purchase order was canceled and cannot be received.',
  PO_LINE_NOT_FOUND: 'A product on this receive is not on the purchase order. Refresh and retry.',
  PO_REMAINING_EXCEEDED: 'A quantity exceeds what is still remaining. Refresh and retry.',
  PO_STATE_CONFLICT: 'The purchase order changed underneath this receive. Refresh and retry.',
  VALIDATION_ERROR: 'Check the receive quantities and try again.',
  NETWORK_TIMEOUT: 'The request timed out. Check your connection and try again.',
  NETWORK_ERROR: 'Cannot reach the server. Check your connection and try again.',
};

export default function ReceiveStockScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const { user, token, signOut } = useSession();
  const poId = str(id);

  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState(null);
  const [partial, setPartial] = useState(null); // { message } when a 409 landed some lines
  const [busy, setBusy] = useState(false);

  if (!canReceivePurchaseOrders(user)) {
    return <AccessDenied message="Your role does not allow receiving purchase orders." />;
  }

  const load = useCallback(async () => {
    if (!token || !poId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseOrdersApi.get(token, poId);
      setPo(data);
      // Rebuild editors from the fresh order state (initial load, and after a
      // partial receive the applied lines are dropped and remaining re-offered).
      setQuantities(defaultQuantities(data));
    } catch (err) {
      setError(err);
      if (isSessionError(err)) await signOut();
    } finally {
      setLoading(false);
    }
  }, [token, poId, signOut]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !po) return <CenterLoader label="Loading order…" />;
  if (error && !po) return <ErrorState title="Couldn't load the purchase order" message={errorText(error)} onRetry={load} />;
  if (!po) return null;

  // Only OPEN orders are receivable. DRAFT must be issued server-side first;
  // RECEIVED/CANCELED are terminal.
  if (po.status !== 'OPEN') {
    const note =
      po.status === 'DRAFT'
        ? 'Issue this order before receiving it.'
        : po.status === 'RECEIVED'
          ? 'This order is already fully received.'
          : po.status === 'CANCELED'
            ? 'This order was canceled and can no longer be received.'
            : 'This order cannot be received in its current state.';
    return (
      <Screen scroll>
        <Card>
          <View style={styles.titleRow}>
            <Text style={styles.number} numberOfLines={1}>
              {po.number}
            </Text>
            <PoStatusBadge status={po.status} />
          </View>
          <View style={styles.divider} />
          <EmptyState title={note} />
        </Card>
      </Screen>
    );
  }

  const lines = receivableLines(po);

  if (lines.length === 0) {
    return (
      <Screen scroll>
        <Card>
          <View style={styles.titleRow}>
            <Text style={styles.number} numberOfLines={1}>
              {po.number}
            </Text>
            <PoStatusBadge status={po.status} />
          </View>
          <View style={styles.divider} />
          <EmptyState
            title="Nothing left to receive"
            message="Every line on this order has already been received (or is held by an interrupted receive)."
          />
        </Card>
      </Screen>
    );
  }

  const entries = lines.map((line) => ({ line, ...entry(quantities[line.productId], line.offered) }));
  const ok = entries.filter((e) => e.kind === 'ok');
  const units = ok.reduce((sum, e) => sum + e.n, 0);
  const hasInvalid = entries.some((e) => e.kind === 'invalid');
  const canSubmit = !busy && ok.length > 0 && !hasInvalid;
  const buttonTitle = units > 0 ? `Receive ${formatNumber(units)} unit${units === 1 ? '' : 's'}` : 'Receive stock';

  function onChangeQty(productId, value) {
    setQuantities((prev) => ({ ...prev, [productId]: value }));
  }

  async function submit() {
    setBusy(true);
    setFormError(null);
    setPartial(null);
    try {
      const linesPayload = ok.map((e) => ({ productId: e.line.productId, quantity: e.n }));
      const res = await purchaseOrdersApi.receive(token, poId, {
        lines: linesPayload,
        reference: reference.trim() || undefined,
      });
      const summary = `Received ${formatNumber(units)} unit(s) across ${ok.length} line${ok.length === 1 ? '' : 's'}.`;
      const done = res?.allReceived ? `${summary}\n\nThis order is now fully received.` : summary;
      await alert('Receive Stock', done);
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RECEIVE_CONFLICT') {
        // Some lines landed before the batch was rejected. Tell the operator,
        // then refetch the order so the applied lines drop out of the editors
        // and the user can immediately receive the rest.
        const applied = err.applied ?? [];
        const landed = applied.reduce((sum, a) => sum + (a.quantity || 0), 0);
        setPartial({
          message:
            applied.length > 0
              ? `Only part could be received — ${formatNumber(landed)} unit(s) across ${applied.length} line(s) landed. The rest is shown below; receive again to finish it.`
              : err?.message || 'This receive could not be applied. Refresh and retry the remaining lines.',
        });
        await load();
      } else {
        const code = err?.code;
        setFormError((CODE_MESSAGES[code] ?? err?.message) || 'The receive could not be completed.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll keyboard>
      <Card>
        <View style={styles.titleRow}>
          <Text style={styles.number} numberOfLines={1}>
            {po.number}
          </Text>
          <PoStatusBadge status={po.status} />
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {po.location?.name ? `Receives into ${po.location.name}` : 'Receives into the order location'}
          </Text>
          {po.supplier?.name ? <Text style={styles.meta}>{po.supplier.name}</Text> : null}
        </View>
      </Card>

      <Banner type="error" text={formError} />
      <Banner type="warn" text={partial?.message} />

      {loading ? <Banner type="info" text="Refreshing the order…" /> : null}

      <Text style={styles.sectionTitle}>Receive quantities</Text>
      <View style={styles.lineList}>
        {entries.map((e) => (
          <View key={e.line.productId} style={styles.lineCard}>
            <Text style={styles.lineName} numberOfLines={1}>
              {e.line.productName ?? 'Unknown product'}
            </Text>
            {e.line.sku ? (
              <Text style={styles.lineSku} numberOfLines={1}>
                SKU · {e.line.sku}
              </Text>
            ) : null}
            <Text style={styles.lineQty}>
              Ordered {formatNumber(e.line.quantityOrdered)} · Received {formatNumber(e.line.quantityReceived)}
            </Text>
            <Input
              name={e.line.productId}
              label="Receive quantity"
              value={quantities[e.line.productId]}
              onChangeText={(v) => onChangeQty(e.line.productId, v)}
              keyboardType="number-pad"
              placeholder={`0–${e.line.offered}`}
              error={e.kind === 'invalid' ? e.msg : undefined}
              helper={`Remaining on this line: ${formatNumber(e.line.offered)}. Set 0 to skip.`}
            />
          </View>
        ))}
      </View>

      <Input
        name="reference"
        label="Reference (optional)"
        value={reference}
        onChangeText={setReference}
        placeholder="e.g. delivery note or invoice #"
        maxLength={200}
        autoCapitalize="none"
      />

      <Button title={buttonTitle} onPress={submit} loading={busy} disabled={!canSubmit} full />
      <Text style={styles.hint}>
        Stock lands at the order's location and is recorded in inventory history. The server enforces remaining quantities
        and concurrency — the order flips to Received when complete.
      </Text>
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    number: { ...type.h2, color: colors.text, flex: 1, fontVariant: ['tabular-nums'] },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
    meta: { ...type.caption, color: colors.textMuted },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: spacing.lg },
    sectionTitle: { ...type.h3, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md },
    lineList: { gap: spacing.md },
    lineCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    lineName: { ...type.body, color: colors.text, fontWeight: '700' },
    lineSku: { ...type.caption, color: colors.textMuted, marginTop: 2 },
    lineQty: { ...type.bodySmall, color: colors.textSecondary, marginTop: 6, marginBottom: spacing.md, fontVariant: ['tabular-nums'] },
    hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
  });
