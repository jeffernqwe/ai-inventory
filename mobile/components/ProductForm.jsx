import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import Banner from './Banner';
import Button from './Button';
import Input from './Input';
import SelectField from './SelectField';
import { productsApi, categoriesApi } from '../lib/api';
import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { useActiveRef } from '../hooks/useReferences';
import { colors } from '../lib/theme';

function fieldMap(err) {
  const out = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

function toNumber(text) {
  const t = (text ?? '').trim();
  if (t === '') return { value: undefined, ok: true };
  const n = Number(t);
  if (!Number.isFinite(n)) return { value: undefined, ok: false, message: 'Enter a valid number' };
  return { value: n, ok: true };
}

function toWhole(text) {
  const r = toNumber(text);
  if (!r.ok || r.value === undefined) return r;
  if (!Number.isInteger(r.value)) return { value: undefined, ok: false, message: 'Enter a whole number' };
  return r;
}

/**
 * Product create/edit form (backend is authoritative; this validates input for
 * a good UX and surfaces the server's { field, message } problems on submit).
 */
export default function ProductForm({ initial }) {
  const { token } = useSession();
  const isEdit = Boolean(initial);
  const categories = useActiveRef(token, categoriesApi);

  const [name, setName] = useState(initial?.name ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [barcode, setBarcode] = useState(initial?.barcode ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category?.id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [costPrice, setCostPrice] = useState(initial?.costPrice != null && initial.costPrice !== 0 ? String(initial.costPrice) : '');
  const [sellingPrice, setSellingPrice] = useState(
    initial?.sellingPrice != null && initial.sellingPrice !== 0 ? String(initial.sellingPrice) : ''
  );
  const [minimumStock, setMinimumStock] = useState(
    initial?.minimumStock != null && initial.minimumStock !== 0 ? String(initial.minimumStock) : ''
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const categoryOptions = [{ value: '', label: 'No category' }, ...categories.items.map((c) => ({ value: c.id, label: c.name }))];

  async function submit() {
    // Client-side pre-checks (friendly, mirrors the server rules).
    const problems = {};
    if (!name.trim()) problems.name = 'Name is required';
    const cost = toNumber(costPrice);
    if (!cost.ok) problems.costPrice = cost.message;
    else if (cost.value != null && cost.value < 0) problems.costPrice = 'Cost must be at least 0';
    const sell = toNumber(sellingPrice);
    if (!sell.ok) problems.sellingPrice = sell.message;
    else if (sell.value != null && sell.value < 0) problems.sellingPrice = 'Selling price must be at least 0';
    const min = toWhole(minimumStock);
    if (!min.ok) problems.minimumStock = min.message;
    else if (min.value != null && min.value < 0) problems.minimumStock = 'Minimum stock must be at least 0';
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      return;
    }

    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    const payload = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      barcode: barcode.trim() || undefined,
      categoryId: categoryId || undefined,
      description: description.trim() || undefined,
      unit: unit.trim() || undefined,
      costPrice: cost.value,
      sellingPrice: sell.value,
      minimumStock: min.value,
      imageUrl: imageUrl.trim() || undefined,
    };
    try {
      if (isEdit) await productsApi.update(token, initial.id, payload);
      else await productsApi.create(token, payload);
      router.back();
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError(err?.message || 'Unable to save the product.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Banner type="error" text={formError} />
      <Input name="name" label="Product name" value={name} onChangeText={setName} error={fieldErrors.name} required autoCapitalize="words" />
      <Input name="sku" label="SKU" value={sku} onChangeText={setSku} error={fieldErrors.sku} placeholder="Optional — unique per business" autoCapitalize="characters" />
      <Input name="barcode" label="Barcode" value={barcode} onChangeText={setBarcode} error={fieldErrors.barcode} placeholder="Optional — unique per business" autoCapitalize="characters" />
      <SelectField
        label="Category"
        placeholder="Choose a category…"
        options={categoryOptions}
        value={categoryId}
        onChange={setCategoryId}
        error={fieldErrors.categoryId}
        searchable
        disabled={categories.items.length === 0}
      />
      <Input name="description" label="Description" value={description} onChangeText={setDescription} multiline error={fieldErrors.description} />
      <Input name="costPrice" label="Cost price" value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" error={fieldErrors.costPrice} placeholder="0.00" />
      <Input name="sellingPrice" label="Selling price" value={sellingPrice} onChangeText={setSellingPrice} keyboardType="decimal-pad" error={fieldErrors.sellingPrice} placeholder="0.00" />
      <Input name="unit" label="Unit" value={unit} onChangeText={setUnit} error={fieldErrors.unit} placeholder="e.g. box, kg, litre" autoCapitalize="none" />
      <Input name="minimumStock" label="Minimum stock" value={minimumStock} onChangeText={setMinimumStock} keyboardType="number-pad" error={fieldErrors.minimumStock} helper="Alert when available stock drops to this level (0 = disabled)" />
      <Input name="imageUrl" label="Image URL" value={imageUrl} onChangeText={setImageUrl} error={fieldErrors.imageUrl} placeholder="Optional https://…" autoCapitalize="none" />
      <Button title={isEdit ? 'Save changes' : 'Create product'} onPress={submit} loading={busy} full />
    </ScrollView>
  );
}
