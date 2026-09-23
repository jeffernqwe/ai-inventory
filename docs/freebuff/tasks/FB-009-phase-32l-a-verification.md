# FB-009 — Phase 32L-A independent verification (source review + real runtime)

> Audit record. **Not** architecture, **not** project history, **not** a specification.
> Authority for the contract being checked: `FB-007-phase-32l-decision-freeze.md` (binding).
> Authority for the implementation under test: `FB-008-phase-32l-a-unlink-backend.md`.
> Provenance labels: `[SOURCE]` · `[EXPERIMENT]` · `[INFERENCE]` · `[EXTERNAL VERIFICATION REQUIRED]`.

---

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | `FB-009` |
| Phase | **Phase 32L-A verification gate** — source review + runtime verification |
| Mode | `VERIFICATION ONLY` — no implementation, no test change, no commit |
| Branch | `experiment/freebuff-evaluation` |
| HEAD at start and end | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — **unchanged** |
| Staged | **0** throughout |
| Protected files | all five **byte-identical** to the FB-002 baseline, before and after |
| Files created by this task | `tasks/FB-009-phase-32l-a-verification.md` **only**, plus the trail entries |
| Commit / push | **none** |
| Verdict | **PASS with two findings** — the implementation matches the freeze; the *verification claim* in FB-008 is corrected, and one test is timing-dependent |

## 1. Preflight

| Check | Value |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` |
| HEAD | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` |
| Staged | **0** |
| Working tree | 46 entries — the pre-existing Phase 32I/32J/32K set plus the 32L-A implementation and trail; **no mobile file changed by this task** (17 mobile entries, all pre-existing) |
| Protected hashes | `10c5ff2e…d7bd530` · `23e91610…da1a213` · `83767f8b…22d0768` · `52d3afef…10625891` · `d000a5d3…e63c297` — **all unchanged** |
| Dependency / schema files | `mobile/package.json` and `mobile/package-lock.json` are modified **in the working tree, pre-existing** (the owner's Phase 32I/32J Firebase JS SDK work). **This task changed nothing.** No server dependency, no model, no index, no migration was touched |

## 2. Source and diff review — PASS

Every 32L-A file was re-read from disk and checked line-by-line against D-1…D-9, not against the
FB-008 report. The three modules that carry the security weight were read in full
(`firebaseUnlink.service.ts`, the `tokenVerifier` seam, the R-4 block in `passwordReset.service.ts`);
the rest were reviewed as diffs against `8af1d49`.

**Nothing in the implementation contradicts the freeze.** Specific confirmations:

- **D-2** — no provider unlink anywhere: no `unlink()`/`unlinkProvider`/`providersToUnlink` call exists in
  `src/`, and the unlink route performs only the MongoDB transition plus session revocation `[SOURCE]`.
- **D-3** — the four frozen codes exist with the frozen meanings, and no generic code replaced them `[SOURCE]`.
- **D-4** — `authMethodsFor` returns exactly `{ password, firebase }`; **no** provider-specific field was
  introduced anywhere `[SOURCE]`.
- **D-5** — the unlink route is `requireAuth` + controller, so business-status authorization is
  **inherited** from `assertActiveBusiness` inside the middleware; the service adds no second check and
  no bypass `[SOURCE]`.
- **D-8** — `businessId` and `role` are read for the audit row and never assigned; the authoritative write
  touches exactly four fields `[SOURCE]`. Email is never compared, never used to find an account, never
  used to resolve a conflict `[SOURCE]`.

## 3. `auth_time` verification — PASS

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Only `authTime: number \| null` is added to the verified claim set | **Yes** — the seam is a five-field allowlist `[SOURCE]` |
| 2 | The raw JWT / decoded payload is not exposed | **Yes** — `toVerifiedIdentity` still narrows on every path, including the test seam `[SOURCE]` |
| 3 | `auth_time` comes from the verified token | **Yes** — read from the decoded claim inside the verifier, with a string value deliberately coerced to `null` rather than accepted `[SOURCE]` |
| 4 | `iat` is not used for freshness | **Yes** — `iat` is never read by the freshness path `[SOURCE]` |
| 5 | Client timestamps are not accepted | **Yes** — the only time input is the service's own `now` argument (server-side, injectable for tests), never a request field `[SOURCE]` |
| 6 | UID comes from the verified token | **Yes** — `verifyFirebaseIdToken(idToken).uid` `[SOURCE]` |
| 7 | Frozen 300-second window | **Yes** — `FIREBASE_REAUTH_WINDOW_SECONDS = 300` `[SOURCE]` |
| 8 | `null` / non-finite / missing fails closed | **Yes** — `authTimeIsFresh` returns `false` unless it has a finite number `[SOURCE]` |
| 9 | Stale returns `FIREBASE_REAUTHENTICATION_REQUIRED` | **Yes — proven at runtime (§16, test B)** `[EXPERIMENT]` |
| 10 | No mutation on a stale authentication | **Yes — proven at runtime (§16, test B)** `[EXPERIMENT]` |

## 4. Endpoint order — PASS

The order is exactly the frozen design, and each step was read in source `[SOURCE]`:

verify token → load `req.user.id` → **NOT_LINKED from the account's OWN `firebaseUid`** → **uid mismatch
refusal** → **freshness** → validate + hash the new password → **R-3** → **one conditional write** →
revoke sessions → audit.

Two ordering nuances worth recording precisely, because a careless reading of FB-008 could overstate them:

- **NOT_LINKED is decided before the *identity is compared*, not before the token is *verified*.** The
  token is verified first, so an account with no linked identity that presents a *broken* token receives
  **400 `FIREBASE_TOKEN_INVALID`**, not 409. This is deliberate and correct — but it means "the token is
  never used to steer the operation" is true in the sense that matters (it cannot select an account,
  tenant or identity) and not in the weaker sense that it is unread.
