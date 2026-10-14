/**
 * The client's email rule is pinned to the server's, and there is only one copy.
 *
 * WHY THIS FILE EXISTS. `forgot-password.tsx` carried a recorded decision *not* to
 * validate the address's shape on the client, with a good reason: "the email-shape
 * rule lives in the server's validator and is deliberately not duplicated here,
 * where the two copies would drift apart." The risk was real; the conclusion drawn
 * from it was not the only option. A rule that exists in exactly ONE client place —
 * `lib/validation.ts` — cannot drift against itself, and the remaining risk, that
 * the single client copy drifts away from the server's, is what this suite removes
 * by making it a test failure instead of a silent divergence.
 *
 * The server's rule is READ OUT OF THE SERVER'S OWN SOURCE rather than restated
 * here. A test that wrote the pattern out again would be a third copy of it, and
 * would keep passing after the server changed.
 *
 * TWO PROPERTIES ARE PINNED:
 *
 *   1. AGREEMENT. For every address, the client refuses a shape the server refuses,
 *      and never refuses one the server accepts. That second direction is the one
 *      that matters: a client rule stricter than the server's would invent a refusal
 *      the backend never asked for, which is a bug the user cannot work around.
 *   2. SINGULARITY. No other file under `app/` or `lib/` carries an email-shaped
 *      regular expression. This is the "one place" claim made checkable — the reason
 *      the old comment's fear no longer applies.
 */

import fs from 'fs';
import path from 'path';

import {
  EMAIL_INVALID,
  EMAIL_REQUIRED,
  PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_SHORT,
  emailProblem,
  passwordStrengthProblem,
} from '../lib/validation';

const SERVER_VALIDATE = path.join(__dirname, '..', '..', 'server', 'src', 'utils', 'validate.ts');

/** The server's source, so the rule under test is the server's rather than a copy. */
const serverSource = fs.readFileSync(SERVER_VALIDATE, 'utf8');

const serverPatternMatch = serverSource.match(/const EMAIL_RE = \/(.+)\/;/);
const serverMaxMatch = serverSource.match(/const MAX_EMAIL = (\d+);/);
const serverMinMatch = serverSource.match(/const PASSWORD_MIN = (\d+);/);
const serverPasswordMaxMatch = serverSource.match(/const PASSWORD_MAX = (\d+);/);

const SERVER_RE = new RegExp(serverPatternMatch?.[1] ?? '');
const SERVER_MAX = Number.parseInt(serverMaxMatch?.[1] ?? '0', 10);

/** Whether the SERVER would accept this address (presence assumed to be satisfied). */
const serverAccepts = (address: string): boolean => {
  const value = address.trim();
  return value.length <= SERVER_MAX && SERVER_RE.test(value);
};

/** Whether the CLIENT refuses this address for its shape. */
const clientRejects = (address: string): boolean => emailProblem(address) === EMAIL_INVALID;

/**
 * A spread of addresses that distinguishes a shape rule from a presence rule and
 * from a laxer one: real addresses, the ways they are mistyped, and the edges that
 * a naive `includes('@')` would wave through.
 */
const ADDRESSES = [
  'owner@example.com',
  'owner.name+tag@sub.example.co.uk',
  'o@e.io',
  'owner@company',
  'owner@',
  '@company.com',
  'owner company@x.com',
  'a@@b.com',
  'owner@example..com',
  'owner@example.c',
  'owner@example.toolongtld',
  'OWNER@EXAMPLE.COM',
  'owner@exa_mple.com',
  'owner@[127.0.0.1]',
];

describe('the rule this suite depends on is actually being read', () => {
  /**
   * A guard that cannot fail is decoration. If the server renames or reformats its
   * rule, the extraction above would find nothing, `SERVER_RE` would become the empty
   * pattern (which matches everything) and every agreement assertion below would pass
   * for the wrong reason. These assertions make that impossible.
   */
  it('★ found the server’s pattern and its length bound', () => {
    expect(serverPatternMatch).not.toBeNull();
    expect(serverMaxMatch).not.toBeNull();
    expect(SERVER_MAX).toBeGreaterThan(0);
  });

  it('★ and the extracted pattern behaves like the server’s rule', () => {
    expect(SERVER_RE.test('a@b.c')).toBe(true);
    expect(SERVER_RE.test('a@b')).toBe(false);
  });
});

