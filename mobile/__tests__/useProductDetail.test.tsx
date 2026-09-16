import { act, renderHook } from '@testing-library/react-native';

import { productsApi } from '../lib/api';
import { isSessionError, useSession } from '../lib/auth';
import { useProductDetail } from '../hooks/useProductDetail';

/**
 * MOD-10F — `useProductDetail` supersession suite.
 *
 * `reload()` is public and is called imperatively from four places in
 * `products/[id]/index.tsx` (the focus refetch, the ErrorState retry, and the
 * reloads after archive and after generating a barcode), so two requests can be
 * in flight at once. Before this phase the hook had no guard at all: a slow
 * earlier response could overwrite a newer product, a superseded rejection could
 * overwrite `error`, and a stale session error could sign the user out after a
 * newer request had already succeeded.
 *
 * The guard is a request counter inside `load` — not an Effect cleanup flag —
 * because an imperative reload has no Effect run to be cleaned up by. These
 * tests therefore drive the overlaps through `reload()` itself and assert only
 * on the public return value, never on the counter.
 *
 * Rollback contract: bypassing the counter's comparisons (so every request is
 * treated as current) turns the stale-response and stale-error cases red.
 */

jest.mock('../lib/api', () => ({
  productsApi: { get: jest.fn() },
}));

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
  isSessionError: jest.fn(),
}));

const get = productsApi.get as jest.Mock;
const mockUseSession = useSession as jest.Mock;
const mockIsSessionError = isSessionError as jest.Mock;

const signOut = jest.fn();

type HookResult = {
  product: unknown;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
};

const product = (id: string, name = `Product ${id}`) => ({ id, name, status: 'ACTIVE' });
const nameOf = (value: HookResult): string | undefined =>
  (value.product as { name?: string } | null)?.name;

/** A promise whose settlement the test controls, so ordering is deterministic. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mount = async () => {
  const utils = await renderHook(() => useProductDetail('p1'));
  return utils;
};

/** Resolves a deferred and lets the resulting state updates flush. */
const settle = async (fn: () => void): Promise<void> => {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
};

/**
 * Starts an imperative reload WITHOUT awaiting it, so a second one can be
 * started while the first is still in flight. `reload` resolves on its own and
 * never rejects, so leaving it unawaited cannot leak a rejection.
 */
const startReload = async (result: { current: HookResult }): Promise<void> => {
  await act(async () => {
    void result.current.reload();
    await Promise.resolve();
  });
};

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: mockClear leaves unconsumed
  // mockReturnValueOnce entries queued and leaks them into the next test.
  jest.resetAllMocks();
  mockUseSession.mockReturnValue({ token: 'token-1', signOut });
  mockIsSessionError.mockReturnValue(false);
});

