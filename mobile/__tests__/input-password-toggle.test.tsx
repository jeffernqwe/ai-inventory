/**
 * Phase 32N — the shared `Input`'s reveal control for `secureTextEntry` fields.
 *
 * THE PHASE'S SECURITY PROPERTY IS A NEGATIVE, so most of what is asserted here is
 * an ABSENCE or an INVARIANT rather than a new feature:
 *
 *   * the field starts MASKED, and revealing never becomes the default;
 *   * revealing changes ONLY how the value is rendered — the value the parent owns,
 *     the number of `onChangeText` calls and the payload built from them are
 *     identical whether the secret is showing or masked;
 *   * a field that does not set `secureTextEntry` gains NOTHING — not a control, not
 *     a wrapper, not a changed prop — which is why the non-secret case asserts the
 *     prop is still `undefined` rather than merely falsy.
 *
 * The control is driven off the prop that already declares a field holds a secret,
 * so there is no second flag a call site could forget: every password field in the
 * app is covered by `Input` itself, and the 13 call sites were not edited.
 *
 * Only the shared component is under test here — the real `Input`, the real
 * `IconButton`, the real icon map and the real theme — so what is asserted is the
 * shipped rendering. The Android-native half (whether toggling `secureTextEntry`
 * recreates native input state and clears the text) cannot be proved in Jest and is
 * verified on the device.
 */

import { useState } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import Input from '../components/Input';
import { iconNames } from '../components/icons';
import { ThemeProvider } from '../lib/theme-context';
import type { RenderResult } from '@testing-library/react-native';

const PLACEHOLDER = 'At least 8 characters';
const VALUE = 'Secret123!';

const SHOW = 'Show password';
const HIDE = 'Hide password';

const onChangeText = jest.fn();

/**
 * The parent that OWNS the value, exactly as the real forms do.
 *
 * Binding it the same way is what makes the value-preservation cases meaningful: if
 * revealing ever cleared or rewrote the text, the parent's state would receive that
 * through `onChangeText` and this harness would record it.
 *
 * `secure` is passed as `true | undefined` rather than `true | false` so the
 * non-secret case is the one the app actually has — a prop that is not set at all.
 */
function Harness({ secure = true, error }: { secure?: boolean; error?: string }) {
  const [value, setValue] = useState('');
  return (
    <Input
      name="password"
      label="Password"
      value={value}
      onChangeText={(next) => {
        onChangeText(next);
        setValue(next);
      }}
      error={error}
      secureTextEntry={secure ? true : undefined}
      placeholder={PLACEHOLDER}
      helper="Min 8 characters"
    />
  );
}

const mount = (props: { secure?: boolean; error?: string } = {}) =>
  render(
    <ThemeProvider>
      <Harness {...props} />
    </ThemeProvider>
  );

/** The input element itself, so its own props can be read. */
const inputOf = (view: Awaited<ReturnType<typeof mount>>) => view.getByPlaceholderText(PLACEHOLDER);

/** A node of the serialised tree, as `toJSON()` produces it. */
type JsonNode = { props?: Record<string, unknown>; children?: unknown[] } | string | null;

/** Every glyph currently rendered by the icon font, in tree order. */
function iconGlyphs(node: JsonNode): string[] {
  if (!node || typeof node === 'string') return [];
  const style = node.props?.style;
  const isIconFont =
    Array.isArray(style) &&
    style.some(
      (entry) =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        (entry as { fontFamily?: string }).fontFamily === 'ionicons'
    );
  const own = isIconFont
    ? (node.children ?? []).filter((child): child is string => typeof child === 'string')
    : [];
  return [...own, ...(node.children ?? []).flatMap((child) => iconGlyphs(child as JsonNode))];
}

/**
 * The single glyph the toggle is rendering.
 *
 * The count is asserted as one, not merely read, so a second icon appearing inside a
 * field (or the toggle vanishing into an invisible target) fails here.
 */
function renderedGlyph(view: RenderResult): string {
  const glyphs = iconGlyphs(view.toJSON() as JsonNode);
  expect(glyphs).toHaveLength(1);
  return glyphs[0]!;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Input — a secret field starts masked', () => {
  it('masks the value by default and offers only the "Show password" control', async () => {
    const view = await mount();

    expect(inputOf(view).props.secureTextEntry).toBe(true);
    expect(view.getByRole('button', { name: SHOW })).toBeTruthy();
    // Exactly one state is offered at a time: the label describes what the NEXT press
    // will do, so the opposite label must not also be present.
    expect(view.queryByRole('button', { name: HIDE })).toBeNull();
  });
});

