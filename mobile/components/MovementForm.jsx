import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import Banner from './Banner';
import Button from './Button';
import Input from './Input';
import SelectField from './SelectField';
import { CenterLoader } from './ListState';
import { inventoryApi, locationsApi, productsApi } from '../lib/api';
import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { alert } from '../lib/confirm';
import { formatNumber } from '../lib/format';
import { useActiveRef } from '../hooks/useReferences';
import { colors, spacing, type } from '../lib/theme';

function fieldMap(err) {
  const out = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

const CONFIG = {
  'stock-in': {
    quantityLabel: 'Quantity',
    placeholder: 'How many are you adding?',
    submit: 'Add stock',
    allowZero: false,
    showAvailable: false,
    availLabel: null,
    title: 'Stock In',
  },
  'stock-out': {
    quantityLabel: 'Quantity',
    placeholder: 'How many are you removing?',
    submit: 'Remove stock',
    allowZero: false,
    showAvailable: true,
    availLabel: 'Available now',
    title: 'Stock Out',
  },
  adjust: {
    quantityLabel: 'New on-hand quantity (target)',
    placeholder: 'Set the quantity to this value',
    submit: 'Set quantity',
    allowZero: true,
    showAvailable: true,
    availLabel: 'Current on hand',
    title: 'Adjust Stock',
  },
};

/**
 * Loads the authoritative inventory row for a product+location so movement
 * forms can display current stock and warn before an action the server would
 * reject. The server still enforces every guard atomically — this is UX only.
 */
function useCurrentRow(token, productId, locationId) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token || !productId || !locationId) {
      setRow(null);
      setLoaded(false);
      return undefined;
    }
    setLoading(true);
    setLoaded(false);
    inventoryApi
      .list(token, { productId, page: 1, limit: 100 })
      .then((res) => {
        if (!active) return;
        const match = (res?.items ?? []).find((r) => r.location?.id === locationId);
        setRow(match ?? null);
      })
      .catch(() => {
        if (active) setRow(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [token, productId, locationId]);

  return { row, loading, loaded };
}

export default function MovementForm({
  kind,
  initialProductId,
  initialProductName,
  initialProductSku,
  initialProductBarcode,
  lockProduct = false,
  initialLocationId,
  initialLocationName,
}) {
  const cfg = CONFIG[kind] ?? CONFIG['stock-in'];
  const { token } = useSession();

  // When a workflow has already identified the product (e.g. a barcode scan),
  // the product is fixed and its identity is shown read-only so the user can
  // confirm they are moving the right product before submitting.
  const lockedProduct = lockProduct && Boolean(initialProductId);

  const products = useActiveRef(token, productsApi);
  const locations = useActiveRef(token, locationsApi);

  const [productId, setProductId] = useState(initialProductId ?? '');
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { row: current, loading: loadingCurrent, loaded: loadedCurrent } = useCurrentRow(
    token,
    cfg.showAvailable ? productId : null,
    cfg.showAvailable ? locationId : null
  );

  const productOptions = useMemo(() => {
    const list = products.items.map((p) => ({ value: p.id, label: p.name }));
    if (initialProductId && initialProductName && !list.some((o) => o.value === initialProductId)) {
      list.unshift({ value: initialProductId, label: initialProductName });
    }
    return list;
  }, [products.items, initialProductId, initialProductName]);

  const locationOptions = useMemo(() => {
    const list = locations.items.map((l) => ({ value: l.id, label: l.name }));
    if (initialLocationId && initialLocationName && !list.some((o) => o.value === initialLocationId)) {
      list.unshift({ value: initialLocationId, label: initialLocationName });
    }
    return list;
  }, [locations.items, initialLocationId, initialLocationName]);

  const selectedProduct = productOptions.find((o) => o.value === productId);
  const selectedLocation = locationOptions.find((o) => o.value === locationId);

  const onHandQty = current ? current.quantity : null;
  const availableQty = current ? current.availableQuantity : null;

  // Stock-out/adjust need an existing row (only stock-in creates one).
  let availState = null; // null = not requested | 'loading' | 'missing' | 'ready'
  if (cfg.showAvailable && productId && locationId) {
    availState = loadingCurrent ? 'loading' : !loadedCurrent ? 'loading' : current ? 'ready' : 'missing';
  }

  const qtyNum = quantity.trim() === '' ? null : Number(quantity);
  const qtyOk = cfg.allowZero ? qtyNum != null && qtyNum >= 0 && Number.isInteger(qtyNum) : qtyNum != null && qtyNum >= 1 && Number.isInteger(qtyNum);

  const warnOver =
    kind === 'stock-out' && availState === 'ready' && qtyOk && availableQty != null && qtyNum > availableQty;
  const warnNoChange = kind === 'adjust' && availState === 'ready' && qtyOk && onHandQty != null && qtyNum === onHandQty;
  const canSubmit = Boolean(
    productId && locationId && qtyOk && !busy && !warnOver && !warnNoChange && availState !== 'missing'
  );

  const shownValue = kind === 'adjust' ? onHandQty : availableQty;

  async function submit() {
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    const payload = {
      productId,
      locationId,
      quantity: qtyNum,
      reason: reason.trim() || undefined,
      reference: reference.trim() || undefined,
    };
    const perform = {
      'stock-in': () => inventoryApi.stockIn(token, payload),
      'stock-out': () => inventoryApi.stockOut(token, payload),
      adjust: () => inventoryApi.adjust(token, payload),
    }[kind];
    try {
      const res = await perform();
      const { previousQuantity, newQuantity } = res;
      const at = `${selectedProduct?.label ?? 'product'} at ${selectedLocation?.label ?? 'location'}`;
      await alert(cfg.title, `Done. ${at}: ${formatNumber(previousQuantity)} → ${formatNumber(newQuantity)}`);
      router.back();
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError(err?.message || 'The movement could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  // A locked (scanned) product doesn't need the product picker's list, so don't
  // block the form on loading products that won't be shown.
  if (!lockedProduct && products.loading && products.items.length === 0) {
    return <CenterLoader label="Loading products…" />;
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Banner type="error" text={formError} />

      {availState === 'loading' ? <Banner type="info" text="Checking current stock…" /> : null}
      {availState === 'missing' ? (
        <Banner type="warn" text="No stock record for this product at this location yet — use Stock In to create one." />
      ) : null}
      {warnOver ? (
        <Banner type="warn" text={`Only ${formatNumber(availableQty)} available — the server will not let stock go below zero.`} />
      ) : null}
      {warnNoChange ? (
        <Banner type="warn" text="This product is already at that quantity — no adjustment is needed." />
      ) : null}

      {lockedProduct ? (
        <View style={styles.lockedCard}>
          <Text style={styles.lockedHeading}>Product</Text>
          <Text style={styles.lockedName}>{initialProductName ?? 'Scanned product'}</Text>
          {initialProductSku ? <Text style={styles.lockedMeta}>SKU · {initialProductSku}</Text> : null}
          {initialProductBarcode ? <Text style={styles.lockedMeta}>Barcode · {initialProductBarcode}</Text> : null}
        </View>
      ) : (
        <SelectField
          label="Product"
          placeholder="Choose a product…"
          options={productOptions}
          value={productId}
          onChange={setProductId}
          error={fieldErrors.productId}
          required
          searchable
        />
      )}
      <SelectField
        label="Location"
        placeholder="Choose a location…"
        options={locationOptions}
        value={locationId}
        onChange={setLocationId}
        error={fieldErrors.locationId}
        required
        searchable
      />

      {availState === 'ready' && shownValue != null ? (
        <View style={styles.availLine}>
          <Text style={styles.availLabel}>{cfg.availLabel}</Text>
          <Text style={styles.availValue}>{formatNumber(shownValue)}</Text>
        </View>
      ) : null}

      <Input
        name="quantity"
        label={cfg.quantityLabel}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
        placeholder={cfg.placeholder}
        error={fieldErrors.quantity}
        helper={kind === 'adjust' ? 'You can set stock to 0.' : 'Must be a whole number of 1 or more.'}
        required
      />
      <Input name="reason" label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. supplier delivery, damaged, recount" maxLength={500} />
      <Input name="reference" label="Reference (optional)" value={reference} onChangeText={setReference} placeholder="e.g. PO-1234, invoice #" maxLength={200} autoCapitalize="none" />

      <Button
        title={cfg.submit}
        onPress={submit}
        loading={busy}
        disabled={!canSubmit}
        variant={kind === 'stock-out' ? 'secondary' : 'primary'}
        full
      />
      <Text style={styles.hint}>Changes are applied atomically on the server and recorded in inventory history.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  availLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  availLabel: { ...type.body, color: colors.textMuted },
  availValue: { ...type.h3, color: colors.text },
  lockedCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  lockedHeading: { ...type.label, color: colors.textMuted, marginBottom: 4 },
  lockedName: { ...type.body, fontWeight: '700', color: colors.text, marginBottom: 2 },
  lockedMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
});
