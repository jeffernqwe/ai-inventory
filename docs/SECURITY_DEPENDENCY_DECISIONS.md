# Inventory AI — Security Dependency Decisions

**Version:** 1.0
**Status:** Living decision record
**Baseline:** branch `main` @ `6e2b00ddfc2a9d294b38c6ac7123db575e0d372e` (2026-09-30)

---

## 1. What this document is

A record of **dependency-security decisions that were deliberately NOT to be acted on
automatically** — the advisories Inventory AI has chosen to **accept and document** rather than
remediate, together with the evidence that justifies each acceptance and the conditions that
force the decision to be revisited.

It follows the same decision-record convention already used for the password-recovery security
items B1 / B2 / E3 (`docs/DEVELOPMENT_ROADMAP.md` §27E): a risk that is **not fixed** is
**named**, **evidenced**, and **explicitly dispositioned** rather than left implied. Where a
previous document records a decision, this file records **dependency-specific** decisions and
does not restate or contradict those.

It authorises no implementation work, changes no code, and modifies no configuration or
manifest.

> **Reading rule that applies throughout.** Four facts are kept strictly separate, because
> collapsing them is how an accepted risk turns into an unexamined one:
>
> | Question | Answer for the item below |
> | --- | --- |
> | Does a vulnerable package exist in the tree? | **Yes** — 2 moderate audit entries |
> | Is it a production dependency? | **No** — **optional** |
> | Is it reachable from application runtime code? | **No** |
> | Is the vulnerable API actually invoked? | **No** |

---

## 2. Decision summary

| ID | Decision | Status |
| --- | --- | --- |
| **D-1** | `uuid@9.0.1` (GHSA-w5hq-g745-h8pq) and the `gaxios@6.7.1` entry it causes are **ACCEPTED AND DOCUMENTED** as residual moderate advisories. They are **optional** and **unreachable** from the Inventory AI runtime path. **No remediation is applied.** | **ACCEPTED** |
| **D-2** | npm's proposed remediation — **downgrading `gaxios` 6.7.1 → 6.3.0** — is **NOT TAKEN automatically**. A transitive downgrade of a package Inventory AI does not control is not an acceptable automatic change. | **NOT TAKEN** |
| **D-3** | Forcing `uuid` 11.x via npm **`overrides`** is **REJECTED**, as is `npm audit fix --force`. Both would violate the parent package's declared range (`gaxios@6.7.1` declares `uuid: ^9.0.1`) or introduce unrelated major changes. | **REJECTED** |

**Residual risk is real but bounded:** 2 moderate advisories remain reported by `npm audit`.
They are not described here as "fixed", "cleared", or "resolved".

---

## 3. Current findings

```
2 moderate severity vulnerabilities | 0 low / 0 high / 0 critical / 0 info
audited: prod 159 | dev 95 | optional 120 | peer 0 — total 373
```

| Package | Installed | Vulnerable range | Advisory | Direct dependency? |
| --- | --- | --- | --- | --- |
| `uuid` | `9.0.1` | `<11.1.1` | GHSA-w5hq-g745-h8pq — *"Missing buffer bounds check in v3/v5/v6 when `buf` is provided"* — **moderate** | no |
| `gaxios` | `6.7.1` | `6.4.0 - 6.7.1` | none of its own — flagged **via `uuid`** — **moderate** | no |

This is **one advisory surfacing as two audit entries**: `gaxios` carries no advisory of its
own; it is listed because it depends on the vulnerable `uuid`.

`uuid@9.0.1` is additionally **deprecated upstream**:

> `uuid@10 and below is no longer supported. For ESM codebases, update to uuid@latest.
> For CommonJS codebases, use uuid@11 …`

---

## 4. Exact dependency path

```
firebase-admin@14.4.0                       <- direct, production (server/package.json: ^14.4.0)
└─ optionalDependencies: @google-cloud/storage ^8.1.0      <- OPTIONAL
   └─ @google-cloud/storage@8.2.0                           lock: optional: true
      ├─ gaxios ^6.0.2 -> node_modules/gaxios@6.7.1         lock: optional: true
      │                    └─ uuid ^9.0.1 -> node_modules/uuid@9.0.1   lock: optional: true
      ├─ google-auth-library@9.15.1 -> gcp-metadata@6.1.1 -> gaxios ^6.1.1  (deduped)
      └─ google-auth-library@9.15.1 -> gtoken@7.1.0       -> gaxios ^6.0.0  (deduped)
```

Both sub-paths resolve to the **same two hoisted copies**. `node_modules/uuid` exists for
exactly one reason: `node_modules/gaxios@6.7.1`.

**Declaring packages and their exact ranges**

| Declarer | Declares |
| --- | --- |
| `firebase-admin@14.4.0` | `@google-cloud/storage: ^8.1.0` — in **`optionalDependencies`** |
| `@google-cloud/storage@8.2.0` | `gaxios: ^6.0.2` |
| `gaxios@6.7.1` | `uuid: ^9.0.1` |

