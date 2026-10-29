// The read-only half of the SKU/barcode coverage check in `verify:demo`.
//
// The seeder knows what mode it was asked for. That is evidence about the command, not the
// products: a field write can be dropped, a partial insert can survive, or a tenant can be
// edited after the seed. This module asks MongoDB what the products actually carry.
//
// Four counts are enough to describe every product exactly once:
//
//   both        SKU and barcode present
//   withSku     SKU present (both included)
//   withBarcode barcode present (both included)
//   total       every product
//
// `demo/verify.mjs` turns those into the disjoint `skuOnly`, `barcodeOnly` and `neither`
// counts, and checks the barcode VALUES for EAN-13 check digits and duplicates. Nothing here
// writes: the calls here are four `countDocuments` reads and one projection of `barcode`.

import Product from '../../src/models/product.model.ts';

/** A real value, not a missing field, null, or an empty string. */
function present(field) {
  return { [field]: { $type: 'string', $ne: '' } };
}

/**
 * Read the four coverage counts for ONE tenant.
 *
 * The filter is the account's own resolved `businessId`; no client-supplied id reaches this
 * function. The five reads are independent, so they run together; each is served by the
 * existing `{ businessId: 1 }` index.
 *
 * The projected `barcode` values are returned as `barcodes`, because a check digit cannot be
 * verified by a count query. They are only the stored strings; no other product field is read.
 */
export async function readProductCodeCoverage(businessId) {
  if (!businessId) {
    throw new Error('readProductCodeCoverage needs a businessId. Nothing was read.');
  }

  const filter = { businessId };
  const [total, sku, barcode, both, barcodeRows] = await Promise.all([
    Product.countDocuments(filter),
    Product.countDocuments({ ...filter, ...present('sku') }),
    Product.countDocuments({ ...filter, ...present('barcode') }),
    Product.countDocuments({ ...filter, ...present('sku'), ...present('barcode') }),
    Product.find(filter).select('barcode').lean(),
  ]);

  const barcodes = barcodeRows
    .map((row) => row.barcode)
    .filter((value) => typeof value === 'string' && value !== '');

  return { total, sku, barcode, both, barcodes };
}