describe('useProductDetail — initial load', () => {
  it('1. exposes a pending state, then the product', async () => {
    const first = deferred<unknown>();
    get.mockReturnValueOnce(first.promise);

    const { result } = await mount();

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('token-1', 'p1');
    expect(result.current.loading).toBe(true);
    expect(result.current.product).toBeNull();

    await settle(() => first.resolve(product('p1')));

    expect(result.current).toEqual({
      product: product('p1'),
      loading: false,
      error: null,
      reload: expect.any(Function),
    });
  });

  it('2. exposes the error and clears loading when the request fails', async () => {
    const failure = new Error('network down');
    get.mockRejectedValueOnce(failure);

    const { result } = await mount();

    expect(result.current.product).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(failure);
  });

  it('3. signs out on a session error', async () => {
    const failure = new Error('session gone');
    get.mockRejectedValueOnce(failure);
    mockIsSessionError.mockReturnValue(true);

    const { result } = await mount();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(failure);
  });

  it('4. does not sign out on a non-session error', async () => {
    get.mockRejectedValueOnce(new Error('boom'));

    await mount();

    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('useProductDetail — same-key refresh', () => {
  it('5. keeps the previous product on screen while reloading', async () => {
    get.mockResolvedValueOnce(product('p1', 'Current'));

    const { result } = await mount();
    expect(nameOf(result.current)).toBe('Current');

    const second = deferred<unknown>();
    get.mockReturnValueOnce(second.promise);

    await startReload(result);

    // Loading is true while the previous product is still available — the shape
    // both consumers' `loading && !product` gate depends on.
    expect(result.current.loading).toBe(true);
    expect(nameOf(result.current)).toBe('Current');

    await settle(() => second.resolve(product('p1', 'Refreshed')));

    expect(nameOf(result.current)).toBe('Refreshed');
    expect(result.current.loading).toBe(false);
  });
});

describe('useProductDetail — superseded responses', () => {
  it('6. keeps the newer product when an older request resolves last', async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    get.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result } = await mount();
    await startReload(result);
    expect(get).toHaveBeenCalledTimes(2);

    // The newer request wins the race...
    await settle(() => b.resolve(product('p1', 'Newer')));
    expect(nameOf(result.current)).toBe('Newer');
    expect(result.current.loading).toBe(false);

    // ...and the older one, resolving afterwards, is inert.
    await settle(() => a.resolve(product('p1', 'Older')));
    expect(nameOf(result.current)).toBe('Newer');
    expect(result.current.loading).toBe(false);
  });

  it('7. ignores a rejection from a superseded request', async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    get.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result } = await mount();
    await startReload(result);

    await settle(() => b.resolve(product('p1', 'Newer')));
    await settle(() => a.reject(new Error('stale failure')));

    expect(result.current.error).toBeNull();
    expect(nameOf(result.current)).toBe('Newer');
  });

  it('8. does not sign out for a session error on a superseded request', async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    get.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    mockIsSessionError.mockReturnValue(true);

    const { result } = await mount();
    await startReload(result);

    await settle(() => b.resolve(product('p1', 'Newer')));
    await settle(() => a.reject(new Error('stale 401')));

    // A stale 401 must not end the session after a newer request succeeded.
    expect(signOut).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(nameOf(result.current)).toBe('Newer');
  });

  it('9. still surfaces the error from the latest request', async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    get.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result } = await mount();
    await startReload(result);

    const failure = new Error('latest failed');
    await settle(() => b.reject(failure));

    expect(result.current.error).toBe(failure);
    expect(result.current.loading).toBe(false);

    // The older request resolving later must not clear that error.
    await settle(() => a.resolve(product('p1', 'Older')));
    expect(result.current.error).toBe(failure);
    expect(nameOf(result.current)).toBeUndefined();
  });

  it('10. only the latest request turns loading off', async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    get.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result } = await mount();
    await startReload(result);
    expect(result.current.loading).toBe(true);

    // The superseded request settles first and must change nothing at all.
    await settle(() => a.resolve(product('p1', 'Older')));
    expect(result.current.loading).toBe(true);
    expect(result.current.product).toBeNull();

    await settle(() => b.resolve(product('p1', 'Newer')));
    expect(result.current.loading).toBe(false);
    expect(nameOf(result.current)).toBe('Newer');
  });
});

describe('useProductDetail — public API', () => {
  it('11. exposes exactly product, loading, error and reload', async () => {
    get.mockResolvedValueOnce(product('p1'));

    const { result } = await mount();

    expect(Object.keys(result.current).sort()).toEqual(['error', 'loading', 'product', 'reload']);
  });

  it('12. keeps reload identity stable so index.tsx\'s captured refetch stays valid', async () => {
    get.mockResolvedValueOnce(product('p1'));

    const { result } = await mount();
    const first = result.current.reload;

    await startReload(result);

    // `useRefetchOnFocus` captures the callback from its first render, so a
    // `reload` that changed identity would leave that refetch calling a stale
    // closure.
    expect(result.current.reload).toBe(first);
  });
});