For contrast, the non-vulnerable `gaxios@7.x` copies (`7.1.3`, `7.3.1`) arrive through the
`@google-cloud/firestore@9.2.0 -> google-gax -> google-auth-library@10.x/11.x` path and carry no
advisory.

---

## 5. Classification — optional, not production

All three packages are **optional**, not production, not development, and not tooling:

| Lock entry | `optional` | `dev` |
| --- | --- | --- |
| `node_modules/@google-cloud/storage` @ `8.2.0` | `true` | — |
| `node_modules/gaxios` @ `6.7.1` | `true` | — |
| `node_modules/uuid` @ `9.0.1` | `true` | — |

They are reachable **only** through `firebase-admin`'s **`optionalDependencies`**. npm's own
audit metadata places them in the **optional** bucket (120), separate from production (159) and
development (95).

---

## 6. Runtime reachability — not reached

**The affected chain is not imported by any Inventory AI runtime code.**

Every Firebase import in `server/src`:

```
server/src/services/firebase/adminApp.ts:33
  import { initializeApp, getApps, deleteApp, cert } from 'firebase-admin/app';

server/src/services/firebase/tokenVerifier.ts:37
  import { getAuth } from 'firebase-admin/auth';
```

* Inventory AI uses **Firebase Admin App and Auth** — **not Storage, not Firestore**.
* There is **no** import of `firebase-admin/storage`, `firebase-admin/firestore`, `getStorage`,
  or `getFirestore` anywhere in `src/`.
* There is **no** import of `@google-cloud/storage`, `gaxios`, `uuid`, or `google-auth-library`
  in `src/` or `test/`.

The two entry points actually used — `firebase-admin/app` and `firebase-admin/auth` —
authenticate through `google-auth-library@10.x -> gaxios@7.x`, which is **not** in the vulnerable
range. The vulnerable `gaxios@6.7.1` + `uuid@9.0.1` pair exists solely for the Storage subtree
the application never loads.

### 6.1 The vulnerable API is not invoked either

The advisory concerns `uuid` **v3 / v5 / v6 when a `buf` argument is supplied**. `gaxios` uses
**only `v4()` with no `buf`** — a single call site:

```
node_modules/gaxios/build/src/gaxios.js:63    const uuid_1 = require("uuid");
node_modules/gaxios/build/src/gaxios.js:417   const boundary = (0, uuid_1.v4)();
```

So even if the Storage subtree were exercised, the function named by the advisory would never
run. Reachability fails at **two independent levels**: the module is never loaded, and the
affected function is never called.

---

## 7. Why there is no safe non-downgrade fix

| Route | Availability | Compatible with current parent ranges? |
| --- | --- | --- |
| Upgrade `uuid` | fix at **>= 11.1.1** (latest `14.0.2`) | **No** — `gaxios@6.7.1` pins `uuid: ^9.0.1`; 11.x/14.x are out of range |
| Upgrade `gaxios` to 7.x | **`gaxios@7` removed the `uuid` dependency entirely** (`7.3.1`: `extend`, `node-fetch@^3.3.2`, `https-proxy-agent`) | **No** — `@google-cloud/storage` pins `gaxios: ^6.0.2` |
| Upgrade `@google-cloud/storage` | latest is **`8.2.0` (already installed)**; **8.x is the entire line** (`8.0.0`, `8.0.1`, `8.1.0`, `8.2.0`) and every 8.x declares `gaxios ^6.0.2`; **no 9.x exists** | **No** — no published Storage version pulls `gaxios` 7 |
| Upgrade `firebase-admin` | latest **`14.5.0`** still declares `@google-cloud/storage: ^8.1.0` | **No** — would not help even if a direct upgrade were permitted |
| **Downgrade `gaxios` to <= 6.3.0** | `6.3.0` has **no `uuid` dependency**; the vulnerable range begins at `6.4.0`, where `uuid ^9.0.1` was introduced | **Yes**, within `^6.0.2` — **but this is a downgrade** |

**Conclusion:** no remediation exists that avoids either a downgrade, an out-of-range
resolution, or an override.

---

## 8. npm's proposed remediation — recorded, NOT applied

`npm audit fix --dry-run` (which writes nothing) proposes exactly:

```
remove  uuid 9.0.1
change  gaxios 6.7.1 => 6.3.0
```

| Assessment | Verdict |
| --- | --- |
| Major upgrade? | **No** |
| **Downgrade?** | **YES** — `gaxios` `6.7.1` -> `6.3.0` |
| Override or unrelated change? | No — a single in-range package move; `fixAvailable` is a plain boolean (`true`), not an `isSemVerMajor` object |

