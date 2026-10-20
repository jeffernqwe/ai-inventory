/**
 * AUTH-06 — the in-app reset: six digits by email, then the new password, and no browser.
 *
 * WHY THIS SUITE EXISTS RATHER THAN AN EXTENSION OF THE N-3 ONE. The N-3 screens suite still
 * pins the REDEMPTION half — a `?oobCode=` or `?token=` link that is already in somebody's
 * inbox — and this file pins the journey that replaced the emailed link for everybody else.
 * Keeping them apart is what makes the removal legible: a reader comparing the two sees which
 * half went and which half stayed.
 *
 * WHAT EACH CASE PROTECTS.
 *
 *   • A missing address is a BROKEN ROUTE, not an account problem, and the only useful remedy is
 *     asking for a new code — so the screen says so and offers exactly that button.
 *   • A short code or a mismatched confirmation is refused CLIENT-SIDE, because the server
 *     spends one of five attempts on a code it cannot redeem, and a mistyped confirmation must
 *     not cost the person their code at all.
 *   • The code reaches the request body and nowhere else: not a route param, not a render, not
 *     a log. The only thing carried between screens is the ADDRESS the person typed.
 *   • A successful reset signs NOBODY in and sends them to Login, because the server has just
 *     ended every session — including any this phone held.
 *   • The cooldown belongs to the RESEND only. A person who has just asked for a second code
 *     must still be able to submit the one already in their inbox.
 *
 * Only module boundaries are mocked (`expo-router`, `lib/api`, `lib/theme-context` is real —
 * the real theme provider is used). The screen, `AuthLayout`, `Input`, `Button` and `Banner` are
 * the real components, so the copy asserted here is the copy the app shows.
 */

/// <reference types="node" />
// The drift guard at the bottom reads two files as text, which needs `node:fs`, `node:path`
// and `__dirname`; this directive opts THIS file into Node's types and nothing else.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ResetPasswordCodeScreen from '../app/reset-password-code';
import { confirmPasswordResetCode, requestPasswordResetCode } from '../lib/api';
import { useSession } from '../lib/auth';
import { ApiError } from '../lib/client';
import { ThemeProvider } from '../lib/theme-context';

const mockParams: Record<string, unknown> = {};
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock('../lib/api', () => ({
  requestPasswordResetCode: jest.fn(),
  confirmPasswordResetCode: jest.fn(),
}));

// The screen drops this device's session on success — see the `clearSession` cases below. Only
// the hook is mocked; the rest of the auth module is unreachable from this screen.
jest.mock('../lib/auth', () => ({ useSession: jest.fn() }));

const mockedUseSession = useSession as jest.Mock;
const mockClearSession = jest.fn(async () => {});

const mockedRequestCode = requestPasswordResetCode as jest.Mock;
const mockedConfirmCode = confirmPasswordResetCode as jest.Mock;

const EMAIL = 'reset-me@example.com';
const CODE_FIELD = '123456';
const PASSWORD_FIELD = 'At least 8 characters';
const CONFIRM_FIELD = 'Repeat your new password';
const SUBMIT = 'Set new password';
const RESEND = /Resend code/;

const RESET_COMPLETED = 'Password changed. Please sign in again.';
const CODE_SENT_MESSAGE = 'Password reset code sent. Check your inbox and spam folder.';

type View = Awaited<ReturnType<typeof render>>;

const mount = async (): Promise<View> =>
  render(
    <ThemeProvider>
      <ResetPasswordCodeScreen />
    </ThemeProvider>
  );

/** Types the code and both password fields, then submits. */
async function fillAndSubmit(
  view: View,
  {
    code = '123456',
    password = 'newpassword1',
    confirm = password,
  }: { code?: string; password?: string; confirm?: string } = {}
): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText(CODE_FIELD), code);
  if (password) await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), password);
  if (confirm) await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), confirm);
  await fireEvent.press(view.getByRole('button', { name: SUBMIT }));
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockParams.email = EMAIL;
  mockedUseSession.mockReturnValue({ clearSession: mockClearSession });
  mockedRequestCode.mockResolvedValue({});
  mockedConfirmCode.mockResolvedValue({});
});

describe('AUTH-06 — a route with no address asks for one instead of guessing', () => {
  it('★ shows the broken-route state and sends the person back to request a code', async () => {
    delete mockParams.email;

    const view = await mount();

    expect(
      view.getByText(
        'This screen is missing the email address it was opened for. Request a new code to continue.'
      )
    ).toBeTruthy();
    // No field is rendered at all: there is nothing this screen could do with a code alone,
    // because the server resolves the account from the CODE and needs the address to find the
    // challenge. Offering the form would invite an attempt that cannot succeed.
    expect(view.queryByPlaceholderText(CODE_FIELD)).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Request a code' }));
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
    expect(mockedConfirmCode).not.toHaveBeenCalled();
  });
});