describe('the client agrees with the server', () => {
  it('★ refuses exactly the shapes the server refuses', () => {
    for (const address of ADDRESSES) {
      expect({ address, rejected: clientRejects(address) }).toEqual({
        address,
        rejected: !serverAccepts(address),
      });
    }
  });

  it('★ and never refuses an address the server would accept', () => {
    // Stated separately from the equality above because THIS is the direction that
    // would produce an unfixable complaint: a person typing a valid address and being
    // told it is invalid, with no way forward.
    for (const address of ADDRESSES) {
      if (serverAccepts(address)) expect(clientRejects(address)).toBe(false);
    }
  });
});

describe('presence and shape are different questions', () => {
  it.each(['', '   ', '\t'])('★ reports %j as required rather than malformed', (value) => {
    expect(emailProblem(value)).toBe(EMAIL_REQUIRED);
    expect(emailProblem(value)).not.toBe(EMAIL_INVALID);
  });

  it('accepts a valid address, including one padded with spaces', () => {
    expect(emailProblem('owner@example.com')).toBeNull();
    expect(emailProblem('  owner@example.com  ')).toBeNull();
  });
});

describe('the password length rule is the server’s too', () => {
  /**
   * Registration was the last screen that CHOSE a password without checking its length,
   * so a 5-character password travelled to the server and came back under the input in a
   * developer's words. The rule is now shared by the three screens that choose one, and
   * the numbers are read out of the server's source rather than restated.
   */
  it('★ the bounds are the server’s own', () => {
    expect(serverMinMatch).not.toBeNull();
    expect(serverPasswordMaxMatch).not.toBeNull();

    expect(PASSWORD_MIN).toBe(Number.parseInt(serverMinMatch?.[1] ?? '0', 10));
    expect(PASSWORD_MAX).toBe(Number.parseInt(serverPasswordMaxMatch?.[1] ?? '0', 10));
  });

  it('★ and the boundaries behave the way the server’s do', () => {
    // Both edges, inclusive on each side, so an off-by-one in either direction fails.
    expect(passwordStrengthProblem('a'.repeat(PASSWORD_MIN))).toBeNull();
    expect(passwordStrengthProblem('a'.repeat(PASSWORD_MIN - 1))).toBe(PASSWORD_TOO_SHORT);
    expect(passwordStrengthProblem('a'.repeat(PASSWORD_MAX))).toBeNull();
    expect(passwordStrengthProblem('a'.repeat(PASSWORD_MAX + 1))).toBe(PASSWORD_TOO_LONG);
  });
});

describe('the client rule exists in exactly one place', () => {
  /**
   * The claim `lib/validation.ts` makes about itself, made checkable. A second
   * email-shaped pattern anywhere under `app/` or `lib/` is how the two copies the
   * old comment warned about would come back.
   */
  const SOURCE_DIRS = ['app', 'lib'];
  const ALLOWED = new Set([path.join('lib', 'validation.ts')]);

  const sourceFiles = (dir: string): string[] => {
    const full = path.join(__dirname, '..', dir);
    const out: string[] = [];
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(rel));
      else if (/\.tsx?$/.test(entry.name)) out.push(rel);
    }
    return out;
  };

  it('★ finds no email-shaped pattern outside lib/validation.ts', () => {
    // A deliberately narrow signature: the character class the server's own rule opens
    // with. Prose, `@` in a comment and a plain `includes('@')` do not match it, so a
    // hit here is a real duplicated shape rule rather than a coincidence.
    const offenders = SOURCE_DIRS.flatMap(sourceFiles)
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => /\[[^\]]*\\s@\][^\]]*@/.test(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('and the scan is capable of finding one', () => {
    // The positive control: the pattern must recognise the file it is supposed to
    // allow, or the assertion above is a scan that could never report anything.
    const own = fs.readFileSync(path.join(__dirname, '..', 'lib', 'validation.ts'), 'utf8');
    expect(/\[[^\]]*\\s@\][^\]]*@/.test(own)).toBe(true);
  });
});
