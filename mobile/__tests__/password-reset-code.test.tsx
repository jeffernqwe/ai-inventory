/**
 * AUTH-06 (two-step recovery) — STEP ONE: verifying the emailed reset code.
 *
 * WHY THIS SUITE EXISTS RATHER THAN AN EXTENSION OF THE N-3 ONE. The N-3 screens suite pins the
 * REDEMPTION half — a `?oobCode=` or `?token=` link that is already in somebody's inbox — and this
 * file pins the journey that replaced the emailed link for everybody else.
 *
 * WHAT EACH CASE PROTECTS.
 *
 *   • A missing address is a BROKEN ROUTE, not an account problem, and the only useful remedy is
 *     asking for a new code — so the screen says so and offers exactly that button.
 *   • A short code is refused CLIENT-SIDE, because the server spends one of five attempts on a
 *     code it cannot redeem. The password is not asked for here at all: this screen has one job.
 *   • The code reaches the request body and nowhere else: not a route param, not a render, not a
 *     log. What crosses to the next screen is the server's short-lived authorization, kept in
 *     memory — never in the navigation route.
 *   • A verified code navigates to the password step and does NOT change the password, sign anyone
 *     in, or touch this device's session.
 *   • The cooldown belongs to the RESEND only. A person who has just asked for a second code must
 *     still be able to submit the one already in their inbox.
 *
 * Only module boundaries are mocked (`expo-router`, `lib/api`); the real theme provider, screen,
 * `AuthLayout`, `Input`, `Button` and `Banner` are used, so the copy asserted here is the copy the
 * app shows. `lib/passwordResetSession` is REAL — the hand-off is what this suite is checking.
 */

/// <reference types="node" />
// The drift guard at the bottom reads two files as text, which needs `node:fs`, `node:path`
// and `__dirname`; this directive opts THIS file into Node's types and nothing else.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ResetPasswordCodeScreen from '../app/reset-password-code';
import { requestPasswordResetCode, verifyPasswordResetCode } from '../lib/api';
import { ApiError } from '../lib/client';
import { clearVerifiedReset, readVerifiedReset } from '../lib/passwordResetSession';
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
  verifyPasswordResetCode: jest.fn(),
}));

const mockedRequestCode = requestPasswordResetCode as jest.Mock;
const mockedVerifyCode = verifyPasswordResetCode as jest.Mock;

const EMAIL = 'reset-me@example.com';
const SUBMIT = 'Verify code';
const RESEND = /Resend code/;
const RESET_TOKEN = 'authorization-value-abcdefghijklmnopqrstuvwxyz';
const CODE_SENT_MESSAGE = 'Password reset code sent. Check your inbox and spam folder.';

type View = Awaited<ReturnType<typeof render>>;

const mount = async (): Promise<View> =>
  render(
    <ThemeProvider>
      <ResetPasswordCodeScreen />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  clearVerifiedReset();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockParams.email = EMAIL;
  mockedRequestCode.mockResolvedValue({});
  mockedVerifyCode.mockResolvedValue({
    message: 'Code verified. Choose a new password.',
    resetToken: RESET_TOKEN,
    expiresInSeconds: 900,
  });
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
    expect(view.queryByTestId('code-input')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Request a code' }));
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
    expect(mockedVerifyCode).not.toHaveBeenCalled();
  });
});

describe('AUTH-06 — the verification screen asks for the code and nothing else', () => {
  it('★ has no password fields at all', async () => {
    // THE SPLIT ITSELF. Asking for a new password next to the code is the flow this phase
    // replaced; the assertion is a regression guard on the whole point of the change.
    const view = await mount();

    expect(view.getByTestId('code-input')).toBeTruthy();
    expect(view.queryByPlaceholderText('At least 8 characters')).toBeNull();
    expect(view.queryByPlaceholderText('Repeat your new password')).toBeNull();
    expect(view.queryByText('Set new password')).toBeNull();
  });

  it('sends nothing while the code is short of six digits', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByTestId('code-input'), '123');
    await fireEvent.press(view.getByRole('button', { name: SUBMIT }));

    expect(mockedVerifyCode).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps digits only, and only six of them', async () => {
    const view = await mount();

    // A paste is where a person is most likely to bring something else along, and the challenge
    // compares the code exactly — so the field normalises rather than letting the server spend an
    // attempt on a value the person did not intend.
    await fireEvent.changeText(view.getByTestId('code-input'), '12ab34 56');

    expect(view.getByTestId('code-input').props.value).toBe('123456');
  });

  it('★ tells the platform what the code field holds, so autofill can offer the code', async () => {
    // A six-digit code cannot be typed from memory. The declaration is the whole reason Android
    // shows an autofill chip and iOS shows the code from Mail above the keyboard.
    const view = await mount();
    const field = view.getByTestId('code-input');

    expect(field.props.autoComplete).toBe('one-time-code');
    expect(field.props.textContentType).toBe('oneTimeCode');
  });
});