describe('AUTH-06 — the code screen refuses what the server would only refuse later', () => {
  it('sends nothing while the code is short of six digits', async () => {
    const view = await mount();
    await fillAndSubmit(view, { code: '123' });

    expect(mockedConfirmCode).not.toHaveBeenCalled();
    expect(mockedRequestCode).not.toHaveBeenCalled();
    expect(view.queryByText(RESET_COMPLETED)).toBeNull();
  });

  it('keeps digits only, and only six of them', async () => {
    const view = await mount();

    // A paste is where a person is most likely to bring something else along, and the challenge
    // compares the code exactly — so the field normalises rather than letting the server spend an
    // attempt on a value the person did not intend.
    await fireEvent.changeText(view.getByPlaceholderText(CODE_FIELD), '12ab34 56');

    expect(view.getByPlaceholderText(CODE_FIELD).props.value).toBe('123456');
  });

  it('★ refuses a mismatched confirmation BEFORE the code is spent', async () => {
    const view = await mount();
    await fillAndSubmit(view, { password: 'newpassword1', confirm: 'differentpassword' });

    await waitFor(() => expect(view.getByText('Passwords do not match')).toBeTruthy());
    // The server also checks this before spending the code, and the client check exists so the
    // guaranteed-refused request is never made in the first place.
    expect(mockedConfirmCode).not.toHaveBeenCalled();
  });

  it('asks for a password rather than sending an empty one', async () => {
    const view = await mount();
    await fillAndSubmit(view, { password: '', confirm: '' });

    await waitFor(() => expect(view.getByText('New password is required')).toBeTruthy());
    expect(mockedConfirmCode).not.toHaveBeenCalled();
  });

  it('applies the shared password policy before the network', async () => {
    const view = await mount();
    await fillAndSubmit(view, { password: 'short', confirm: 'short' });

    await waitFor(() =>
      expect(view.getByText('Password must be at least 8 characters')).toBeTruthy()
    );
    expect(mockedConfirmCode).not.toHaveBeenCalled();
  });
});

describe('AUTH-06 — a correct code sets the password inside the app', () => {
  it('★ posts the code and the new password, then sends the person to sign in', async () => {
    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() =>
      expect(mockedConfirmCode).toHaveBeenCalledWith({
        email: EMAIL,
        code: '123456',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      })
    );

    await waitFor(() => expect(view.getByText(RESET_COMPLETED)).toBeTruthy());
    // NO SESSION IS APPLIED AND NO `(app)` ROUTE IS REACHED. The server ended every session as
    // part of the reset, so signing in again is both the truthful next step and the person's
    // proof that the new password works.
    await fireEvent.press(view.getByRole('button', { name: 'Go to sign in' }));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('★ drops THIS device’s session, so the login screen cannot bounce into the app', async () => {
    // The server revoked every session, including one this phone may have held. If the client kept
    // its stored token, *Go to sign in* would reach `/login`, which sees `signedIn` and redirects
    // back into `(app)` on a session the reset has already ended. `reset-password.tsx` clears for
    // the same reason; this pins that the code screen does too.
    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() => expect(view.getByText(RESET_COMPLETED)).toBeTruthy());
    expect(mockClearSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the code is refused — a failed reset changes nothing', async () => {
    mockedConfirmCode.mockRejectedValue(new ApiError(400, 'INVALID_PASSWORD_RESET_CODE', 'No.'));

    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() => expect(mockedConfirmCode).toHaveBeenCalledTimes(1));
    expect(mockClearSession).not.toHaveBeenCalled();
  });

  it('★ tells the platform what the code field holds, so autofill can offer the code', async () => {
    // A six-digit code cannot be typed from memory. The declaration is the whole reason Android
    // shows an autofill chip and iOS shows the code from Mail above the keyboard — without it,
    // both platforms offer nothing and the person has to leave the app and copy by hand.
    const view = await mount();
    const field = view.getByPlaceholderText(CODE_FIELD);

    expect(field.props.autoComplete).toBe('one-time-code');
    expect(field.props.textContentType).toBe('oneTimeCode');
  });

  it('★ never renders the code back, so it cannot be read off the screen or a log', async () => {
    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() => expect(view.getByText(RESET_COMPLETED)).toBeTruthy());
    // The success state is a fresh screen rather than the form with a badge on it; the code is
    // unreachable from here because the component that held it has rendered its last state.
    expect(view.queryByPlaceholderText(CODE_FIELD)).toBeNull();
  });
});