Analytically this **would** clear both entries: `6.3.0` declares no `uuid` dependency, and it
sits below the vulnerable `6.4.0` boundary. The trailing audit report printed by the dry run
still lists the two findings only because a dry run writes nothing, so its re-audit reads the
unchanged on-disk tree.

**This proposal was not applied.** Downgrading a transitive package outside Inventory AI's
control is not an automatic change, and the rules in force for this decision explicitly
prohibited downgrades.

---

## 9. Accepted decision

**D-1 — the residual advisories are ACCEPTED AND DOCUMENTED.**

Rationale, in the order that matters:

1. The chain is **optional** — one advisory behind an `optionalDependencies` entry.
2. It is **unreachable**: no server source imports the Storage subtree.
3. The vulnerable API (`uuid` v3/v5/v6 with `buf`) is **never called** — `gaxios` calls `v4()`
   without `buf`.
4. The only available fix is a **downgrade**, which is not an acceptable automatic change.
5. Every upgrade route is blocked by a declared range Inventory AI does not own.

**D-2 — npm's downgrade is NOT TAKEN.**

**D-3 — `overrides` to force `uuid` 11.x and `npm audit fix --force` are REJECTED.**

### 9.1 Revisit triggers — this decision is not permanent

The acceptance **must be revisited** if **any** of the following becomes true:

* The dependency chain changes — for example `@google-cloud/storage` or `firebase-admin`
  republishes with a range that permits `gaxios` 7.x.
* The affected packages become **runtime-reachable** — any import of `firebase-admin/storage`,
  `firebase-admin/firestore`, `@google-cloud/storage`, `gaxios`, or `uuid` in `src/`.
* A **compatible non-downgrade security fix** becomes available (for example `uuid >= 11.1.1`
  reachable within a declared parent range, or a `gaxios` 6.x release that drops `uuid`).
* The advisory's severity is raised, or a new advisory is filed against the same packages.
* A future upgrade of `firebase-admin` or `@google-cloud/storage` is planned for any reason —
  the audit result must be re-checked as part of that work rather than assumed unchanged.

---

## 10. Evidence base (Phase 7, read-only)

All findings below were produced by **read-only** commands. No file was modified, no dependency
was installed, upgraded, downgraded, or removed, and no remediation was applied.

| # | Command | Result |
| --- | --- | --- |
| 1 | `npm audit` and `npm audit --json` | 2 moderate; `uuid` `<11.1.1`, `gaxios` `6.4.0 - 6.7.1` via `uuid` |
| 2 | `npm ls gaxios uuid` | `firebase-admin` -> `@google-cloud/storage` -> `gaxios@6.7.1` -> `uuid@9.0.1`; gaxios 7.x on the Firestore path |
| 3 | `npm explain gaxios` and `npm explain uuid` | all paths root at `firebase-admin@14.4.0`; entries marked **`optional`** |
| 4 | `npm ls --all` | exit 0 — tree matches declarations |
| 5 | Lockfile inspection | `optional: true` on `@google-cloud/storage`, `gaxios`, `uuid`; `@google-cloud/storage` listed in firebase-admin's `optionalDependencies` |
| 6 | Source grep of `src/` and `test/` | no imports of Storage, Firestore, `@google-cloud/storage`, `gaxios`, or `uuid` |
| 7 | `node_modules/gaxios/build/src/gaxios.js` | `require("uuid")` at `:63`; sole use `uuid_1.v4()` at `:417` |
| 8 | Registry queries via `npm view` | `gaxios` 6.0.2–6.3.0 have **no** `uuid` dependency; `6.4.0`+ require `uuid ^9.0.1`; `gaxios@7.3.1` has none; Storage 8.x = `8.0.0`, `8.0.1`, `8.1.0`, `8.2.0`, all `gaxios ^6.0.2`; no Storage 9.x; `firebase-admin@latest` = `14.5.0`, still `@google-cloud/storage ^8.1.0` |
| 9 | `npm audit fix --dry-run` | proposes `remove uuid 9.0.1` and `change gaxios 6.7.1 => 6.3.0` — **not applied** |

**Integrity after every check** (unchanged before and after): `server/package.json`
`c6f4e119…`, `server/package-lock.json` `56662566…`; `uuid@9.0.1` and `gaxios@6.7.1` still
installed; dependency tree unmodified.

**Production context.** The commit this baseline records (`6e2b00dd…`) deployed to Render as
deployment `dep-daufink9v7es73bisu9g` (status `live`), and its build log — running `npm ci`
against the committed lockfile — reports the same unchanged **`2 moderate severity
vulnerabilities`**. The advisory count is therefore identical in development and production.

---

## 11. Amendment log

| Date | Baseline | Change |
| --- | --- | --- |
| 2026-09-30 | `6e2b00dd` | Initial record — D-1 / D-2 / D-3, per the Phase 7 investigation. |