- **`requireAuth` runs before the service**, so 401/403 for a missing session or a non-ACTIVE business is
  produced by the middleware, and no service code duplicates it.

## 5. UID ownership — PASS

- No request field can steer the operation: the validator returns **only** `{ problems, idToken, newPassword }`
  and the service takes the account from `userId`/`businessId` arguments supplied from `req.user` `[SOURCE]`.
- The verified uid **must equal** the stored `firebaseUid` `[SOURCE]`.
- A mismatch is refused, audited and **never** transferred or merged; the existing mapping is untouched
  `[SOURCE]` — and **confirmed at runtime** with two real Firebase identities (§16, test C).
- A uid held by a **different** Inventory AI account is refused the same way, and the audit row does not
  name the conflicting uid `[EXPERIMENT]`.

## 6. Atomic transition — PASS

One conditional `findOneAndUpdate` on `{ _id, firebaseUid: verifiedUid }` that `$unset`s `firebaseUid` and
sets `emailVerified: false`, `passwordHash`, `passwordChangedAt` `[SOURCE]`.

- **Old hash cannot survive**: the same update writes the new `passwordHash`; there is no path that omits it
  and no path that unsets anything else. **Proof it is load-bearing:** dropping `passwordHash` from the
  update reddens **7** assertions including "the OLD password can never authenticate again" (§15, M5).
- **`$unset`, not `$set: null`** — correct, and the reason is in the code: the index is `sparse`/unique, and
  a present `null` would stay indexed and collide across unlinked accounts `[SOURCE]`.
- **No zero-method state can be committed**: the new credential is validated and hashed *before* the write,
  and the write removes one method while installing another in the same operation `[SOURCE]`.
- **Lost race performs no second mutation**: when the filter matches nothing, the service re-reads and
  either answers `NOT_LINKED` or `FIREBASE_IDENTITY_CONFLICT`; it never retries a write `[SOURCE]`.
- **Tenant/role/status unchanged** — verified at runtime: `businessId`, `role` and `status` were compared
  before and after a real unlink and were identical (§16, A8–A10) `[EXPERIMENT]`.

## 7. Last-method invariant — PASS

The invariant is structural rather than asserted: the hashed new credential exists before the transition,
and the transition is a single operation. Runtime confirms a Firebase-native-shaped and a hash-bearing
account both end with exactly one usable method (§16, A/H) `[EXPERIMENT]`. Removing the new-password
requirement at the **service** layer reddens the direct-service test (§15, M4) — and removing it at the
**controller** layer alone would be invisible, which is why both layers exist and why the service is
tested without HTTP in front of it.

## 8. R-3 — PASS

`PasswordResetToken.deleteMany({ userId, usedAt: null })` runs **before** the authoritative write `[SOURCE]`,
and is asserted by **deletion, not merely by consumption**: the test checks the unspent count falls 1 → 0
**and** that the specific row is gone by hash, with the "while linked" probe on a **separate** token so the
probe cannot spend the row being measured `[SOURCE]`. Runtime confirms the same shape against real data:
the row is gone and the token cannot be spent afterwards (§16, test F) `[EXPERIMENT]`.

