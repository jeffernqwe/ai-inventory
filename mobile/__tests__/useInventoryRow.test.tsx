import { act, renderHook } from '@testing-library/react-native';

import { inventoryApi } from '../lib/api';
import useInventoryRow from '../hooks/useInventoryRow';
import type { InventoryRowSummary } from '../hooks/useInventoryRow';

/**
 * MOD-10D — `useInventoryRow` regression suite.
 *
 * The hook answers "what is on hand for this product at this location right
 * now", and both movement forms (MovementForm for stock-in/out/adjust,
 * TransferForm for transfers) gate their submit button on the answer. Two
 * behaviours matter and are pinned here:
 *
 *  1. The four states a consumer can observe — not requested, loading, ready,
 *     missing — must stay exactly as they are, because MovementForm and
 *     TransferForm derive `availState`/`sourceState` from `loading`/`loaded`
 *     and only ever read `row` once that derivation says "ready".
 *
 *  2. **The previous product's quantity must never be shown as current for a
 *     newly selected product.** The hook used to hold `row` in state across a
 *     parameter change and reset it from inside the effect, so the render that
 *     carried the new `productId` still carried `loaded: true` and the OLD row —
 *     one commit in which a consumer saw `'ready'` with the wrong number. The
 *     hook now derives `loading`/`loaded` from a request identity, which makes
 *     that commit impossible: a result is only ever exposed for the key it was
 *     fetched for.
 *
 * The renders are recorded by reading the hook's own public return value on
 * every render, which is precisely what a consumer sees — no internal
 * implementation detail is asserted on.
 *
 * Rollback contract: if `loading`/`loaded` go back to being stored state reset
 * by the effect, the two "does not expose the previous row" cases fail with the
 * stale quantity still marked loaded.
 */

jest.mock('../lib/api', () => ({
  inventoryApi: { list: jest.fn() },
}));

const list = inventoryApi.list as jest.Mock;

type RowResult = { row: InventoryRowSummary | null; loading: boolean; loaded: boolean };
type HookProps = { token: string | null; productId: string | null; locationId: string | null };

/** A row as the list endpoint returns it, for one location. */
const rowFor = (locationId: string, quantity: number, availableQuantity = quantity) => ({
  location: { id: locationId, name: `Location ${locationId}` },
  quantity,
  availableQuantity,
});

const listResult = (...rows: ReturnType<typeof rowFor>[]) => ({ items: rows, total: rows.length });

/** A promise whose settlement the test controls, so pending states are observable. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Renders the hook and records its public return value on every render.
 * `renders` is the sequence a consumer would have seen.
 */
const mount = async (
  initialProps: HookProps
): Promise<{
  result: { current: RowResult };
  rerender: (props: HookProps) => Promise<void>;
  renders: RowResult[];
}> => {
  const renders: RowResult[] = [];
  const utils = await renderHook(
    (props: HookProps) => {
      const value = useInventoryRow(props.token, props.productId, props.locationId);
      renders.push(value);
      return value;
    },
    { initialProps }
  );
  return { ...utils, renders };
};

/**
 * Whether any render from `from` onward exposed a row as settled/authoritative.
 * This is the shape a consumer reads as "ready" — the only state in which `row`
 * is consulted at all.
 */
const settlesOnQuantity = (renders: RowResult[], from: number, quantity: number): boolean =>
  renders.slice(from).some((r) => !r.loading && r.loaded && r.row?.quantity === quantity);