describe('AUTH-06 — a correct code hands over to the password step', () => {
  it('★ posts the code, stores the authorization in memory, and replaces the route', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByTestId('code-input'), '123456');
    await fireEvent.press(view.getByRole('button', { name: SUBMIT }));

    await waitFor(() =>
      expect(mockedVerifyCode).toHaveBeenCalledWith({ email: EMAIL, code: '123456' })
    );

    // THE HAND-OFF, and it is memory-only: the next screen needs a credential, and putting it in a
    // route param would serialise a bearer token into the navigation route.
    await waitFor(() => {
      const verified = readVerifiedReset();
      expect(verified?.resetToken).toBe(RESET_TOKEN);
      expect(verified?.email).toBe(EMAIL);
    });
    expect(mockReplace).toHaveBeenCalledWith('/reset-password-new');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('★ stands on its own numbers: the server’s lifetime is what the client records', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByTestId('code-input'), '123456');
    await fireEvent.press(view.getByRole('button', { name: SUBMIT }));

    await waitFor(() => expect(readVerifiedReset()).not.toBeNull());
    const verified = readVerifiedReset();
    const remainingSeconds = Math.round((verified!.expiresAt - Date.now()) / 1000);
    // 900 seconds from the server, not a client constant that happens to be close.
    expect(remainingSeconds).toBeGreaterThan(890);
    expect(remainingSeconds).toBeLessThanOrEqual(900);
  });

  it('never renders the code back, so it cannot be read off the screen or a log', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByTestId('code-input'), '123456');
    await fireEvent.press(view.getByRole('button', { name: SUBMIT }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(view.getByTestId('code-input').props.value).toBe('123456');
    // The value is held only by the input the person is looking at; it is never echoed in a
    // banner, a helper or a success message.
    expect(view.queryByText(/123456/)).toBeNull();
  });
});

describe('AUTH-06 — the server’s refusal is shown where it belongs', () => {
  it('shows an unusable code above the form, and stays on the form', async () => {
    mockedVerifyCode.mockRejectedValue(
      new ApiError(
        400,
        'INVALID_PASSWORD_RESET_CODE',
        'That password reset code is invalid or has expired. Please request a new one.'
      )
    );

    const view = await mount();
    await fireEvent.changeText(view.getByTestId('code-input'), '123456');
    await fireEvent.press(view.getByRole('button', { name: SUBMIT }));

    await waitFor(() =>
      expect(
        view.getByText(
          'That password reset code is invalid or has expired. Please request a new one.'
        )
      ).toBeTruthy()
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(readVerifiedReset()).toBeNull();
    expect(view.getByTestId('code-input')).toBeTruthy();
  });

  it('puts a field problem on the input the server named', async () => {
    mockedVerifyCode.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', [
        { field: 'code', message: 'code must be the 6-digit code from your email' },
      ])
    );

    const view = await mount();
    await fireEvent.changeText(view.getByTestId('code-input'), '123456');
    await fireEvent.press(view.getByRole('button', { name: SUBMIT }));

    await waitFor(() =>
      expect(view.getByText('code must be the 6-digit code from your email')).toBeTruthy()
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('AUTH-06 — resending is possible, bounded, and never blocks the submit', () => {
  it('★ requests a new code and starts the cooldown, and the submit still works', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByTestId('code-input'), '123456');
    await fireEvent.press(view.getByRole('button', { name: RESEND }));

    await waitFor(() => expect(mockedRequestCode).toHaveBeenCalledWith(EMAIL));
    await waitFor(() => expect(view.getByText(CODE_SENT_MESSAGE)).toBeTruthy());
    // The control now states the server's own window rather than a generic "try later".
    await waitFor(() =>
      expect(view.getByRole('button', { name: /Resend code in/ })).toBeTruthy()
    );

    // THE SUBMIT IS UNTOUCHED. This is the case a shared cooldown would break: a person who has
    // just asked for a second code would be unable to submit the first one.
    await fireEvent.press(view.getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(mockedVerifyCode).toHaveBeenCalledTimes(1));
  });

  it('honours the server’s Retry-After rather than inventing a number', async () => {
    // THE 429 A CLIENT CAN ACTUALLY RECEIVE IS THE ROUTE LIMITER'S, not a resend cooldown: a
    // cooldown refusal would only be reachable for an address with an account, which is the
    // enumeration oracle the silent cooldown closes (design §6.1).
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

  it('says out loud that checking the code changes nothing yet', () => {
    // The promise that makes the split honest: verifying is not resetting, so a person who stops
    // here has not altered their account.
    const screen = read('../app/reset-password-code.tsx');
    expect(screen).toMatch(/does not\s+change anything on your account yet/);
  });
});
