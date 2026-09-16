import { act, renderHook } from '@testing-library/react-native';

import useRefetchOnFocus from '../hooks/useRefetchOnFocus';

/**
 * MOD-08 — ref-safety guard for `useRefetchOnFocus`.
 *
 * The hook refetches on focus, but only *after* the first one (the mount focus,
 * which already loaded) and only through the newest `reload` it was given.
 * `products/[id]` passes a fresh inline arrow on every render, so the focus
 * callback's dependency list must stay empty — otherwise the focus effect would
 * resubscribe on each render and refetch continuously. That is why the callback
 * lives in a ref, and why MOD-08 moves the ref write out of render rather than
 * adding `reload` to the dependency list.
 *
 * `expo-router` is mocked with the same shape React Navigation gives
 * `useFocusEffect`: run the callback immediately if the screen is already
 * focused, then keep it as a listener for later focus events, re-running only
 * when the callback identity changes.
 */

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  const focus = { focused: true, listeners: [] as (() => void)[], effectRuns: 0 };
  return {
    __focus: focus,
    useFocusEffect: (cb: () => void): void => {
      useEffect(() => {
        focus.effectRuns += 1;
        const run = (): void => {
          cb();
        };
        if (focus.focused) run();
        focus.listeners.push(run);
        return () => {
          focus.listeners = focus.listeners.filter((listener) => listener !== run);
        };
      }, [cb]);
    },
  };
});

type FocusState = { focused: boolean; listeners: (() => void)[]; effectRuns: number };

const focusState = (): FocusState => (jest.requireMock('expo-router') as { __focus: FocusState }).__focus;

/** Simulates the screen regaining focus after a pushed child is popped. */
const fireFocus = async (): Promise<void> => {
  await act(async () => {
    for (const listener of [...focusState().listeners]) listener();
  });
};

beforeEach(() => {
  const state = focusState();
  state.focused = true;
  state.listeners = [];
  state.effectRuns = 0;
});

describe('useRefetchOnFocus', () => {
  it('skips the mount focus so the initial load is not duplicated', async () => {
    const reload = jest.fn();
    await renderHook(() => useRefetchOnFocus(reload));

    expect(reload).not.toHaveBeenCalled();
  });

  it('refetches when the screen regains focus', async () => {
    const reload = jest.fn();
    await renderHook(() => useRefetchOnFocus(reload));

    await fireFocus();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refetches once per focus, never repeatedly', async () => {
    const reload = jest.fn();
    await renderHook(() => useRefetchOnFocus(reload));

    await fireFocus();
    await fireFocus();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('calls the newest reload, not the one captured at mount', async () => {
    const first = jest.fn();
    const second = jest.fn();

    const { rerender } = await renderHook(
      ({ reload }: { reload: () => void }) => useRefetchOnFocus(reload),
      { initialProps: { reload: first } }
    );

    await rerender({ reload: second });
    await fireFocus();

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('does not refetch or resubscribe on a plain re-render', async () => {
    const first = jest.fn();
    const second = jest.fn();

    const { rerender } = await renderHook(
      ({ reload }: { reload: () => void }) => useRefetchOnFocus(reload),
      { initialProps: { reload: first } }
    );
    // A fresh inline callback on every render, exactly as products/[id] does.
    await rerender({ reload: second });
    await rerender({ reload: jest.fn() });

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(focusState().effectRuns).toBe(1);
  });

  it('tolerates a missing reload callback', async () => {
    await renderHook(() => useRefetchOnFocus(null));

    await expect(fireFocus()).resolves.toBeUndefined();
  });
});