describe('AUTH-06 — the server’s refusal is shown where it belongs', () => {
  it('shows an unusable code above the form, and stays on the form', async () => {
    mockedConfirmCode.mockRejectedValue(
      new ApiError(
        400,
        'INVALID_PASSWORD_RESET_CODE',
        'That code is incorrect or has expired. Request a new one.'
      )
    );

    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() =>
      expect(
        view.getByText('That code is incorrect or has expired. Request a new one.')
      ).toBeTruthy()
    );
    expect(view.queryByText(RESET_COMPLETED)).toBeNull();
    expect(view.getByPlaceholderText(CODE_FIELD)).toBeTruthy();
  });

  it('puts a field problem on the input the server named', async () => {
    mockedConfirmCode.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', [
        { field: 'newPassword', message: 'Password must be at most 72 characters' },
      ])
    );

    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() =>
      expect(view.getByText('Password must be at most 72 characters')).toBeTruthy()
    );
    expect(view.queryByText(RESET_COMPLETED)).toBeNull();
  });
});

describe('AUTH-06 — resending is possible, bounded, and never blocks the submit', () => {
  it('★ requests a new code and starts the cooldown, and the submit still works', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(CODE_FIELD), '123456');
    await fireEvent.press(view.getByRole('button', { name: RESEND }));

    await waitFor(() => expect(mockedRequestCode).toHaveBeenCalledWith(EMAIL));
    await waitFor(() => expect(view.getByText(CODE_SENT_MESSAGE)).toBeTruthy());
    // The control now states the server's own window rather than a generic "try later".
    await waitFor(() =>
      expect(view.getByRole('button', { name: /Resend code in/ })).toBeTruthy()
    );

    // THE SUBMIT IS UNTOUCHED. This is the case a shared cooldown would break: a person who has
    // just asked for a second code would be unable to submit the first one.
    await fillAndSubmit(view);
    await waitFor(() => expect(mockedConfirmCode).toHaveBeenCalledTimes(1));
  });

  it('honours the server’s Retry-After rather than inventing a number', async () => {
    // THE 429 A CLIENT CAN ACTUALLY RECEIVE IS THE ROUTE LIMITER'S, not a resend cooldown: a
    // cooldown refusal would only be reachable for an address with an account, which is the
    // enumeration oracle the silent cooldown closes (design §6.1). The screen's handling is the
    // same either way, which is why it is still pinned here — the header is the server's number.
    const limited = new ApiError(
      429,
      'PASSWORD_RESET_RATE_LIMITED',
      'Too many password reset requests. Please wait and try again.'
    );
    limited.retryAfter = 42;
    mockedRequestCode.mockRejectedValue(limited);

    const view = await mount();
    await fireEvent.press(view.getByRole('button', { name: RESEND }));

    await waitFor(() =>
      expect(
        view.getByText('Too many password reset requests. Please wait and try again.')
      ).toBeTruthy()
    );
    // 42 seconds, from the header, not the screen's own 60.
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Resend code in 42s' })).toBeTruthy()
    );
  });
});

describe('AUTH-06 — the numbers on the screen are the server’s numbers', () => {
  const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');

  /** The literal assigned to `name` in a source file. */
  const literal = (source: string, name: string): number => {
    const match = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
    if (!match) throw new Error(`${name} not found`);
    return Number(match[1]);
  };

  it('★ matches the server’s code lifetime, cooldown and length', () => {
    // THE EXPECTATION A PERSON IS TOLD. An expired code is otherwise indistinguishable from a
    // wrong one, so the screen states the lifetime — and a number typed into a sentence is
    // exactly the kind that drifts. Both sides are read as source text, so a change to either
    // fails here instead of shipping a contradiction.
    const constants = read('../../server/src/constants/passwordResetCode.ts');
    const screen = read('../app/reset-password-code.tsx');

    expect(literal(screen, 'CODE_TTL_MINUTES')).toBe(
      literal(constants, 'PASSWORD_RESET_CODE_TTL_MINUTES')
    );
    expect(literal(screen, 'RESEND_COOLDOWN_SECONDS')).toBe(
      literal(constants, 'PASSWORD_RESET_CODE_RESEND_COOLDOWN_SECONDS')
    );
    expect(literal(screen, 'CODE_LENGTH')).toBe(literal(constants, 'PASSWORD_RESET_CODE_LENGTH'));
  });

  it('says out loud that a reset signs every device out', () => {
    // A consequence this large must not be discovered afterwards. The claim is checked as text
    // because it is a promise to the reader, not a behaviour.
    const screen = read('../app/reset-password-code.tsx');
    expect(screen).toMatch(/every device signed in to this account is/);
  });
});