## 9. R-4 — PASS in source, **with one surviving mutation** (see §15)

The completion write is conditional on `{ _id, firebaseUid: null, $or: [{ passwordChangedAt: null }, { passwordChangedAt: { $lte: issuedAt } }] }`,
bound to the **token's own issuance time** rather than a value re-read during the request `[SOURCE]`. Both
authority changes are covered:

- a token issued **before** the unlink → the unlink stamps `passwordChangedAt: now` > `issuedAt` → the
  `$or` range branch refuses `[SOURCE]`;
- a token **claimed** before the unlink lands → same filter, same refusal `[SOURCE]`.

The explicit `null` arm is **load-bearing and measured, not defensive**: MongoDB's range operators compare
same-type values only, so `{ passwordChangedAt: { $lte: <Date> } }` matches neither `null` nor a missing
field — proven with a direct driver probe during implementation, and the ordinary-reset tests (including a
null `passwordChangedAt`) would fail without it `[SOURCE]`. No existing reset guarantee was weakened: a
normal reset still succeeds and the rejection is the same generic `INVALID_RESET_TOKEN` `[SOURCE]`.

**Change-password side effect** is present as the freeze intended: a token issued before an ordinary
password change can no longer overwrite the newer credential `[SOURCE]`.

## 10. Session revocation — PASS

- Revocation happens **after** the transition succeeds; nothing revokes on a failure path `[SOURCE]`.
- The pre-unlink session is dead — **exercised over the real endpoint**, not inferred from the database:
  the old token gets `401` on `GET /api/auth/me` while a session minted from the new password gets `200`
  (§16, G1/G2) `[EXPERIMENT]`.
- A **refused** unlink leaves the caller's session working (§16, C7/E5/B8) `[EXPERIMENT]`.
- The implementation claims nothing about the Firebase session, and the audit wording does not either `[SOURCE]`.

## 11. Audit — PASS

`FIREBASE_IDENTITY_UNLINKED` on success (metadata `{ passwordEstablished: true }` only) and
`FIREBASE_IDENTITY_UNLINK_CONFLICT` on a refusal `[SOURCE]`. Verified at runtime against the real
`audit_logs` collection: the success row exists, carries **no** uid, token, hash or `jti`, and the conflict
row does **not** name the conflicting uid (§16, AUD1–AUD3, C5–C8) `[EXPERIMENT]`.
`FIREBASE_IDENTITY_NOT_LINKED` is **intentionally not audited** — no mapping changed hands — and the code
says so where the decision was made `[SOURCE]`.

## 12. Error contract — PASS

| Condition | Status | Code | Runtime |
| --- | --- | --- | --- |
| Invalid Firebase token | 400 | `FIREBASE_TOKEN_INVALID` | **observed** (E1/E2) |
| Identity mismatch | 409 | `FIREBASE_IDENTITY_CONFLICT` | **observed** (C1/C2) |
| Nothing linked | 409 | `FIREBASE_IDENTITY_NOT_LINKED` | **observed** (D1/D2) |
| Stale authentication | 409 | `FIREBASE_REAUTHENTICATION_REQUIRED` | **observed** (B2/B3) |
| Missing session | 401 | `AUTH_REQUIRED` (middleware) | inferred from the middleware, not separately exercised |
| Business not ACTIVE | 403 | `BUSINESS_NOT_ACTIVE` (middleware) | **not exercised at runtime** — covered by the DB suite |

**The recency refusal is 409, not the brief's suggested 403.** The deviation is deliberate, documented in
the code, and **correct**: `mobile/lib/client.ts` treats a 401 or 403 on a token-bearing request as session
loss, so a 403 would sign a user out for being asked to reauthenticate. Runtime confirms the property
(B4). The frozen **code** is unchanged.

## 13. `authMethods` — PASS

`authMethodsFor` derives both flags from the single `firebaseUid` field, so they cannot describe different
accounts, and it is called from **both** publishing surfaces — `toPublicUser` (`auth.service.ts:249`) and
`requireAuth`'s `req.user` (`authenticate.ts:155`) `[SOURCE]`. Runtime confirms `{ password: true, firebase: false }`
after an unlink on the unlink response, on a fresh login response, and (indirectly) via `/api/auth/me`
(§16, A3/H3) `[EXPERIMENT]`. Publishing `firebase` is load-bearing: dropping it reddens 5 assertions (§15, M9).

