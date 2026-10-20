// AUTH-04-E — the email-verification feature's SERVER HARDENING CLOSE-OUT.
//
// THIS SUITE IS THE CONSOLIDATED SUPERSET GUARD FOR THE WHOLE AUTH-04 A–D SURFACE.
// The per-letter suites each pin their own slice: `phaseAUTH04A-*` the primitives and
// the model, `phaseAUTH04B1/B2/B3/B4-*` the mail surface, the Admin bridge and the two
// challenge lifecycles, `phaseAUTH04B5-*` the B-layer DECLARATION guards, and
// `phaseAUTH04C-*` the C/D HTTP surface's own unit and DB cases.
//
// What none of them can see is the SET as it now stands. B5 shipped BEFORE the HTTP
// surface existed, so its declared cover set (17 modules) deliberately stops at the
// B-layer — its own header says "No HTTP surface exists in this feature yet". A later
// phase can therefore add, rename or drift a C/D module (the controller, the limiter
// middleware, the route table, the validators) and every existing guard stays green.
// This file closes exactly that: it declares the COMPLETE A–D surface, applies the
// B-layer hygiene invariants across the C/D modules too, and pins the C/D-specific
// hardening properties the letter-E definition names.
//
// B5 IS LEFT BYTE-IDENTICAL AND IS NOT WEAKENED. It stays registered and its own
// declaration set stays at 17, so it remains historically accurate to the increment in
// which it shipped. E is the superset layer, not a replacement — and one of the cases
// below asserts precisely that B5 still exists at 17 and is still registered.
//
// WHY SOURCE AND NOT BEHAVIOUR, FOR THESE PROPERTIES (same reasoning as B5). "No
// caught error detail is reflected" cannot be proven by any single call — it is a
// property of the ABSENCE of a reflection site. "The controller logs only safe fields"
// is a property of which identifiers a log record may carry, not of one run. "No
// session/JWT issuance on a pre-session route" is a property of the import graph.
// Reading the shipped text and asserting the SHAPE is the guard that fails on the
// INTRODUCTION of a defect, and it is deterministic: no database, no network, no order
// dependence. It belongs in PURE_UNIT and runs in every mode.
//
// COMMENTS ARE STRIPPED BEFORE EVERY ASSERTION. These modules document the forbidden
// thing they must not do — the controller's header explains the 400-not-401 divergence
// and names `req.user` and `sessionLostHandler`, `request.ts`/`confirm.ts` explain the
// session they do NOT create — so a guard searching raw text would fail on its own
// documentation. Checks that could be satisfied by a string literal strip literals too.

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { unitSuite } from './testEnv.mjs';
import { readSource, listSourceFiles } from './sourceFiles.mjs';
import { EMAIL_VERIFICATION_RATE_LIMITED } from '../src/constants/emailVerification.ts';

// ---------------------------------------------------------------------------
// The declared module set — the complete A–D surface, named in one place
// ---------------------------------------------------------------------------

/** Resolves a path relative to `server/src/`. */
const SRC = new URL('../src/', import.meta.url);
const src = (relative) => new URL(relative, SRC);

/**
 * The B-layer modules B5 already declares. Repeated here (rather than imported from the
 * test file) so THIS suite's cover set is explicit and cannot silently shrink if B5 is
 * ever edited: E asserts the union, B5 keeps asserting its own 17.
 */
const B_MODULES = [
  'services/emailVerification/code.ts',
  'services/emailVerification/errors.ts',
  'services/emailVerification/request.ts',
  'services/emailVerification/confirm.ts',
  'services/emailVerification/index.ts',
  'config/emailVerification.ts',
  'constants/emailVerification.ts',
  'models/emailVerificationChallenge.model.ts',
  'services/mail/templates/emailVerification.ts',
  'services/firebase/userUpdater.ts',
  'services/mail/index.ts',
  'services/mail/mailConfig.ts',
  'services/mail/mailErrors.ts',
  'services/mail/providers/index.ts',
  'services/mail/providers/brevoProvider.ts',
  'services/firebase/firebaseErrors.ts',
  'services/firebase/index.ts',
];

/**
 * The C/D modules AUTH-04 shipped after B5's declaration was frozen. These are the
 * modules no existing declaration guard covers, and the reason this letter exists.
 */