/** Resolves a deferred and lets the resulting state updates flush. */
const settle = async (fn: () => void): Promise<void> => {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useInventoryRow — result states', () => {
  it('requests the row and exposes a pending state before the response lands', async () => {
    const first = deferred<ReturnType<typeof listResult>>();
    list.mockReturnValueOnce(first.promise);

    const { result } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith('token-1', { productId: 'p1', page: 1, limit: 100 });
    // Pending: not settled, so no consumer may read a row.
    expect(result.current.loading).toBe(true);
    expect(result.current.loaded).toBe(false);
    expect(result.current.row).toBeNull();

    await settle(() => first.resolve(listResult(rowFor('l1', 5))));

    expect(result.current).toEqual({ row: rowFor('l1', 5), loading: false, loaded: true });
  });

  it('returns the matching location row when the product has rows elsewhere too', async () => {
    list.mockResolvedValueOnce(listResult(rowFor('l1', 5), rowFor('l2', 12)));

    const { result } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l2' });

    expect(result.current.loading).toBe(false);
    expect(result.current.loaded).toBe(true);
    expect(result.current.row).toEqual(rowFor('l2', 12));
  });

  it('settles to no row when the product has no row at that location', async () => {
    list.mockResolvedValueOnce(listResult(rowFor('l1', 5)));

    const { result } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l9' });

    // "missing" is a settled answer, not a pending one — the form offers Stock In.
    expect(result.current).toEqual({ row: null, loading: false, loaded: true });
  });

  it('settles to no row when the request fails, without inventing an error field', async () => {
    list.mockRejectedValueOnce(new Error('network down'));

    const { result } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });

    // A failure collapses onto the same settled shape as "no row": this hook has
    // no error channel by design, and adding one would be an API change.
    expect(result.current).toEqual({ row: null, loading: false, loaded: true });
  });
});

describe('useInventoryRow — not requested', () => {
  it.each([
    ['a missing token', { token: null, productId: 'p1', locationId: 'l1' }],
    ['a missing product', { token: 'token-1', productId: null, locationId: 'l1' }],
    ['a missing location', { token: 'token-1', productId: 'p1', locationId: null }],
    ['an empty product', { token: 'token-1', productId: '', locationId: 'l1' }],
    ['an empty location', { token: 'token-1', productId: 'p1', locationId: '' }],
    // Stock In passes null identifiers on purpose: it creates a row rather than
    // reading one, so the hook must stay completely inert.
    ['Stock In sending null identifiers', { token: 'token-1', productId: null, locationId: null }],
  ])('makes no request and exposes nothing for %s', async (_label, props) => {
    const { result } = await mount(props as HookProps);

    expect(list).not.toHaveBeenCalled();
    expect(result.current).toEqual({ row: null, loading: false, loaded: false });
  });
});

