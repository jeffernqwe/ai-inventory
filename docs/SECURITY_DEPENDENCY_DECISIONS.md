# Security Dependency Decisions

**Status:** living decision record · **Re-measured 2026-10-26** at `main`

An advisory that is not being fixed is **named, evidenced and dispositioned**, never left implied.
This file covers dependency advisories only; application security decisions are in
[`AUTH_SECURITY_MASTER_CHECKLIST.md`](AUTH_SECURITY_MASTER_CHECKLIST.md), and dated measurements in
[`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) §27AK, §27CA, §27CJ, §27FJ.

Four questions stay separate for every item, because collapsing them is how an accepted risk becomes
an unexamined one: does a vulnerable package exist · is it a production dependency · is it reachable
from application runtime code · is the vulnerable API actually called.

---

## 1. Current result

| Tree | `npm audit` | Distinct advisories |
| --- | --- | --- |
| `server/` | **0** | 0 |
| `mobile/` | **6 entries, 2 advisories — both high, 0 critical** | `zod`, `node-forge` |

The server tree is clean. The two moderates it carried in September (`uuid@9.0.1` and the
`gaxios@6.7.1` edge that pulled it in, GHSA-w5hq-g745-h8pq) are **gone**, closed by the
`firebase-admin` line moving past the vulnerable `gaxios`; the decision that accepted them is
therefore closed rather than still standing.

The six mobile entries are **two advisories seen through their dependents** — `expo`,
`@expo/cli`, `expo-updates` and `@expo/code-signing-certificates` are reported because they carry a
vulnerable package, not because each has its own defect.

---

## 2. The two open advisories

| Advisory | Severity | Installed | Pulled in by | Patched |
| --- | --- | --- | --- | --- |
| **GHSA-mrhx-c7xc-m3w5** — `zod` exhausts memory validating an oversized array against a length-unconstrained schema (CWE-770) | high, 7.5 | `3.25.76`, nested at `mobile/node_modules/expo/node_modules/zod` | `expo@58.0.19 → @expo/cli@58.1.15`, which declares `zod: ^3.25.76` | `>= 4.6.6` |
| **GHSA-86w9-cpqp-85rv** — `node-forge` accepts extra nested `DigestAlgorithm` elements when verifying RSA PKCS#1 v1.5 signatures (CWE-347) | high, 7.5 | `1.4.0` | `expo-updates@58.0.18 → @expo/code-signing-certificates@0.0.7`, which declares `node-forge: ^1.4.0` | **none published** — 1.4.0 is both the newest release and inside `<= 1.4.0` |

**Neither is reachable from application code.** Measured on this tree, not assumed:

- No file under `mobile/app`, `mobile/lib`, `mobile/components` or `mobile/hooks` imports or requires
  either package.
- `node-forge` is required only by `@expo/code-signing-certificates/build/main.js`, a build-time
  consumer of `expo-updates`' signing tooling — not a module the app loads at runtime.
- The vulnerable `zod` is **nested inside `expo/node_modules`** for the CLI. The top-level `zod` is
  `4.6.7`, which is already outside the advisory's range; the CLI cannot use it because it declares a
  3.x range.

---

## 3. Decisions

| ID | Decision | State |
| --- | --- | --- |
| **D-4** | **Both open mobile advisories are ACCEPTED AND DOCUMENTED** as residual highs. No remediation is applied. | **ACCEPTED** |
| **D-5** | **`npm audit fix` is NOT run.** Its proposal is `expo@54.0.38` — a **downgrade of four SDK majors** from the installed 58.0.19. That is not a fix; it would replace the whole supported SDK line with an older one. | **REJECTED** |
| **D-6** | **npm `overrides` are NOT used** to force `zod` 4.x into `@expo/cli` or to replace `node-forge`. Both would install a dependency the parent never declared, against a consumer that has not been tested with it. | **REJECTED** |
| **D-7** | The decision is **watched, not remembered**. `scripts/check-upgrade-watches.mjs` carries `zod (advisory)` and `node-forge (advisory)` and reports the gate each one needs to open. | **ACTIVE** |

The reasoning is the same for both: the vulnerable API is never invoked by application code, the
package is confined to build tooling, and every available "fix" trades a non-exploitable advisory for
a change that could break the Expo toolchain the app is built with. **A dependency upgrade for a
non-reachable advisory is a real risk taken to remove a theoretical one.**

---

## 4. When this is revisited

The acceptance ends automatically when any of these becomes true — the watch script reports the first
two:

1. **`@expo/cli` admits `zod >= 4.6.6`** in a published release (then the normal SDK patch train is
   enough, no override).
2. **A `node-forge` release is published outside `<= 1.4.0`** *and* `@expo/code-signing-certificates`
   admits it.
3. **Either package becomes runtime-reachable** — any import in app source, or a new consumer that
   loads it in the shipped bundle.
4. **The advisory is raised in severity**, or a new advisory names the same package.
5. **An Expo SDK upgrade is planned for any reason** — re-run the audit as part of that work rather
   than assuming the count is unchanged.

Watch the gate rather than the number: `npm audit` on `mobile/` counts **dependents** as well, so its
6 entries are not 6 distinct defects.

---

## 5. Evidence

Read-only commands; none of them writes, installs or removes anything.

| # | Command | Result |
| --- | --- | --- |
| 1 | `npm audit --json` in `server/` | `{low:0, moderate:0, high:0, critical:0, total:0}` |
| 2 | `npm audit --json` in `mobile/` | `{low:0, moderate:0, high:6, critical:0, total:6}` — the two advisories above |
| 3 | `npm ls zod node-forge` | `zod@3.25.76` nested under `expo`; `node-forge@1.4.0` under `@expo/code-signing-certificates` |
| 4 | Source grep of `app/`, `lib/`, `components/`, `hooks/` | no import of either package |
| 5 | `grep -rln node-forge node_modules/@expo/code-signing-certificates/build` | one file, `main.js` — a build-time consumer |
| 6 | `node scripts/check-upgrade-watches.mjs` | both advisory gates `DEFERRED`, with the exact release each needs |

No credential, token or secret value appears in this record.