const CD_MODULES = [
  'controllers/emailVerification.controller.ts',
  'middlewares/rateLimit.ts',
  'routes/auth.routes.ts',
  'utils/validate.ts',
];

/** Every module the consolidated guard covers, deduplicated and in declaration order. */
const ALL_MODULES = [...new Set([...B_MODULES, ...CD_MODULES])];

const CONTROLLER = 'controllers/emailVerification.controller.ts';
const RATE_LIMIT = 'middlewares/rateLimit.ts';
const ROUTES = 'routes/auth.routes.ts';
const VALIDATE = 'utils/validate.ts';
const CODE_MODULE = 'services/emailVerification/code.ts';

/**
 * The modules that must carry NO session/JWT reference at all. Shared infrastructure
 * (`rateLimit.ts`, `auth.routes.ts`) is deliberately excluded — it legitimately serves
 * the session routes — and `utils/validate.ts` is checked over its AUTH-04 REGION only,
 * because the rest of that file validates the session/renewal payloads.
 */
const PRE_SESSION_MODULES = [
  'services/emailVerification/code.ts',
  'services/emailVerification/errors.ts',
  'services/emailVerification/request.ts',
  'services/emailVerification/confirm.ts',
  'services/emailVerification/index.ts',
  'config/emailVerification.ts',
  'constants/emailVerification.ts',
  'models/emailVerificationChallenge.model.ts',
  CONTROLLER,
];

/** Raw source text, by declaration path. Reading a missing path throws — by design. */
const SOURCE = new Map(ALL_MODULES.map((p) => [p, readSource(src(p))]));

/** Strips block comments and whole-line line comments, so prose cannot satisfy a guard. */
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** The comment-stripped code of a declared module. */
const CODE = new Map(ALL_MODULES.map((p) => [p, codeOnly(SOURCE.get(p))]));
const code = (p) => CODE.get(p);

/** Replaces every string literal with an empty one, so a word in copy cannot match. */
function withoutStrings(text) {
  return text
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

/**
 * The body of `function <name>(...)`, braces matched rather than guessed at, so a
 * factory's options can be inspected without pinning the whitespace around them.
 */
function braceSlice(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  return '';
}

function functionBody(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  if (start < 0) return '';
  // Skip the parameter list first: it can itself contain braces (`overrides = {}`),
  // and a naive `indexOf('{')` would return that default object instead of the body.
  const open = text.indexOf('(', start);
  if (open < 0) return '';
  let depth = 0;
  let close = -1;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) return '';
  const brace = text.indexOf('{', close);
  if (brace < 0) return '';
  return braceSlice(text, brace);
}

/** Every `logError({...})` record body in `text`, by brace matching (template
 * literals keep their braces balanced, so this is exact where a non-greedy regex is
 * not: `${err.reason}` contains a `}` that a lazy match would mistake for the end). */
function logRecords(text) {
  const records = [];
  let index = text.indexOf('logError({');
  while (index >= 0) {
    const brace = text.indexOf('{', index);
    const body = braceSlice(text, brace);
    if (!body) break;
    records.push(body);
    index = text.indexOf('logError({', brace + body.length);
  }
  return records;
}

/**
 * The `router.post(<path>, ...)` call for one route, parens matched, so the middleware
 * chain can be inspected as an ordered unit rather than by searching the whole file.
 */
function routeRegistration(text, routePath) {
  const at = text.indexOf(`'${routePath}'`);
  if (at < 0) return '';
  const start = text.lastIndexOf('router.post(', at);
  if (start < 0) return '';
  const open = text.indexOf('(', start);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return '';
}

/** The three log records the AUTH-04 controller may emit, by event name. */
const CONTROLLER_LOG_TYPES = new Set([
  'firebase_not_configured',
  'firebase_unavailable',
  'firebase_token_rejected',
]);

const REQUEST_ROUTE = '/email-verification/request';
const CONFIRM_ROUTE = '/email-verification/confirm';

// ---------------------------------------------------------------------------

