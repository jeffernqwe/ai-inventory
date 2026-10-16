// Phase 07F (M9) — test runner. Sets TEST_MODE and runs the node:test suite for
// exactly the file set that mode owns, so every mode is deterministic and no
// suite is silently dropped.
//
//   full  (npm test)            — every test file. DB-required suites fail loudly
//                                 if MongoDB is unreachable (never a false green).
//   unit  (npm run test:unit)   — DB-independent files + mixed files; DB-required
//                                 suites inside mixed files are skipped with a
//                                 visible reason (testEnv.mjs). No MongoDB needed.
//   db    (npm run test:db)     — DB-required files + mixed files; DB-independent
//                                 suites inside mixed files are skipped with a
//                                 visible reason. MongoDB required.
//
// The classification below is authoritative for what each mode runs; it mirrors
// the Phase 07F suite-classification report and the server test docs.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, '..');
const testDir = path.join(serverRoot, 'test');

const VALID = ['full', 'unit', 'db'];
const mode = String(process.argv[2] || 'full').trim().toLowerCase();
if (!VALID.includes(mode)) {
  console.error(`[run-tests] Unknown mode "${process.argv[2] || ''}" — expected one of ${VALID.join(', ')}.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Phase 07F suite classification (by actual DB/unit content, not filenames).
// ---------------------------------------------------------------------------
const PURE_UNIT = [
  'phase03-rbac.test.mjs',            // middleware/constants unit tests
  'phase06-ai-wire.test.mjs',         // OpenRouter wire mapping: payload, header and error-sanitization contract, plus the upstream diagnostics
  'phase07d-production-config.test.mjs', // env validation, health, shutdown
  'phaseN1-database-separation.test.mjs', // MongoDB environment separation: dev/test/prod database-name resolution, the fail-closed test rule, the cross-environment refusals
  'phase20f-ai-conversation-index.test.mjs', // schema-declaration guard for the ai_conversations list index (M-5)
  'phase20g-list-sort-indexes.test.mjs', // schema-declaration guards for the products/purchase_orders/users list-sort indexes
  'phase21-product-archive-invariant.test.mjs', // declaration guards for the archive-only product lifecycle + inventory↔product dependency
  'phase22-authorization-contract.test.mjs', // route↔permission bindings, catalogue coverage, CATALOGUE_ONLY declaration
  'phase23-authorization-contract.test.mjs', // route authorization classification, mobile RBAC mirror, requireRole inertness, client error-code contract
  'phase-docs-route-inventory.test.mjs', // §27AX: the design authority's §2.6 route inventory (total + the four tiers) is measured from the route declarations and the app-level registrations, so a documented figure cannot drift again; includes an in-memory negative control on the pre-fix figures
  'phase26b-mail-service.test.mjs',   // mail provider registry, Resend wire format via a stubbed fetch, template and error contract
  'phase-brevo-provider.test.mjs',    // Brevo provider: registry entry, Brevo wire format (api-key header, structured sender parse, htmlContent/textContent) via a stubbed fetch, messageId mapping, error hygiene incl. the discarded free-text message, timeout, and the AUTH-04 verification-code delivery path with no code/recipient leakage
  'phaseAUTH04B1-email-verification-mail.test.mjs', // AUTH-04-B1: the verification-code template (exact digits incl. leading zeros, no URL/address/id/crypto, no password, refuses an unusable code without echoing it) and sendEmailVerificationEmail (awaited delivery, registry transport, MAIL_NOT_CONFIGURED for an unusable configuration with no EMAIL_VERIFICATION_* emission, MAIL_UNAVAILABLE for a provider failure, no console output, no secret on an error) plus the mail-layer source guards
  'phaseAUTH04B2-firebase-email-verification-write.test.mjs', // AUTH-04-B2: the Admin updateUser write bridge and its seam (uid guarded before the credential build, one hardcoded { emailVerified: true } payload with no properties parameter, the return narrowed to { uid, emailVerified } with no SDK field leakage, the locked code table pinned per category incl. missing/non-string/thrown-non-Error -> unavailable, the shared O-2 helper, no upstream message or uid on an error, no console output, the real unconfigured path failing before the app is built) plus the module source guards
  'phaseAUTH04B5-email-verification-hardening.test.mjs', // AUTH-04-B5: the DB-free umbrella declaration guards over the full AUTH-04 module set (every emailVerification module declared, no logging outside the two lifecycle modules, no plaintext code/email/pepper in the model, CSPRNG + keyed domain-separated HMAC + timing-safe compare, the pepper read only in request/confirm, no email/User-model account resolution, no transaction/lock/upsert/index, B3 `usedAt: null` supersession, B4 never unsetting usedAt and its literal AD-12 consume predicate, the four allowlisted events and the closed reason sets, no upstream .message read/stringified/interpolated, exactly two legacy gates, and B3's O-3 ApiError(400) pinned as intentional)
  'phaseAUTH04E-email-verification-hardening.test.mjs', // AUTH-04-E: the consolidated DB-free hardening guards over the complete AUTH-04 A-D surface — the four C/D modules declared alongside the B-layer set, the two fixed success envelopes and the fixed error-status set, no reflected caught/provider detail, safe-only controller log records, applyRetryAfter as the one cooldown Retry-After site, no AUTH-04 Retry-After in errorHandler, exactly two per-IP limiter factories, limiter->controller route wiring with no requireAuth, the phase23 PUBLIC declarations, no session/JWT path on the pre-session modules, transport-bound validators, the extended B-layer hygiene invariants, and the five .env.example names with the corrected status clause
  'phase-issue-record-integrity.test.mjs', // the issue-record guard: every `ISS-NN` cited anywhere in the project's own text has a row in the roadmap's known-issue table — written after ISS-26 was found cited in five files with no record at all, and proved to fail on exactly that gap (the row removed, the prose kept)
  'phase-docs-section-integrity.test.mjs', // the section-numbering guard: no plan record claims a 27… number twice, and every citation to one resolves to a declared record — written after two records claimed 27CB on two branches (found by hand at the merge, costing a renumbering across three documents) and a citation was found pointing at a 27A section that has never existed; it scans this file too, which is why the identifiers in this comment carry no sigil
  'phaseA-credential-authority.test.mjs', // Phase A (F-1) declaration guards: the unlink capability is gone, no reachable path clears firebaseUid, an identity is never resolved by email
  'phase-ts-3-migration-guards.test.mjs', // module-graph guards: duplicate .js/.ts stems + stale relative specifiers, resolved against the filesystem
  'DEP-1-deployment-readiness.test.mjs', // DEP-1: the deployment's own account of itself — the one-line integration report, the LEGAL-BUT-UNUSABLE warnings (email verification enabled with no mail is the one that hid in production on 2026-10-15), the commit/uptime build identity and its narrow health surface, no secret reaching any of it, and the boot wiring proving a warning is never a refusal
  'phase-ai-usage-report.test.mjs', // `npm run ai:usage` — the read-only usage report: turns/outcomes/requests/empty/tokens/provider-share computed from AI-5's `[ai] turn` lines, the requests-per-turn ratio a request-counting allowance needs, an AI-2 degraded warning not counted as a second turn, a truncated turn line counted AND reported malformed, absent fields contributing nothing rather than a zero, a missing log exiting 2 ("nothing was measured") instead of reporting zero turns, stdin support, the provider `/v1/key` mapping with its masked label dropped and omitted counters left null, and a planted key-shaped string that must not reach stdout or stderr (with the run itself asserted first, so the leak control cannot pass by crashing)
  'phase-cleanup-test-utilities.test.mjs', // development/test cleanup utilities: fail-closed guards (production env, wrong/mismatched database, unknown/production Firebase project, confirmation phrase), the successful clear/verify path, and the "no destructive call on a failed guard" property — all against fake ports, no real database
];
const PURE_DB = [
  'phase03-auth.test.mjs',            // auth + RBAC over real routes + Mongo
  'phase04-catalog.test.mjs',         // categories/locations/products CRUD
  'phase04-inventory.test.mjs',       // stock in/out/adjust + dashboard
  'phase06-ai-behavior.test.mjs',     // AI chat over real routes (fake provider)
  'phase06-ai-tools.test.mjs',        // read-only AI tools against real data
  'phase06-ai-security.test.mjs',     // session/business isolation on AI routes
  'phase07a-inventory-compensation.test.mjs', // failure-injection hardening
  'phase07b-auth-security.test.mjs',  // business status + auth rate limiting
  'phase19-transfers.test.mjs',       // stock transfers between locations + compensation
  'phase-index-integrity.test.mjs',   // index integrity: every DECLARED index exists in the DATABASE with the declared field ORDER (which is what makes a compound key usable for the query it was added for), plus unique/sparse/TTL agreement, the AI-3 inventory page-sort key named explicitly, the three TTL keys, and the mechanism guards that automatic index building is not disabled anywhere
  'phase20-pagination-order.test.mjs', // offset-pagination ordering determinism across the nine list paths
  'phase20-pagination-contract.test.mjs', // offset-pagination coercion contract (page/limit defaults, cap, empty past-end page)
  'phase20-filter-contract.test.mjs', // list filter contract (invalid status/supplierId/blank q rejected, valid filters still narrow)
  'phase24-runtime-authorization-matrix.test.mjs', // runtime role x real-route matrix + role-change effect on an existing JWT
  'phase26a-session-lifecycle.test.mjs', // server-side sessions: mandatory jti, revocation, per-device logout, sign out everywhere
  'phase32e-firebase-legacy-guard.test.mjs', // the legacy password guard: a Firebase-linked account is refused on /api/auth/login, in the approved order, with no session and no lockout
  'phase32k-firebase-password-boundary.test.mjs', // the Firebase password boundary (change-password + forgot/reset refused for a Firebase-owned account, silently on the recovery path) and the timing equalizer that must never be a credential
  'SCALE-dashboard-counts.test.mjs',   // SCALE: the dashboard's health counts stay exact on a dataset built to hit every branch at once, and stay computed INSIDE MongoDB — the aggregation that returns one document is pinned present and the document-moving reads (a whole-catalogue find, a per-product inventory aggregate) are pinned absent, with an in-memory positive control, because both shapes return identical numbers and no functional test can tell them apart
  'AI7-conversation-activity.test.mjs', // AI-7: the conversation list is ordered by real ACTIVITY — a persisted turn advances the conversation's updatedAt (and the list follows it), createdAt never moves, a brand-new conversation's two timestamps agree, and a failed turn cannot advance it because a failed turn writes nothing
  'AI2-ai-readonly-tools.test.mjs',   // AI-2: the read-only invariant made provable — every tool's permission pinned to the four read capabilities (and those four asserted not write-shaped), the table's own source scanned for a service call outside a read-only allow-list with an in-test positive control that mutates the source twice, every tool refusing a smuggled businessId/Mongo operator/role argument, the nine write-tool names a model invents answering TOOL_NOT_FOUND, AI_TOOL_DEFS pinned to the table, and a role that lacks a tool's permission refused before it runs
];
const MIXED = [
  'phase-openrouter-provider.test.mjs', // unit: provider selection + Anthropic wire mapping + DB-free loop compatibility; db: the real 9-tool workload over MongoDB
  'phase06-ai-provider.test.mjs',     // unit: provider selection; db: loop + mapping
  'phase07c-http-security.test.mjs',  // unit: headers/body-limit/CORS; db: auth cases + M4
  'phase07d-db-reliability.test.mjs', // unit: error mapping; db: readiness + DB-down
  'phase07e-ai-reliability.test.mjs', // unit: message shape; db: M6/M7 routes
  'phase08a-request-logging.test.mjs', // unit: request-id + log shape; db: authed context
  'phase10-commercialization.test.mjs', // unit: plan catalog + decision core; db: plan state
  'phase11-intelligence.test.mjs', // unit: stock-status classifier; db: reorder list + dashboard health + AI restock tool
  'phase12a-barcode.test.mjs', // db: barcode lookup endpoint (success, isolation, duplicate, archived, RBAC)
  'phase12d-barcode-generation.test.mjs', // db: POST /:id/generate-barcode (generate, no-overwrite, lookup, isolation, archived, RBAC)
  'phase13-suppliers.test.mjs', // db: suppliers CRUD over /api/suppliers (extra contact fields, RBAC, isolation, archive)
  'phase13-purchase-orders.test.mjs', // db: PO create/list/get/DRAFT-edit/issue/cancel (numbering, lifecycle, RBAC, isolation, no stock writes)
  'phase13-receiving.test.mjs', // db: PO receiving into the ledger (partial/full, auto-RECEIVED, over-receive 409, concurrency, full precise undo, RBAC/isolation)
  'phase14-users.test.mjs', // db: user management over /api/users (create/list/role+status, RBAC, OWNER/ADMIN/self protections, dup email, disabled, isolation, audit)
  'phase15-account-security.test.mjs', // db: change-password + PATCH /me (session invalidation via passwordChangedAt vs JWT iat, strict /me whitelist)
  'phase16-audit-viewer.test.mjs', // db: read-only audit trail over GET /api/audit (RBAC, isolation, filters, pagination, actor population, DTO hygiene)
  'phase16-firebase-email-verification.test.mjs', // unit: the gate lives at registration only (one occurrence, ordered after verification and before the first write) and requireAuth/auth.service carry none; db: POST /api/auth/firebase/register refuses an unverified/absent/non-boolean claim with 400 VALIDATION_ERROR on idToken and writes nothing, verified identities still register, existing emailVerified:false users still exchange and still sign in locally
  'phase26b-password-recovery.test.mjs', // unit: token generation/hashing/reset URL + password-policy drift guard; db: token store + recovery service over real MongoDB
  'phase26b-password-recovery-http.test.mjs', // unit: recovery validators + limiter 429 shape/keying; db: forgot/reset over the real app incl. the mail-failure enumeration guard
  'phase32b-firebase-admin.test.mjs', // unit: Firebase config parsing, error leak boundary, ID-token narrowing via the seam, admin-app lifecycle, production-config integration; db: User firebaseUid/emailVerified schema + the sparse unique index against real MongoDB
  'phase32c-firebase-exchange.test.mjs', // unit: exchange/registration validators + limiter keying and the absent skipSuccessfulRequests; db: POST /api/auth/firebase/exchange + /register over the real app (session shape, JWT sub/jti, REGISTRATION_REQUIRED, ACCOUNT_DISABLED, inactive business, body-identity injection ignored, registration + orphan retry)
  'phase32h-firebase-linking.test.mjs', // unit: the link payload returns only {problems, idToken} and a planted identity/tenant/role is inert; db: POST /api/auth/firebase/link over the real app (CASE A-D, conflict indistinguishability, email is not a join key, unauthenticated 401, 400-not-401 on a bad Firebase token, 503 unconfigured, 32E guard intact, race outcomes)
  'phaseN4-credentials-changed.test.mjs', // unit: the credentials-changed payload returns only {problems, idToken} and a planted account/identity/tenant/role/session is inert; db: POST /api/auth/credentials-changed over the real app (the stamp, total session revocation incl. the caller's own, a post-stamp session still authenticating, uid mismatch/legacy account, stale + missing auth_time, iat is not freshness, only passwordChangedAt moves, SESSIONS_REVOKED_ALL audit, planted-body inertness, unauthenticated 401, DISABLED/business 403, 503 unconfigured, route registration)
  'phaseAUTH01-firebase-verification.test.mjs', // AUTH-01: checkRevoked source guard + no revokeRefreshTokens, malformed-token structural guard, aud/iss environment assertion, the terminal/transient/not-configured classifier (incl. argument-error as transient), FIREBASE_UNAVAILABLE -> 503 not rewritten to 400 on authenticated routes, installed firebase-admin version coupling
  'phaseAUTH02-session-jwt.test.mjs', // AUTH-02: unit: 1h lifetime + exact claim set, issuer/audience enforcement (wrong/missing/legacy), expiry-vs-JsonWebTokenError ordering, the expiry-ignoring re-verification, source guards; db: SESSION_EXPIRED / SESSION_REVOKED / INVALID_TOKEN classification over real HTTP, ACCOUNT_DISABLED / BUSINESS_NOT_ACTIVE unchanged, and the 14-day session cap independent of JWT exp
  'phaseAUTH04A-email-verification-code.test.mjs', // AUTH-04-A: unit: the code generation/digest primitives (AD-2 pinned from literals, domain separation, timing-safe compare, CSPRNG source guards), the pepper config boundary incl. the Firebase-gated production fail-fast and the additive no-Firebase case, and the challenge model declaration (exact fields, non-unique digests, exactly two indexes); db: the challenge collection against real MongoDB (defaults, duplicate uid rejection, both indexes as actually built, no plaintext code or email on the raw document, negative attempts rejected)
  'phaseAUTH03-session-renewal.test.mjs', // AUTH-03: unit: renewal never creates a session/jti/audit and never writes expiresAt, same-jti signing, checkRevoked boundary intact, UID-only match, the exchange gate + locked code, requireAuth untouched, the requireAuth→limiter→controller order, mutation sensitivity; db: same _id/jti/byte-identical expiresAt, no audit row, the expiry contract, strictly-later new exp with an unmoved cap, near-cap renewal, past-cap refusal, uid mismatch 409, unverified 400 EMAIL_NOT_VERIFIED, bad token 400-not-401, unauthenticated 401, missing idToken 400, and the 429 + Retry-After limiter
  'phaseAUTH04B3-email-verification-request.test.mjs', // AUTH-04-B3: unit: Firebase-error propagation unchanged (missing/expired/invalid + unconfigured), the already-verified short-circuit, the missing-email VALIDATION_ERROR, both NOT_CONFIGURED gates, the pure 60-second cooldown boundary and its clamps, the error-class shape (code/retryAfterSeconds, no HTTP status), and the source guards; db: the challenge request lifecycle over real MongoDB (mint + digest correspondence, no plaintext stored, supersession reusing one _id with attempts/usedAt reset, cooldown refusal leaving the row unchanged, the boundary, concurrent stale-row supersession and first-time creation converging to one row / one send, a delivery failure leaving the new challenge current with the cooldown active and the retry cooldown-refused, a configuration failure leaving the existing challenge untouched, independent uids, already-verified no-op, seam cleanup, and AD-18 event placement + log safety)
  'phaseAUTH04B4-email-verification-confirm.test.mjs', // AUTH-04-B4: unit: Firebase-error propagation unchanged (missing/expired/invalid/unconfigured), the already-verified short-circuit with nothing configured, blank/non-string code refused before any work, the pepper gate before any reservation, the AD-18 event/reason closed set, the error-class shape, and the source guards (step order, the locked AD-12 consume predicate, no emailHmac comparison, no new gate, exactly two legacy gates, no transaction/upsert/index/audit); db: the confirm lifecycle over real MongoDB (correct code → bridge called once + usedAt stamped + exactly one attempt spent; wrong code spends an attempt and leaves usedAt null; absent/used/expired/exhausted → one indistinguishable code; the attempts and expiry boundaries; concurrent valid confirmations both succeeding with one usedAt transition and two attempts; valid+invalid concurrency; an Admin failure propagated unchanged with usedAt null, the attempt spent, the same code still retryable, and repeated failures exhausting the budget; BRIDGE_FAILED / FAILED / COMPLETED placement; log secrecy; uid independence; seam cleanup in a finally)
  'AI1-ai-turn-deadline.test.mjs', // AI-1: unit: the turn deadline (default 60000, one budget shared across iterations, never deadline x iterations), the shrinking per-call budget, and the F-52 empty-response guard; db: the 504 AI_TIMEOUT wire contract, nothing persisted when a deadline expires, and the cancellation of a turn whose client has gone away
  'AI5-ai-turn-cost.test.mjs', // AI-5: unit: the turn-cost line (one line per turn on every exit, the request count, the tool round count and names, provider time measured against a deliberate delay and never a line of zeroes, a turn that died reporting what it spent, an abandoned turn reporting zero spend, the degraded turn keeping its AI-2 warning alongside the cost line, and the provider-failure path intact)
  'AI6-ai-quota-limit.test.mjs', // AI-6: unit: an upstream 429 is classified as a quota refusal (AiQuotaExceeded / AI_QUOTA_EXCEEDED, an isAiError, never an AiProviderError) while every other non-2xx — a 500 included — stays AiProviderError, the 429 body is still read and its diagnostics logged with no secret leaked, and the quota rejection is NOT retried; db: the 429 AI_QUOTA_EXCEEDED wire contract over the real route with its own sentence, distinct from 429 AI_RATE_LIMITED and from the 502 AI_UNAVAILABLE a limit used to arrive as, leaves nothing persisted, and a 5xx still answers 502
  'AI8-ai-output-limit.test.mjs', // AI-8: unit: the wire reports a `max_tokens` stop as a truncation, the partial answer is kept and marked `OUTPUT_LIMIT` (never replaced by a canned sentence), the one greppable degraded line names the reason, a healthy turn carries no mark, a truncated TOOL round does not mark a completed answer, and the two canned reasons are unchanged; db: the 201 carries the mark, the partial answer is what is stored, and a reopened thread reads the mark back (a healthy turn carries no `degraded` key at all)
  'AI2-ai-empty-retry.test.mjs', // AI-2: unit: the empty-completion retry (one attempt plus one retry then stop, a raised budget honoured, a retry that succeeds returning the real answer, no retry for a healthy answer/tool round/provider failure, the retry sharing the turn deadline, and a large budget still bounded by the iteration cap with the reason naming the cause) and the degraded mark; db: the 201 carrying degraded=EMPTY_COMPLETION while still persisting the turn, and a healthy turn carrying no degraded key at all
  'phaseAUTH04C-email-verification-http.test.mjs', // AUTH-04-C + D: unit: the request/confirm payload validators (idToken required/bound/trim, code required/bound/trim with a present-but-wrong value reaching B4, exact returned shape, AD-2 inertness), the two limiter factories (independent stores, 900000/30 defaults, four env keys, the imported code not re-declared, no skipSuccessfulRequests, per-IP keying) and the route/mapper source guards; db: the request + confirm endpoints over the real app against real MongoDB (success + challenge/mail/Admin-write effects, already-verified no-ops, 400-not-401 on a rejected Firebase token, the 503 configuration/unavailability/mail-failure contracts, missing-pepper no-mint, the B3 cooldown 429 + Retry-After and its separation from the AD-19 limiter, wrong/expired/exhausted code refusals, blank-code validation, Admin-failure usedAt-left-null, body-identity inertness, and the per-IP limiter threshold/429/Retry-After/recovery/independence)
  'AI10-output-limit-not-an-outage.test.mjs', // AI-10: unit: a `max_tokens` stop with nothing usable is AiOutputLimit / AI_OUTPUT_LIMIT (never an AiProviderError, always an isAiError), the sentence names the limit and the remedy and never "unavailable" or "in a moment", the failure is logged once with the cap and the model while a healthy answer logs nothing, the turn reports outcome=AI_OUTPUT_LIMIT and is never retried, and AI-8's truncated-but-present answer still keeps its text; db: over the REAL wire against a stubbed gateway the route answers 502 AI_OUTPUT_LIMIT with the actionable sentence (never 502 AI_UNAVAILABLE), leaves no conversation behind, an AI-layer limit raised inside the loop reaches the client unchanged, and a genuine 5xx still answers 502 AI_UNAVAILABLE; and the CAP-SPENT TURN'S OWN COST (found on the device 2026-10-17): the failure carries the model and the token spend it saw (omitted, never zeroed, when the gateway reported none) so both the hand-thrown and the real-wire turn line report in/out and the model instead of `in=0 out=0 model=unknown`
];

const FILE_LISTS = {
  full: [...PURE_UNIT, ...PURE_DB, ...MIXED],
  unit: [...PURE_UNIT, ...MIXED],
  db: [...PURE_DB, ...MIXED],
};

// Resolve every listed file against the real test dir so a typo/drift fails now
// instead of silently shrinking a run. Any *.test.mjs file not classified here
// is reported so the classification cannot silently go stale.
const onDisk = readdirSync(testDir).filter((f) => f.endsWith('.test.mjs')).sort();
const classified = new Set([...PURE_UNIT, ...PURE_DB, ...MIXED]);
const unclassified = onDisk.filter((f) => !classified.has(f));
if (unclassified.length) {
  console.error(`[run-tests] Unclassified test file(s) present — add them to run-tests.mjs: ${unclassified.join(', ')}`);
  process.exit(2);
}

const files = FILE_LISTS[mode].map((f) => path.join(testDir, f));

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
const desc = {
  full: 'full suite (DB-backed suites fail loudly if MongoDB is unreachable)',
  unit: 'DB-independent tests only (no MongoDB required)',
  db: 'DB-backed tests only (MongoDB required; fails loudly if unreachable)',
}[mode];

console.log(`[run-tests] TEST_MODE=${mode}: ${files.length} file(s) — ${desc}`);
console.log(`[run-tests] files: ${FILE_LISTS[mode].join(', ')}`);

const child = spawn(process.execPath, ['--test', ...files], {
  cwd: serverRoot,
  // LOG_REQUESTS=0 keeps the Phase 08A per-request access log off during test
  // runs (error logs are unaffected and always emit). Individual suites that
  // must exercise the access log enable it explicitly via createApp.
  env: { ...process.env, TEST_MODE: mode, LOG_REQUESTS: process.env.LOG_REQUESTS || '0' },
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error(`[run-tests] failed to start node --test: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[run-tests] node --test terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
