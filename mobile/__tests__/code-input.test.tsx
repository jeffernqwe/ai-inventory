import { useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CodeInput from '../components/CodeInput';
import { ThemeProvider } from '../lib/theme-context';

/**
 * The six-box code field's own contract.
 *
 * These cases exist because the behaviours the control is judged by are mostly invisible in a
 * screenshot: a pasted six-digit string must arrive as ONE value, a backspace must shorten it, and
 * the highlighted box must follow the value. All three are properties of the value contract (digits
 * only, capped, handed back whole), so they are asserted on what the caller receives and on what
 * each box holds, never on internal state.
 */

/** A controlled harness, so every keystroke round-trips through a parent exactly as a screen. */
function Harness({
  onChangeSpy,
  initial = '',
  ...rest
}: {
  onChangeSpy?: (value: string) => void;
  initial?: string;
  error?: string | null;
  helper?: string;
  editable?: boolean;
  label?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CodeInput
      value={value}
      onChangeText={(next) => {
        onChangeSpy?.(next);
        setValue(next);
      }}
      {...rest}
    />
  );
}

/**
 * Every screen renders inside the theme provider, so the control is exercised the same way here.
 * `render` is awaited because @testing-library/react-native v14 made it async.
 */
async function mount(node: ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

/** `render` resolves a view, so a helper's parameter is the awaited type. */
type View = Awaited<ReturnType<typeof render>>;

/** The digit a box is displaying, or `''` when it is empty. */
function boxDigit(view: View, index: number): string {
  // The boxes are marked decorative for screen readers, so the accessibility tree hides them and
  // the query has to opt back in to read what they draw.
  const box = view.getByTestId(`code-box-${index}`, { includeHiddenElements: true });
  const child = box.props.children;
  if (!child || typeof child !== 'object' || !('props' in child)) return '';
  return (child.props as { children?: string }).children ?? '';
}

describe('CodeInput', () => {
  it('renders exactly six boxes while empty', async () => {
    const view = await mount(<Harness />);
    for (let index = 0; index < 6; index += 1) {
      expect(
        view.getByTestId(`code-box-${index}`, { includeHiddenElements: true })
      ).toBeTruthy();
      expect(boxDigit(view, index)).toBe('');
    }
    expect(view.queryByTestId('code-box-6', { includeHiddenElements: true })).toBeNull();
  });

  it('shows the value one digit per box, in order', async () => {
    const view = await mount(<Harness initial="3729" />);
    expect(boxDigit(view, 0)).toBe('3');
    expect(boxDigit(view, 1)).toBe('7');
    expect(boxDigit(view, 2)).toBe('2');
    expect(boxDigit(view, 3)).toBe('9');
    expect(boxDigit(view, 4)).toBe('');
  });

  it('keeps the caret in the next empty box and moves it as digits arrive', async () => {
    const view = await mount(<Harness initial="12" />);
    await fireEvent(view.getByTestId('code-input'), 'focus');
    // Two digits entered, so the third box is the one waiting.
    expect(view.getByTestId('code-caret-2', { includeHiddenElements: true })).toBeTruthy();

    await fireEvent.changeText(view.getByTestId('code-input'), '123');

    expect(view.queryByTestId('code-caret-2', { includeHiddenElements: true })).toBeNull();
    expect(view.getByTestId('code-caret-3', { includeHiddenElements: true })).toBeTruthy();
  });

  it('accepts a whole pasted code in one change and fills every box', async () => {
    const onChange = jest.fn();
    const view = await mount(<Harness onChangeSpy={onChange} />);

    await fireEvent.changeText(view.getByTestId('code-input'), '481902');

    // ONE call carrying the whole value: this is what distinguishes a paste from six keystrokes.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('481902');
    expect(boxDigit(view, 0)).toBe('4');
    expect(boxDigit(view, 5)).toBe('2');
  });

  it('keeps only digits, so a code copied with spaces still fills every box', async () => {
    const onChange = jest.fn();
    const view = await mount(<Harness onChangeSpy={onChange} />);

    // A code copied out of a mail client often arrives with whitespace around it.
    await fireEvent.changeText(view.getByTestId('code-input'), ' 481 902 ');

    expect(onChange).toHaveBeenCalledWith('481902');
  });

  it('caps the value at six digits, so an extra keystroke changes nothing', async () => {
    const onChange = jest.fn();
    const view = await mount(<Harness onChangeSpy={onChange} initial="481902" />);

    await fireEvent.changeText(view.getByTestId('code-input'), '4819027');

    expect(onChange).toHaveBeenCalledWith('481902');
  });

  it('empties the last box when a backspace shortens the value', async () => {
    const onChange = jest.fn();
    const view = await mount(<Harness onChangeSpy={onChange} initial="481902" />);

    await fireEvent.changeText(view.getByTestId('code-input'), '48190');

    expect(onChange).toHaveBeenCalledWith('48190');
    expect(boxDigit(view, 4)).toBe('0');
    expect(boxDigit(view, 5)).toBe('');
  });

  it('clears completely when the value is deleted', async () => {
    const onChange = jest.fn();
    const view = await mount(<Harness onChangeSpy={onChange} initial="481902" />);

    await fireEvent.changeText(view.getByTestId('code-input'), '');

    expect(onChange).toHaveBeenCalledWith('');
    expect(boxDigit(view, 0)).toBe('');
  });

  it('shows the error message in place of the helper', async () => {
    const view = await mount(<Harness error="That code is invalid" helper="Six digits" />);
    expect(view.getByText('That code is invalid')).toBeTruthy();
    expect(view.queryByText('Six digits')).toBeNull();
  });

  it('renders the label above the boxes', async () => {
    const view = await mount(<Harness label="Reset code" />);
    expect(view.getByText(/Reset code/)).toBeTruthy();
  });

  it('declares itself as a one-time code to the platform, so autofill can offer it', async () => {
    const view = await mount(<Harness />);
    const field = view.getByTestId('code-input');
    expect(field.props.autoComplete).toBe('one-time-code');
    expect(field.props.textContentType).toBe('oneTimeCode');
    expect(field.props.keyboardType).toBe('number-pad');
  });

  it('reports one readable field instead of six decorative boxes', async () => {
    const view = await mount(<Harness label="Reset code" />);
    expect(view.getByTestId('code-input').props.accessibilityLabel).toBe('Reset code');
  });

  it('is not editable when the screen is busy', async () => {
    const view = await mount(<Harness editable={false} />);
    expect(view.getByTestId('code-input').props.editable).toBe(false);
  });
});