unitSuite('AUTH-04-E — server hardening close-out (consolidated guards)', () => {
  // -------------------------------------------------------------------------
  // Coverage — the declaration is complete, and B5 is preserved
  // -------------------------------------------------------------------------

  it('★ declares the COMPLETE A–D surface, including the four C/D modules', () => {
    for (const p of ALL_MODULES) {
      assert.ok(SOURCE.get(p).length > 0, `${p} must exist and be non-empty`);
    }
    for (const p of CD_MODULES) {
      assert.ok(ALL_MODULES.includes(p), `${p} must be covered by the consolidated guard`);
    }
    // The B-layer cover set must still be exactly the emailVerification directory, so
    // a new module in that directory is a deliberate declaration, not a silent gap.
    const dir = fileURLToPath(new URL('services/emailVerification/', SRC));
    const onDisk = listSourceFiles(dir).slice().sort();
    const declared = B_MODULES.filter((p) => p.startsWith('services/emailVerification/'))
      .map((p) => p.split('/').pop())
      .sort();
    assert.deepEqual(declared, onDisk, 'a new emailVerification module must be declared here');
    // 17 B-layer modules + the 4 C/D modules.
    assert.equal(ALL_MODULES.length, 21, 'the consolidated cover set changed size');
  });

  it('★ leaves the B5 declaration suite intact at 17, and registers E — do not weaken B5', () => {
    const b5 = readSource(new URL('./phaseAUTH04B5-email-verification-hardening.test.mjs', import.meta.url));
    assert.match(b5, /ALL_MODULES\.length,\s*17/, 'B5 must keep its own 17-module declaration');
    const runner = readSource(new URL('../scripts/run-tests.mjs', import.meta.url));
    assert.match(
      runner,
      /phaseAUTH04B5-email-verification-hardening\.test\.mjs/,
      'B5 must remain registered'
    );
    assert.match(
      runner,
      /phaseAUTH04E-email-verification-hardening\.test\.mjs/,
      'E must be registered'
    );
  });

  // -------------------------------------------------------------------------
  // Controller — fixed envelopes, nothing reflected
  // -------------------------------------------------------------------------

  it('★ the controller answers with exactly the two approved fixed success envelopes', () => {
    const c = code(CONTROLLER);
    // Exactly two response bodies exist, both literal `{ message: <CONST> }` objects.
    const bodies = c.match(/res\.status\(200\)\.json\(\s*\{\s*message:\s*[A-Z_]+[^}]*\}\s*\)/g) ?? [];
    assert.equal(bodies.length, 2, 'the controller must answer exactly two success envelopes');
    assert.equal((c.match(/\.json\(/g) ?? []).length, 2, 'no third response body may exist');
    assert.equal((c.match(/res\.status\(/g) ?? []).length, 2, 'no other status is written directly');

    // The two approved literals, pinned by value.
    assert.match(
      c,
      /REQUEST_ACCEPTED_MESSAGE\s*=\s*'If that address needs verification, a verification code has been sent\.'/
    );
    assert.match(c, /VERIFIED_MESSAGE\s*=\s*'Email verified\.'/);
  });

  it('★ the controller maps every failure to a fixed status, and reflects nothing', () => {
    const c = code(CONTROLLER);
    // The mapper's approved status arithmetic: 503 clear, 429 rate-limited, 400 refused.
    assert.equal((c.match(/new ApiError\(503,/g) ?? []).length, 4, 'four 503 answers');
    assert.equal((c.match(/new ApiError\(429,/g) ?? []).length, 1, 'one 429 answer');
    assert.equal((c.match(/new ApiError\(400,/g) ?? []).length, 2, 'two 400 answers');
    // The only statuses the mapper may produce.
    const statuses = new Set((c.match(/new ApiError\((\d{3}),/g) ?? []).map((m) => m.match(/\d{3}/)[0]));
    assert.deepEqual([...statuses].sort(), ['400', '429', '503']);

    // No caught/provider detail reaches a response: no response call receives `err`,
    // and no error's `.message` is ever read.
    // No response BODY call may receive a thrown error. `res.set(..., String(err.retryAfterSeconds))`
    // is the one approved exception (a numeric header), pinned separately below.
    assert.ok(!/res\.(status|json|send|end|write)\s*\([^)]*\berr\b/.test(c), 'no response body call may receive a thrown error');
    assert.ok(!/\.message\b/.test(c), 'no upstream message may be read');
    assert.ok(!/\.json\(\s*err\b/.test(c), 'no error object may be serialized as a body');

    // Each handler's catch forwards through the mapper, and only through it.
    assert.equal(
      (c.match(/throw mapEmailVerificationFailure\(err\)/g) ?? []).length,
      2,
      'both handlers must forward through the mapper'
    );
  });

  it('★ every controller log record carries only the approved safe fields', () => {
    const c = code(CONTROLLER);
    const records = logRecords(c);
    assert.equal(records.length, 3, 'the controller emits exactly three log records');

    const banned = /\b(uid|email|token|idToken|code|pepper|codeHmac|emailHmac|businessId)\b/;
    const seenTypes = [];
    for (const record of records) {
      const identifiers = withoutStrings(record);
      const match = banned.exec(identifiers);
      assert.equal(match, null, `a controller log record must not carry ${match && match[0]}`);
      // The event name is an allowlisted literal, never interpolated.
      const type = record.match(/type:\s*'([^']+)'/);
      assert.ok(type, 'every controller log record names its type literally');
      seenTypes.push(type[1]);
      // A `reason`, when present, is the SDK-classified allowlisted value and nothing else.
      if (/reason:/.test(record)) {
        assert.match(record, /reason:\s*err\.reason\b/, 'a reason is only the classified err.reason');
      } else {
        assert.ok(
          !/reason:/.test(record.replace(/\/\/.*/g, '')),
          'a record without a reason must not invent one'
        );
      }
      // A message is a fixed template whose ONLY interpolation is err.reason.
      assert.ok(!/`\$\{err(?!\.reason)/.test(record), 'only err.reason may be interpolated');
    }
    assert.deepEqual(
      [...new Set(seenTypes)].sort(),
      [...CONTROLLER_LOG_TYPES].sort(),
      'only the three approved controller events may be emitted'
    );
  });

  it('★ applyRetryAfter is the one cooldown Retry-After site, reading only the approved field', () => {
    const body = functionBody(code(CONTROLLER), 'applyRetryAfter');
    assert.ok(body, 'applyRetryAfter must exist');
    assert.match(body, /res\.set\('Retry-After',\s*String\(err\.retryAfterSeconds\)\)/);
    assert.match(body, /err instanceof EmailVerificationError/);
    assert.match(body, /typeof err\.retryAfterSeconds === 'number'/);

    // The ONLY `String(err…)` in the controller is that numeric conversion — nothing
    // stringifies a thrown error wholesale.
    const stringified = code(CONTROLLER).match(/String\(err[^)]*\)/g) ?? [];
    assert.deepEqual(stringified, ['String(err.retryAfterSeconds)']);

    // It is applied on the cooldown path only — the request handler — and never the
    // confirm handler, whose failures are all code refusals or mapper statuses.
    assert.equal(
      (code(CONTROLLER).match(/applyRetryAfter\(/g) ?? []).length,
      2,
      'exactly one definition and one call site'
    );
    assert.match(functionBody(code(CONTROLLER), 'emailVerificationRequest'), /applyRetryAfter\(res, err\)/);
    assert.ok(
      !/applyRetryAfter/.test(functionBody(code(CONTROLLER), 'emailVerificationConfirm')),
      'the confirm handler must not set Retry-After'
    );
  });

  it('★ the global error handler introduces no AUTH-04 Retry-After', () => {
    const eh = codeOnly(readSource(src('middlewares/errorHandler.ts')));
    assert.ok(!/Retry-After/i.test(eh), 'errorHandler must not know about Retry-After');
    assert.ok(
      !/EMAIL_VERIFICATION|email-verification|emailVerification/.test(eh),
      'errorHandler must not special-case AUTH-04'
    );
  });

  // -------------------------------------------------------------------------
  // Rate limiting and route wiring
  // -------------------------------------------------------------------------

  it('★ exactly two approved per-IP AUTH-04 limiter factories remain', () => {
    const rl = code(RATE_LIMIT);
    const names = ['createEmailVerificationRequestLimiter', 'createEmailVerificationConfirmLimiter'];
    assert.equal(
      (rl.match(/export function createEmailVerification\w+Limiter/g) ?? []).length,
      2,
      'exactly two AUTH-04 factories'
    );
    for (const name of names) {
      const body = functionBody(rl, name);
      assert.ok(body, `${name} must exist`);
      assert.match(body, /ipKeyGenerator\(clientIp\(request\)\)/, `${name} must key on the client address`);
      assert.ok(!/skipSuccessfulRequests/.test(body), `${name} must not skip successes`);
      assert.match(body, /EMAIL_VERIFICATION_RATE_LIMITED/, `${name} must answer the shared code`);
    }
    // The code is IMPORTED, not typed a second time as a literal.
    assert.ok(!/['"]EMAIL_VERIFICATION_RATE_LIMITED['"]/.test(rl), 'the code must not be re-declared');
    // The four documented environment names, and the shared defaults.
    for (const env of [
      'AUTH_EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_WINDOW_MS',
      'AUTH_EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_MAX',
      'AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_WINDOW_MS',
      'AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_MAX',
    ]) {
      assert.ok(rl.includes(env), `${env} must be read`);
    }
    assert.match(rl, /emailVerificationRequestWindowMs:[\s\S]*?15\s*\*\s*60\s*\*\s*1000/);
    assert.match(rl, /emailVerificationConfirmWindowMs:[\s\S]*?15\s*\*\s*60\s*\*\s*1000/);
  });

  it('★ both routes mount limiter → controller, and neither acquires requireAuth', () => {
    const r = code(ROUTES);
    const request = routeRegistration(r, REQUEST_ROUTE);
    const confirm = routeRegistration(r, CONFIRM_ROUTE);
    assert.ok(request && confirm, 'both email-verification routes must be registered');

    for (const [route, registration, limiter, handler] of [
      [REQUEST_ROUTE, request, 'createEmailVerificationRequestLimiter', 'emailVerificationRequest'],
      [CONFIRM_ROUTE, confirm, 'createEmailVerificationConfirmLimiter', 'emailVerificationConfirm'],
    ]) {
      assert.ok(!/requireAuth/.test(registration), `${route} must stay pre-session (no requireAuth)`);
      assert.ok(registration.includes(`${limiter}(limits)`), `${route} must mount its limiter`);
      assert.ok(registration.includes(handler), `${route} must mount its handler`);
      assert.ok(
        registration.indexOf(`${limiter}(limits)`) < registration.indexOf(handler),
        `${route} must mount limiter BEFORE controller`
      );
    }
  });

  it('★ phase23 still declares both routes as PUBLIC exemptions, with written reasons', () => {
    const p23 = codeOnly(readSource(new URL('./phase23-authorization-contract.test.mjs', import.meta.url)));
    for (const path of ['email-verification/request', 'email-verification/confirm']) {
      assert.ok(p23.includes(path), `${path} must be declared in phase23's PUBLIC bucket`);
    }
    assert.match(p23, /PRE-SESSION|pre-session/i, 'the public exemption must carry its written reason');
  });

  // -------------------------------------------------------------------------
  // No session / JWT issuance on the pre-session endpoints
  // -------------------------------------------------------------------------

  it('★ the pre-session AUTH-04 modules contain no session or JWT issuance path', () => {
    const forbidden = /\bjwt\b|jsonwebtoken|issueSession|createSession|models\/session|session\.service/i;
    for (const p of PRE_SESSION_MODULES) {
      assert.ok(!forbidden.test(code(p)), `${p} must reference no session/JWT machinery`);
    }
    // The controller and the two lifecycles never read an authenticated principal.
    for (const p of [CONTROLLER, 'services/emailVerification/request.ts', 'services/emailVerification/confirm.ts']) {
      assert.ok(!/req\.user/.test(code(p)), `${p} must not read req.user`);
    }
    // The AUTH-04 region of the shared validator is equally free of it.
    const raw = SOURCE.get(VALIDATE);
    const start = raw.indexOf('AUTH-04 — the email-verification code flow');
    const end = raw.indexOf('User management (Phase 14A)');
    assert.ok(start >= 0 && end > start, 'the AUTH-04 validator region must be locatable');
    const region = codeOnly(raw.slice(start, end));
    assert.ok(!forbidden.test(region), 'the AUTH-04 validator region must reference no session/JWT');
  });

  // -------------------------------------------------------------------------
  // Validators — transport bounds only, never a code-shape rule
  // -------------------------------------------------------------------------

  it('★ the AUTH-04 validators are transport bounds and never inspect the code shape', () => {
    const raw = SOURCE.get(VALIDATE);
    const start = raw.indexOf('AUTH-04 — the email-verification code flow');
    const end = raw.indexOf('User management (Phase 14A)');
    const region = codeOnly(raw.slice(start, end));

    assert.match(region, /const EMAIL_VERIFICATION_CODE_MAX = 64;/);
    assert.match(region, /export function validateEmailVerificationRequest\b/);
    assert.match(region, /export function validateEmailVerificationConfirm\b/);
    assert.match(region, /requiredString\(body\?\.code, 'code', EMAIL_VERIFICATION_CODE_MAX\)/);
    // The 6-digit policy lives in the service; the validator must NOT use the length
    // as a bound, nor read a plaintext code field from anywhere.
    assert.ok(!/EMAIL_VERIFICATION_CODE_LENGTH/.test(region), 'the code length must not be a bound');
    assert.ok(!/email:\s*\{/.test(region), 'the validator stores no address');
    // No hygiene regressions inside the region either.
    assert.ok(!/console\.|createHash|Math\.random|timingSafeEqual/.test(region));
  });

  // -------------------------------------------------------------------------
  // Hygiene across the whole A–D surface (the B-layer invariants, extended)
  // -------------------------------------------------------------------------

  it('★ the whole A–D surface keeps the B-layer hygiene invariants', () => {
    for (const p of ALL_MODULES) {
      const text = code(p);
      assert.ok(!/Math\.random/.test(text), `${p} must not use Math.random`);
      assert.ok(!/createHash/.test(text), `${p} must not use an unkeyed digest`);
      assert.ok(!/console\./.test(text), `${p} must not use the console directly`);
      assert.ok(!/models\/user/.test(text), `${p} must not import the User model`);
      assert.ok(!/findOne\(\s*\{\s*email\b/.test(text), `${p} must not look an identity up by address`);
      // No raw thrown error is stringified wholesale or interpolated bare; the two
      // approved forms (`err.reason`, `err.retryAfterSeconds`) are excluded below.
      assert.ok(!/`\$\{err(?!\.reason)/.test(text), `${p} must not interpolate a bare thrown error`);
      if (p !== CODE_MODULE) {
        assert.ok(!/timingSafeEqual/.test(text), `${p} must not compare raw bytes itself`);
        assert.ok(!/createHmac/.test(text), `${p} must reuse the HMAC primitive, not re-implement it`);
      }
    }
    // The one numeric conversion the controller is allowed.
    for (const p of ALL_MODULES) {
      if (p === CONTROLLER) continue;
      assert.ok(!/String\(err/.test(code(p)), `${p} must not stringify a thrown error`);
    }
  });

  it('★ no plaintext code, address or pepper is declared as a stored field anywhere', () => {
    // The model is B5's concern; E re-pins it over the C/D surface so a controller or
    // route cannot introduce a field that stores any of them.
    for (const p of CD_MODULES) {
      const text = code(p);
      assert.ok(!/\bcode:\s*\{/.test(text), `${p} must declare no plaintext code field`);
      assert.ok(!/\bpepper:\s*\{/.test(text), `${p} must declare no pepper field`);
      assert.ok(!/emailHmac:\s*\{/.test(text), `${p} must not persist a digest shape`);
    }
  });

  it('★ the shared rate-limit code is one source of truth', () => {
    assert.equal(EMAIL_VERIFICATION_RATE_LIMITED, 'EMAIL_VERIFICATION_RATE_LIMITED');
  });

  // -------------------------------------------------------------------------
  // `.env.example` — the five AUTH-04 names, and the corrected status clause
  // -------------------------------------------------------------------------

  it('★ .env.example keeps the five AUTH-04 names and the corrected status clause', () => {
    const env = readSource(new URL('../.env.example', import.meta.url));
    for (const name of [
      'EMAIL_VERIFICATION_CODE_PEPPER',
      'AUTH_EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_WINDOW_MS',
      'AUTH_EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_MAX',
      'AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_WINDOW_MS',
      'AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_MAX',
    ]) {
      assert.ok(env.includes(name), `${name} must remain documented`);
    }
    assert.ok(
      !/only their HTTP routes \(AUTH-04-C\) remain/.test(env),
      'the stale "only the HTTP routes remain" clause must be corrected'
    );
    assert.match(env, /AUTH-04-A\.\.D|AUTH-04 A\.\.D|AUTH-04-A…D/, 'the clause must state the shipped range');
  });
});
