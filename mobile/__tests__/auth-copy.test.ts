/**
 * The two helpers every auth screen used to define for itself now have one home.
 *
 * WHY THIS FILE EXISTS. `fieldMap` and `formatRemaining` had been pasted into every screen
 * that needed them — nine auth screens carried an identical copy of the first, three of the
 * second. Copies like that do not fail loudly; they drift one sentence or one rounding rule
 * at a time, and the person sees a different explanation of the same refusal depending on
 * which screen they were on.
 *
 * TWO PROPERTIES ARE PINNED:
 *
 *   1. BEHAVIOUR. The wait formatter rounds as the screens' clocks expect (a live second is
 *      never reported as a minute early, and 60 seconds is the first "1m"), and a server
 *      `fields` array becomes the field-keyed map an `Input` reads — or an empty object, so
 *      a response without field detail never renders an empty red line.
 *   2. SINGULARITY. No auth screen defines its own copy again. The scan reads the screens as
 *      source text, which is the only way to notice a duplicate that behaves identically
 *      today; the positive control proves the pattern can see the module it is supposed to.
 */

import fs from 'fs';
import path from 'path';

import { fieldErrorsFrom, formatRemaining } from '../lib/authCopy';
import { ApiError } from '../lib/client';

const AUTH_SCREENS = [
  'app/login.tsx',
  'app/register.tsx',
  'app/register-firebase.tsx',
  'app/forgot-password.tsx',
  'app/reset-password.tsx',
  'app/reset-password-code.tsx',
  'app/reset-password-new.tsx',
  'app/verify-email.tsx',
  'app/(app)/change-password.tsx',
];

const readScreen = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('formatRemaining', () => {
  it('states a short wait in seconds, and rounds a minute where a minute starts', () => {
    expect(formatRemaining(0)).toBe('0s');
    expect(formatRemaining(42)).toBe('42s');
    expect(formatRemaining(59)).toBe('59s');
    expect(formatRemaining(60)).toBe('1m');
    expect(formatRemaining(90)).toBe('1m 30s');
    expect(formatRemaining(600)).toBe('10m');
  });
});

describe('fieldErrorsFrom', () => {
  it('★ maps a server fields array onto the keys an Input reads', () => {
    const err = new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', [
      { field: 'email', message: 'email must be a valid email address' },
      { field: 'password', message: 'password must be at least 8 characters' },
    ]);

    expect(fieldErrorsFrom(err)).toEqual({
      email: 'email must be a valid email address',
      password: 'password must be at least 8 characters',
    });
  });

  it('answers an empty map for anything that is not a field-bearing 400', () => {
    expect(fieldErrorsFrom(new Error('network down'))).toEqual({});
    expect(fieldErrorsFrom(null)).toEqual({});
    expect(
      fieldErrorsFrom(new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.'))
    ).toEqual({});
  });
});

describe('the auth screens share it instead of carrying their own copy', () => {
  it('★ no auth screen defines fieldMap or formatRemaining', () => {
    const offenders = AUTH_SCREENS.filter((rel) =>
      /^function (fieldMap|formatRemaining)\(/m.test(readScreen(rel))
    ).map((rel) => `${rel}: a local copy`);

    expect(offenders).toEqual([]);
  });

  it('each one imports what it uses from lib/authCopy', () => {
    const missing = AUTH_SCREENS.filter((rel) => {
      const source = readScreen(rel);
      if (!source.includes('fieldErrorsFrom(')) return false;
      return !source.includes("from '../lib/authCopy'") && !source.includes("from '../../lib/authCopy'");
    });

    expect(missing).toEqual([]);
  });

  it('and the pattern can see a definition it should report (control)', () => {
    // The positive control: the same regex, against text that definitely has one.
    expect(/^function (fieldMap|formatRemaining)\(/m.test('function fieldMap(err: unknown) {')).toBe(
      true
    );
  });
});