## 14. Test counts

| Command | Result |
| --- | --- |
| `npm test` (full) | **838 tests / 109 suites / 0 fail** |
| `npm run test:unit` | 348 tests / **324 pass** / 0 fail (24 skipped by design) — **plus one unreproduced 323/1 run, see §21** |
| `npm run test:db` | 540 tests / **514 pass** / 0 fail (26 skipped by design) |
| new suite alone | **43 / 43 pass** |
| `npm run typecheck` | clean |
| `npm run lint` | clean |

No assertion was deleted, weakened or skipped by this task.

## 15. Mutation results — **8 reliable / 10, one flaky, one surviving**

Ten mutations were re-applied independently, each alone on a pristine copy, with a **startup anchor guard**
that refuses to run if any expected original line is missing:

| # | Mutation | Verdict |
| --- | --- | --- |
| M1 | `auth_time` freshness disabled | **DETECTED** (6 assertions) |
| M2 | uid ownership guard **and** conditional filter removed together | **DETECTED** (3) |
| M3 | conditional unlink write made unconditional | **DETECTED, but NON-DETERMINISTICALLY** — see below |
| M4 | new-password requirement removed (service layer) | **DETECTED** (1) |
| M5 | old-hash replacement dropped | **DETECTED** (7) |
| M6 | R-3 reset-token invalidation removed | **DETECTED** (1) |
| M7 | conditional reset completion made blind (`firebaseUid: null` clause removed) | **NOT DETECTED — 2 of 2 runs** |
| M8 | session revocation removed | **DETECTED** (2) |
| M9 | `authMethods.firebase` not published | **DETECTED** (5) |
| M10 | success audit row not written | **DETECTED** (1) |

### ★ CORRECTION OF FB-008 — its "10/10 detected" claim is NOT reproducible

FB-008 records "10/10 detected". Independent re-running does **not** reproduce that:

- **M7 survives every time.** FB-008 reported M7 as detected; two independent runs show the suite stays
  green. **This is a test weakness, not a code defect.**