describe('useInventoryRow — parameter changes', () => {
  it('never exposes the previous product as loaded for a newly selected product', async () => {
    list.mockResolvedValueOnce(listResult(rowFor('l1', 7)));

    const { result, rerender, renders } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });
    expect(result.current.row).toEqual(rowFor('l1', 7));

    const second = deferred<ReturnType<typeof listResult>>();
    list.mockReturnValueOnce(second.promise);

    const before = renders.length;
    await rerender({ token: 'token-1', productId: 'p2', locationId: 'l1' });

    // The regression: p1's quantity must not survive as p2's answer, in any
    // render, not even for one commit.
    expect(settlesOnQuantity(renders, before, 7)).toBe(false);
    expect(list).toHaveBeenLastCalledWith('token-1', { productId: 'p2', page: 1, limit: 100 });
    expect(result.current.loading).toBe(true);
    expect(result.current.loaded).toBe(false);

    await settle(() => second.resolve(listResult(rowFor('l1', 99))));

    expect(result.current).toEqual({ row: rowFor('l1', 99), loading: false, loaded: true });
    expect(settlesOnQuantity(renders, before, 7)).toBe(false);
  });

  it('never exposes the previous location as loaded for a newly selected location', async () => {
    list.mockResolvedValueOnce(listResult(rowFor('l1', 7), rowFor('l2', 30)));

    const { result, rerender, renders } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });
    expect(result.current.row).toEqual(rowFor('l1', 7));

    const second = deferred<ReturnType<typeof listResult>>();
    list.mockReturnValueOnce(second.promise);

    const before = renders.length;
    await rerender({ token: 'token-1', productId: 'p1', locationId: 'l2' });

    expect(settlesOnQuantity(renders, before, 7)).toBe(false);

    await settle(() => second.resolve(listResult(rowFor('l1', 7), rowFor('l2', 30))));

    expect(result.current).toEqual({ row: rowFor('l2', 30), loading: false, loaded: true });
  });

  it('refetches on a token change and lets the new result win', async () => {
    list.mockResolvedValueOnce(listResult(rowFor('l1', 7)));

    const { result, rerender, renders } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });
    expect(result.current.row).toEqual(rowFor('l1', 7));

    const second = deferred<ReturnType<typeof listResult>>();
    list.mockReturnValueOnce(second.promise);

    const before = renders.length;
    await rerender({ token: 'token-2', productId: 'p1', locationId: 'l1' });

    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith('token-2', { productId: 'p1', page: 1, limit: 100 });
    expect(settlesOnQuantity(renders, before, 7)).toBe(false);

    await settle(() => second.resolve(listResult(rowFor('l1', 99))));

    expect(result.current).toEqual({ row: rowFor('l1', 99), loading: false, loaded: true });
  });

  it('drops back to not-requested when a selected location is cleared', async () => {
    list.mockResolvedValueOnce(listResult(rowFor('l1', 7)));

    const { result, rerender } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });
    expect(result.current.row).toEqual(rowFor('l1', 7));

    await rerender({ token: 'token-1', productId: 'p1', locationId: '' });

    // Also proves no stale row is left behind for a key that cannot be fetched.
    expect(result.current).toEqual({ row: null, loading: false, loaded: false });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('stops reporting a pending load when the selection is cleared mid-flight', async () => {
    const first = deferred<ReturnType<typeof listResult>>();
    list.mockReturnValueOnce(first.promise);

    const { result, rerender } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });
    expect(result.current.loading).toBe(true);

    await rerender({ token: 'token-1', productId: 'p1', locationId: '' });

    // "A row was never requested" is not "a row is being fetched": a stored
    // loading flag could only be cleared by the effect, and no effect runs for a
    // key that cannot be fetched, so it would have stayed true here.
    expect(result.current).toEqual({ row: null, loading: false, loaded: false });

    // The abandoned request still resolves without disturbing that.
    await settle(() => first.resolve(listResult(rowFor('l1', 5))));
    expect(result.current).toEqual({ row: null, loading: false, loaded: false });
  });
});

describe('useInventoryRow — superseded responses', () => {
  it('does not let a slow earlier request overwrite a later one', async () => {
    const slow = deferred<ReturnType<typeof listResult>>();
    const fast = deferred<ReturnType<typeof listResult>>();
    list.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const { result, rerender, renders } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });
    await rerender({ token: 'token-1', productId: 'p2', locationId: 'l1' });

    // The newer request wins the race...
    await settle(() => fast.resolve(listResult(rowFor('l1', 42))));
    expect(result.current).toEqual({ row: rowFor('l1', 42), loading: false, loaded: true });

    // ...and the older one, resolving afterwards, is inert.
    const before = renders.length;
    await settle(() => slow.resolve(listResult(rowFor('l1', 999))));

    expect(result.current).toEqual({ row: rowFor('l1', 42), loading: false, loaded: true });
    expect(settlesOnQuantity(renders, before, 999)).toBe(false);
  });

  it('ignores a rejection from a superseded request', async () => {
    const slow = deferred<ReturnType<typeof listResult>>();
    const fast = deferred<ReturnType<typeof listResult>>();
    list.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const { result, rerender } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });
    await rerender({ token: 'token-1', productId: 'p2', locationId: 'l1' });

    await settle(() => fast.resolve(listResult(rowFor('l1', 42))));
    await settle(() => slow.reject(new Error('stale failure')));

    expect(result.current).toEqual({ row: rowFor('l1', 42), loading: false, loaded: true });
  });
});

describe('useInventoryRow — public API', () => {
  it('exposes exactly row, loading and loaded', async () => {
    list.mockResolvedValueOnce(listResult(rowFor('l1', 5)));

    const { result } = await mount({ token: 'token-1', productId: 'p1', locationId: 'l1' });

    expect(Object.keys(result.current).sort()).toEqual(['loaded', 'loading', 'row']);
  });
});