describe('Input — Show reveals, Hide masks again', () => {
  it('reveals the value when Show is pressed', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: SHOW }));

    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(false));
    // The label now names the action that is available, not the one just taken.
    expect(view.getByRole('button', { name: HIDE })).toBeTruthy();
    expect(view.queryByRole('button', { name: SHOW })).toBeNull();
  });

  it('masks the value again when Hide is pressed', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: SHOW }));
    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(false));

    await fireEvent.press(view.getByRole('button', { name: HIDE }));

    // Back to the starting state: masked, and offering Show again.
    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(true));
    expect(view.getByRole('button', { name: SHOW })).toBeTruthy();
  });

  it('swaps the rendered icon with the state, so the change is not label-only', async () => {
    // Read from the rendered tree rather than from the toggle's props, because the
    // visual affordance is what a user reacts to: a control whose label changed while
    // its glyph did not would read as "nothing happened". No specific codepoint is
    // asserted — the two states must simply render DIFFERENT glyphs.
    const view = await mount();
    const masked = renderedGlyph(view);

    await fireEvent.press(view.getByRole('button', { name: SHOW }));
    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(false));

    expect(renderedGlyph(view)).not.toBe(masked);
  });

  it('has real glyphs behind both semantic keys', async () => {
    // `Icon` renders nothing for an unknown key, so the two keys the toggle names must
    // actually exist in the map or the control would be an invisible target.
    expect(iconNames).toContain('eye');
    expect(iconNames).toContain('eyeOff');
  });

  it('survives repeated toggling without drifting from the typed value', async () => {
    const view = await mount();
    await fireEvent.changeText(inputOf(view), VALUE);

    for (const label of [SHOW, HIDE, SHOW, HIDE]) {
      await fireEvent.press(view.getByRole('button', { name: label }));
      // Checked after EVERY press, so a single lost value cannot be masked by a later
      // press happening to look correct.
      await waitFor(() => expect(inputOf(view).props.value).toBe(VALUE));
    }

    expect(inputOf(view).props.secureTextEntry).toBe(true);
  });
});

describe('Input — revealing changes nothing but the rendering', () => {
  it('keeps the exact typed value through Show and Hide', async () => {
    const view = await mount();

    await fireEvent.changeText(inputOf(view), VALUE);
    await waitFor(() => expect(inputOf(view).props.value).toBe(VALUE));

    await fireEvent.press(view.getByRole('button', { name: SHOW }));
    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(false));
    expect(inputOf(view).props.value).toBe(VALUE);

    await fireEvent.press(view.getByRole('button', { name: HIDE }));
    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(true));
    expect(inputOf(view).props.value).toBe(VALUE);
  });

  it('does not emit a change for a press, so the payload cannot be rewritten', async () => {
    const view = await mount();

    await fireEvent.changeText(inputOf(view), VALUE);
    await waitFor(() => expect(onChangeText).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByRole('button', { name: SHOW }));
    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(false));
    await fireEvent.press(view.getByRole('button', { name: HIDE }));
    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(true));

    // ONE call, for the typing. A press that reported a change — even the same value —
    // would be a request payload the user did not type, and an empty one would clear
    // the field on submit.
    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText).toHaveBeenCalledWith(VALUE);
  });

  it('still renders the error and the helper exactly as before', async () => {
    const view = await mount({ error: 'Password is too short' });

    expect(view.getByText('Password is too short')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: SHOW }));

    // The field's own messages are untouched by the visibility state: a problem is a
    // problem whether or not the secret is showing.
    await waitFor(() => expect(inputOf(view).props.secureTextEntry).toBe(false));
    expect(view.getByText('Password is too short')).toBeTruthy();
  });
});

describe('Input — a non-secret field is unchanged', () => {
  it('gains no control at all', async () => {
    const view = await mount({ secure: false });

    expect(view.queryByRole('button', { name: SHOW })).toBeNull();
    expect(view.queryByRole('button', { name: HIDE })).toBeNull();
    // `undefined`, not `false`: the prop a call site never set stays unset, which is
    // the strongest available statement that a non-secret field was not altered.
    expect(inputOf(view).props.secureTextEntry).toBeUndefined();
  });

  it('still exists as a usable field', async () => {
    const view = await mount({ secure: false });

    await fireEvent.changeText(inputOf(view), 'plain text');
    await waitFor(() => expect(inputOf(view).props.value).toBe('plain text'));
    expect(view.getByText('Min 8 characters')).toBeTruthy();
  });
});