- **M3 is detected only sometimes.** It was detected in one isolated run (by *"two concurrent unlinks leave
  exactly one success and one usable method"*) and **not** detected in a batched run. The assertion is
  genuine but **timing-dependent**, so M3's protection is only probabilistically verified.

Per the trail's standing rule, the FB-008 block is **not rewritten**: the correction is recorded here and
in `MASTER_LOG.md` / `DECISIONS.md` (**FB-D-121**).

### M7 — the reasoning, exactly

The removed clause is the `firebaseUid: null` half of the R-4 completion filter.

- **It is NOT load-bearing for the unlink race itself.** The unlink stamps `passwordChangedAt: now`, which
  is later than the token's `issuedAt`, so the `$or` range branch already refuses. That is why the R-4 test
  stays green with the clause removed — the `$or` does the refusing.
- **It IS load-bearing for one narrow interleaving**: an account **linked to Firebase after the reset's own
  read but before its completion write**. R-2's guard refuses when `firebaseUid` is *read* as present, but
  cannot see a link that lands after that read. Without the clause, such a token could write a local
  password onto a Firebase-linked account — re-establishing exactly the credential Phase 32K says must not
  be usable while `firebaseUid` is set.
- **So: not a security gap in the code, and not an intentionally unreachable mutation — a test weakness.**
  No test interleaves in the read → write window for either the reset or the unlink path.
- **Remedy, NOT APPLIED (this task is verification-only).** Add one DB-backed interleaving test per path,
  using the project's existing seam style: perform the identity/authority mutation from inside a hooked
  model call that runs between the service's read and its write — for the unlink path
  (`PasswordResetToken.deleteMany` runs exactly there) and for the reset path (`bcrypt.hash` runs exactly
  there). Both make M3 deterministic and make M7 detectable. **Awaiting authorization.**

## 16. Pass 2 — REAL RUNTIME VERIFICATION — **56 / 56 checks passed**

Run against the **real shipped app** (`support.startServer()` → real routers + middleware), the **real
development MongoDB**, and the **real Firebase ID-token verifier** using the project's own service account.
Devices/emulators: none — this is an HTTP-level runtime exercise, not a device run. Throwaway `@example.com`
Firebase identities were created through the Firebase REST API; Inventory AI accounts were created through
the real `POST /api/auth/register`.

| Test | Result |
| --- | --- |
| **A — successful unlink** | **10/10** — 200; `firebaseUid` removed; `emailVerified` false; `passwordChangedAt` stamped; `businessId`/`role`/`status` unchanged; `authMethods` = `{password:true, firebase:false}`; no `firebaseUid` in the response |
| **AUD — audit** | **3/3** — one success row; contains no uid/token/hash/`jti`; metadata is `passwordEstablished: true` |
| **C — uid ownership mismatch** | **8/8** — 409 `FIREBASE_IDENTITY_CONFLICT` with two real identities; mapping untouched; no password written; conflict row present; no success row; caller session survives; conflicting uid absent from the audit row |
| **D — not linked** | **4/4** — 409 `FIREBASE_IDENTITY_NOT_LINKED`; nothing mutated; no audit row |
| **E — invalid token** | **5/5** — 400 `FIREBASE_TOKEN_INVALID`; nothing mutated; no audit row; caller session survives |
| **F — reset-token invalidation** | **6/6** — an outstanding unspent row is **deleted** by the unlink; the token cannot be spent; the unlink password survives; the attacker password never lands |
| **G — session revocation** | **2/2** — the pre-unlink session gets **401** on the real `/api/auth/me`; a session from the new password gets 200 |
| **H — password authority after unlink** | **3/3** — the NEW password authenticates; the OLD retained password does not; `authMethods` reports password authority |
| **B — stale `auth_time`** | **15/15**, including three controls |

**Test B is the strongest single result, because the refusal is made attributable:**

- the session was genuinely **315 s** old against a 300 s window, while the token was still well inside its
  own 3600 s validity (`B0`/`B0b`/`B0c`) `[EXPERIMENT]`;
- **control 1** — the *same* stale token still **verifies and resolves**: `firebase/exchange` answered
  **200**, so the refusal cannot be a verification failure (`B1`) `[EXPERIMENT]`;
- the unlink then answered **409 `FIREBASE_REAUTHENTICATION_REQUIRED`**, not 401/403 (`B2`/`B3`/`B4`);
- **nothing** was mutated: uid unchanged, hash unreplaced, `passwordChangedAt` unmoved, **the caller's
  session still worked**, and **no** success audit row (`B5`–`B9`) — so the refusal is genuinely side-effect
  free;
- **control 2** — a fresh Firebase sign-in produced `auth_time` age **0 s** and the **same endpoint then
  succeeded** (`B10`/`B11`/`B12`), proving the window is the discriminator and that the flow recovers after
  reauthentication exactly as Option D intends `[EXPERIMENT]`.

**Not exercised at runtime, stated rather than glossed:** the `403 BUSINESS_NOT_ACTIVE` path; a live Google
federated re-sign-in after unlink (the known O-6 gap); and any device/emulator/APK behaviour.

## 17. Cleanup verification — PASS

- **7 throwaway Firebase identities** created; **7 deleted**; a `listUsers` sweep for the test prefixes
  returned **0 leftovers** `[EXPERIMENT]`.
- Every Inventory AI business, user, session and reset-token row created for the experiment was removed by
  the project's own `createTracker` cleanup; no production user was read or modified, and the Phase 32J test
  tenant was not touched.
- All verification scripts lived **outside the repository** and were deleted; **no credential, token,
  password, API key or hash value was printed** at any point.

## 18. Protected-file verification — PASS

All five byte-identical to the FB-002 baseline before and after:
`10c5ff2e…d7bd530` · `23e91610…da1a213` · `83767f8b…22d0768` · `52d3afef…10625891` · `d000a5d3…e63c297`.
No reset, restore, clean, stash or history manipulation was used at any point.

## 19. Git state

| Check | Result |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` — unchanged |
| HEAD | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — **unchanged** |
| Staged | **0** |
| Commit | at the time of this pass **none created**. **A later final-review checkpoint committed the phase as `01ae73f5d237da5ae49a723b970aae4daf421d2a` — see §24** |
| Push | **none performed** |
| Mobile files | untouched by this task (17 pre-existing entries) |
| Dependency / schema / migration change | **none by this task** |
| Files added by this task | `tasks/FB-009-phase-32l-a-verification.md`, plus trail entries |

## 20. ★ An accidental modification during verification, reported in full

**The mutation harness was killed by a command timeout while mutation M10 was applied to
`server/src/services/firebaseUnlink.service.ts`**, leaving that one line reading
`AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINKED_DISABLED`. The harness's `finally` block could not run because
the process was terminated.

**This is reported rather than hidden, and the file was restored rather than left broken.** The restoration
was **surgical** (the single line rewritten back), **not** a `git restore`/`reset`, and it was then proven:

- the correct line is present exactly once and the artifact string appears **zero** times;
- every other mutation anchor is intact (all ten verified individually);
- `npm run lint` and `tsc --noEmit` are clean;
- **the full suite is green at 838 / 109 suites / 0 fail**, which includes the audit assertion that the
  mutation had reddened — so the behaviour is bit-for-bit back to the verified state.

A subsequent harness run then refused to start at all, because the **anchor guard** added for exactly this
scenario detected the missing original line. That guard is the reason no later measurement was taken against
a mutated file. **No other file was ever left modified.**

## 21. Findings, defects and anomalies

1. **★ CORRECTION of FB-008's mutation claim** — 8/10 reliably detected; **M7 survives**; **M3 is flaky**
   (§15). The implementation is not at fault; the verification claim was overstated.
2. **★ M7 — a test weakness with a real (if narrow) security reason to fix.** The `firebaseUid: null` clause
   in the R-4 filter closes the "linked after the reset read, before the completion write" interleaving and
   is unmeasured. Not exploitable in the code as written; the suite simply does not prove it.
3. **★ A timing-dependent concurrency test.** *"two concurrent unlinks leave exactly one success and one
   usable method"* detects M3 only sometimes. A flaky assertion is a weak control: it will pass a real
   regression roughly as often as it catches one.
4. **An isolated, non-reproducible unit failure.** One `npm run test:unit` run reported **323 pass / 1 fail**;
   **13 subsequent runs are green (324/0)**, and the failure has not recurred. The failing case was **not
   identified**. Two files were checked in isolation for timing sensitivity (`phase06-ai-wire`: 10 runs green;
   `phase07d-production-config`: 12 runs green) with no reproduction. **Cause unknown; not attributable to a
   32L-A file** — all 32L-A unit cases are deterministic (injected time) and pass in every run.
   `[EXPERIMENT REQUIRED]`
5. **Not a defect:** the NOT_LINKED / invalid-token ordering nuance in §4.

## 22. Is Phase 32L-A ready for architectural approval?

**YES — the implementation is.** Every frozen decision was confirmed in source, and 56 independent runtime
checks against the real app, real database and real Firebase verifier passed, including the stale-session
test with two controls that make the refusal attributable. The account cannot reach a zero-method state,
the retained hash cannot be resurrected, both R-3 and R-4 are in place, and no client-supplied value can
steer the operation.

**The qualification is about evidence, not behaviour:** the FB-008 mutation claim is overstated, one
mutation survives, one test is timing-dependent, and one unit run failed unreproducibly. All four are
**verification-quality** issues. Two of them (M7, the flaky concurrency test) mean two real protections are
not *reliably proven* rather than not *present*.

## 23. Recommendation on proceeding to Phase 32L-B

**Proceed to Phase 32L-B — but first close the two verification gaps, in this order:**

1. **Add the two interleaving tests** (§15 remedy) so M3 is deterministic and M7 is detected. This is
   small, touches only test files, and is the difference between "the filter clause is there" and "the
   filter clause is proven".
2. **De-flake the concurrent-unlink assertion** — assert the observable outcome deterministically (exactly
   one 200 and one 409) rather than relying on an interleaving that only sometimes occurs.
3. **Commit Phase 32L-A together with those test changes**, so the mutation record that is committed is the
   corrected one.

Phase 32L-B does not depend on any of this — it consumes an error contract that runtime has now confirmed
end-to-end — so the mobile work may begin in parallel if the owner prefers. **The one thing that must not
happen is committing FB-008's "10/10" claim as written.**

**Not settled here, and deliberately:** the **federated re-sign-in gap (O-6)**, whether the residual timing
work is pursued, and the project-documentation close-out for Phase 32L
(`README.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/SYSTEM_SPECIFICATION.md`) — none of which this
verification task was authorized to touch.

---

# ADDENDUM — mutation hardening (owner-authorized follow-up to this verification)

**Scope:** test files only. **No production file changed** — proven by hash, §A4.

## A1. What was wrong, restated

This verification found that two protections were **present but not reliably proven**: the `$or`-sibling
`firebaseUid: null` clause in the **reset** completion filter (surviving mutation **M7**) and the
`firebaseUid: identity.uid` clause in the **unlink** filter (mutation **M3**, caught only
probabilistically). Both clauses are genuinely load-bearing; the suite simply never interleaved in the
window they exist for.

## A2. The three changes

1. **`★ the conditional write refuses a STALE identity — a racing swap is not detached`** (new, DB-backed).
   Interposes on **`bcrypt.hash`**, which the unlink service crosses *strictly between* the ownership check
   and the authoritative write, to change the account's `firebaseUid` mid-request. Asserts 409
   `FIREBASE_IDENTITY_CONFLICT`, **the arriving identity is not detached**, no credential is written, and
   exactly one `FIREBASE_IDENTITY_UNLINK_CONFLICT` audit row with no success row.
2. **`★ R-4 — a LINK landing after the reset read is refused by the uid clause`** (new, DB-backed).
   Same seam, on the **reset** path. The account acquires Firebase authority *after* the read that fed the
   Phase 32K in-memory guard (`if (user.firebaseUid) throw …`) and *before* the completion write — and
   crucially **without touching `passwordChangedAt`**, which is precisely why the `$or` cannot substitute
   for the uid clause. Asserts 400 `INVALID_RESET_TOKEN`, the arriving identity intact, **no password
   written**, nothing stamped.
3. **`★ two concurrent unlinks yield exactly one 200 and one 409, and exactly one transition`** — the
   previous form asserted "at least one 200 and a non-2xx loser" and depended on whether the two requests
   actually **overlapped**, which is a scheduling accident rather than a property. It now uses a
   **barrier**: both requests are held at `bcrypt.hash` until the **second** arrives, so both have read the
   same pre-unlink account before either writes. Exact statuses are required (`[200, 409]`), and state,
   session, audit-count and login assertions were **kept and extended** — nothing was loosened.

**Why `bcrypt.hash` and not the R-3 cleanup call.** The first draft of change 1 hooked
`PasswordResetToken.deleteMany` because it sits in the same window — and that made **M6** (R-3 removed)
redden the new test *incidentally*, because the hook simply never ran. A hook that a **mutation can stop
from being called** produces a failure for a reason unrelated to the assertion, which is a **false
signal**, not a stronger test. `bcrypt.hash` is crossed on every path that reaches the write, so the
tests now depend only on position, not on the existence of an unrelated call. Verified: **M6 is caught
only by the R-3 test**, and M3 by the two race tests.

**No sleeps anywhere.** Every synchronization point is a barrier or a one-shot interposition; the only
`setTimeout` is a 15-second **safety valve that FAILS the test** if a request never reaches the window,
which would itself be a bug.

## A3. Mutation results — 11 mutations, all DETECTED

| # | Mutation | Before (this verification) | **After hardening** | Caught by |
| --- | --- | --- | --- | --- |
| M1 | `auth_time` freshness disabled | DETECTED | **DETECTED** (6) | freshness tests |
| M2 | uid ownership guard **and** unlink filter removed | DETECTED | **DETECTED** (4) | mismatch tests |
| **M3** | **unlink filter uid clause removed** | **FLAKY (caught 1 of 2)** | **DETECTED (2)** | **both new race tests** |
| M4 | new-password requirement removed (service) | DETECTED | **DETECTED** (1) | direct-service test |
| M5 | old-hash replacement dropped | DETECTED | **DETECTED** (7) | replacement test |
| M6 | R-3 reset-token invalidation removed | DETECTED | **DETECTED** (1) | R-3 test **only** (decoupled) |
| **M7** | **reset completion `firebaseUid: null` removed** | **SURVIVED** | **DETECTED (1)** | **new R-4 LINK test** |
| M8 | session revocation removed | DETECTED | **DETECTED** (2) | revocation + concurrency |
| M9 | `authMethods.firebase` not published | DETECTED | **DETECTED** (5) | authMethods test |
| M10 | success audit row not written | DETECTED | **DETECTED** (2) | audit tests |
| **M11** | **reset completion `passwordChangedAt: null` arm removed** | (not previously tested) | **DETECTED (2)** | two **pre-existing** reset tests |

**M11 needed no new test, and that is reported rather than papered over:** the existing
`a NORMAL reset still works` and `a reset still works for an account whose passwordChangedAt is null`
cases already prove the null arm is required — removing it breaks every account that has never changed its
password. Measured here by mutation, not asserted from reading.

## A4. Determinism and integrity evidence

| Check | Result |
| --- | --- |
| **Failing direction, M3** | mutation applied, targeted pattern run **5×** → `[2,2,2,2,2]` failures — **caught every time** |
| **Failing direction, M7** | mutation applied, targeted pattern run **5×** → `[1,1,1,1,1]` failures — **caught every time** |
| **Passing direction** | the three race tests run **10×** → `3/3 pass` every run (30/30 executions), no flake |
| **Production source** | all **ten** 32L-A source files `sha256`-**identical** before and after; not one byte changed |
| **Protected files** | all five **byte-identical** to the FB-002 baseline |
| **Mobile / dependencies / schema** | untouched |
| **Test file** | `server/test/phase32l-firebase-unlink.test.mjs` — 1 423 lines, **45 `it(` cases** (was 43), `sha256 0a01d11b…b794a5` |
| **Suites** | `npm test` **840 / 109 suites / 0 fail**; `test:unit` 348 / 324 pass / 0 fail; `test:db` **542 / 516 pass** / 0 fail; `typecheck` and `lint` clean |
| **No assertion weakened or deleted** | every pre-existing case retained; the concurrent test's assertions were kept and **extended**, and its loose `409-or-401` acceptance was tightened to an exact `409` **plus** the frozen code |

## A5. Result

The corrected statement of this phase is now: **11 of 11 mutations detected, with the two race
protections caught deterministically five times out of five.**

- **FB-008's historical "10/10" remains historical and unrewritten** (correction recorded as
  `DECISIONS.md` **FB-D-121**).
- **The two gaps FB-D-121 recorded are now CLOSED**, recorded as **FB-D-122**.
- **This addendum changes no production behaviour**, so the verification gate's own runtime evidence
  (**56/56 checks**) remains valid and was deliberately **not** re-run.
- **No commit, no push** — still withheld, as instructed *at the time of the addendum*. The checkpoint
  followed, recorded in §24.

---

## 24. Final review + commit checkpoint — COMPLETE

**Appended after the commit.** Nothing above is rewritten; this section records only what happened next.

| Item | Value |
| --- | --- |
| Outcome | **PASS** — the final review and commit checkpoint completed successfully |
| Commit | **`01ae73f5d237da5ae49a723b970aae4daf421d2a`** |
| Subject | **`feat: implement Firebase identity unlink (Phase 32L-A)`** — used verbatim, as prescribed |
| Author / committer | `jeffernzxc <jefferndullamalinaozxc@gmail.com>` — the canonical project identity |
| Scope | **21 files, +4615 / −33** |
| Amended afterwards | **no** |
| Pushed | **no** |

**What the checkpoint confirmed, in the order it was checked:**

1. **Mutation hardening completed at 11 of 11 detected** — M1–M11, with the per-mutation evidence in §A3.
2. **The M3 and M7 race gaps were closed deterministically.** With each clause removed the targeted tests
   fail **5 of 5** runs (§A4); with the code pristine the three race tests pass **10 of 10** runs.
3. **Final verification remained green** — `npm test` **840 tests / 109 suites / 0 fail**; `test:unit`
   348 / 324 pass / 0 fail; `test:db` 542 / 516 pass / 0 fail; `typecheck` and `lint` clean.
4. **Production source remained unchanged during the mutation hardening** — all **ten** 32L-A source
   files `sha256`-identical before and after (§A4), re-confirmed at commit time. The hardening touched
   **test files and documentation only**, so this verification's **56/56 runtime evidence remains valid**
   and was deliberately not re-run.
5. **The implementation was committed**, together with the hardened tests and the corrected documentation,
   so the committed mutation record carries the corrected figures rather than the historical `10/10`.
6. **No push occurred.** No `git push` was run at any point in this phase.
7. **Phase 32L-B was not started** — no mobile unlink UI, no client reauthentication, no provider-unlink
   UI, and no dependency, schema or unrelated refactor.

**The historical-integrity rule was honoured at this step.** FB-008's original `10/10` statement is **not**
rewritten; **FB-D-121** remains the authoritative corrected interpretation of it, and **FB-D-122** records
that both gaps are now closed. No previously recorded runtime or test evidence was altered.

**Two consequences of the owner's scope decision, recorded so they are not mistaken for omissions:**
`docs/freebuff/HANDOFF.md`, `docs/freebuff/TEST_BASELINE.md` and
`docs/freebuff/tasks/FB-006-firebase-password-boundary.md` were **deliberately left uncommitted** — each
carries mixed FB-007/Phase-32K content, so none is strictly 32L-A-only. `README.md` and
`docs/DEVELOPMENT_ROADMAP.md` were likewise excluded, and `mobile/package.json` was excluded because it
carries **three unrelated Phase 32I/32J dependencies**.
