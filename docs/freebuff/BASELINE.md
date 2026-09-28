# BASELINE — FB-002 repository snapshot

> Audit record. **Not** architecture, **not** project history, **not** a specification.
> Authoritative sources: `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`, `CLAUDE.md`,
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
> This file records **what Freebuff observed**, not what the system should be.

---

## 1. Capture metadata

| Field | Value |
| --- | --- |
| Captured by | Freebuff (FB-002), before creating anything |
| Captured at | `2026-09-21T18:58:35Z` UTC — host-local `2026-09-22 02:58:35` (zone label as reported by the host) |
| Method | Read-only: `git branch --show-current`, `git rev-parse HEAD`, `git status`, `git status --short`, `git diff --stat`, `git diff --name-only`, `sha256sum` of the five protected files, `ls docs/freebuff` |
| Mutations before capture | none |
| Classification | `SOURCE-CODE OBSERVATION` / repository state (not a policy statement) |

## 2. Identity

| Field | Value |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` |
| HEAD (full) | `d8b693a43fa778c984301656d437b087f5e0a5bc` |
| HEAD (short) | `d8b693a` |
| HEAD subject | `feat: establish firebase account linking boundary (Phase 32H)` |
| Project milestone | **Phase 32H** — the Firebase account-linking boundary (`CLAUDE-CODE / HISTORICAL`) |
| Next phase | **Not formally defined.** The repository contains no Phase 32I scope — only statements that 32I/32J/32L were **not started**. Freebuff must not infer the next phase |

## 3. Protected working-tree entries and their baseline hashes

**Inherited, intentional, immutable.** Not modified, formatted, normalized, staged, reset, restored,
stashed, renamed or deleted without explicit approval.

| Path | Status | SHA-256 at FB-002 baseline |
| --- | --- | --- |
| `mobile/eas.json` | modified, unstaged | `10c5ff2e5c1a719ea330fa8bec74bb7d1770efb9070c24b043180ea35d7bd530` |
| `server/src/services/ai/providers/http.ts` | modified, unstaged | `23e91610151bceebe45b42019ce7b8013400e09dcc191b53bb18582ddda1a213` |
| `server/test/phase06-ai-wire.test.mjs` | modified, unstaged | `83767f8b5045048cce8f677759d7ea4fed3ce1c32eb23a83396c3b11122d0768` |
| `docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md` | **untracked** | `52d3afef6917640915ba08aba2fe226fba647cdb59be0ce4ac5a70cd10625891` |
| `docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md` | **untracked** | `d000a5d3ac2589cccb337b67ebf2f77ba088f59e123465695cdaf3e7fe63c297` |

**Why hashes and not just `git status`:**

1. `git status`/`git diff` cannot report a content change to a protected **untracked** file
   (entries 4 and 5 above) — hash comparison detects it.
2. Git emits a line-ending warning for the three tracked entries (`LF will be replaced by CRLF the
   next time Git touches it`). Any operation that "touches" them could rewrite every line and bury a
   real diff; hashing is the only reliable integrity check.
3. Hash comparison distinguishes "Freebuff changed this" from "the environment normalised line
   endings", which matters for the unexpected-change rule (unplanned diff => STOP and report).

Re-check procedure used before/after every task:

```
sha256sum mobile/eas.json server/src/services/ai/providers/http.ts \
  server/test/phase06-ai-wire.test.mjs \
  docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md \
  docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md
```

## 4. Working-tree snapshot at baseline

```
git status --short
 M mobile/eas.json
 M server/src/services/ai/providers/http.ts
 M server/test/phase06-ai-wire.test.mjs
?? docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
?? docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md

git diff --stat
 mobile/eas.json                          |   2 +-
 server/src/services/ai/providers/http.ts |  50 ++++++++++++----
 server/test/phase06-ai-wire.test.mjs     | 100 ++++++++++++++++++++++++++++++-
 3 files changed, 137 insertions(+), 15 deletions(-)

git diff --name-only
 mobile/eas.json
 server/src/services/ai/providers/http.ts
 server/test/phase06-ai-wire.test.mjs
```

- Nothing is staged. `docs/freebuff/` did not exist.
- **The content of the three protected diffs was not read by Freebuff** — only their `--stat`. Their
  intent is therefore `AUTHORSHIP UNKNOWN` and their content is out of scope for every Freebuff task
  unless Jeffern explicitly authorizes reading them.
- Git also reports the local branch `main` at `ad26d60` (ahead of `origin/main` by 5) and
  `agent/phase-32e-firebase-auth` at the same commit as the current branch. Freebuff performed no
  branch operation.

## 5. Environment observations

| Observation | Value | Confidence |
| --- | --- | --- |
| OS | Windows (`win32`) | `SOURCE-CODE OBSERVATION` |
| Shell used by tooling | bash (Git Bash semantics: POSIX syntax, `sha256sum`, `date`) | observed |
| Line-ending hazard | Git warns `LF will be replaced by CRLF` for the three tracked protected files | observed |
| Tooling availability | A vendored `ripgrep` invocation failed with `ENOENT` on the host during both FB-001 and the FB-001 onboarding pass. Absolute host paths are deliberately **not** recorded | observed |
| Node runtime | not executed by Freebuff; `server/package.json` declares `engines.node >= 24` | `DOCUMENTED FACT` (manifest), runtime **NOT VERIFIED BY FREEBUFF** |
| Clock | Host clock read at capture: `2026-09-21T18:58:35Z`; host-local zone label reported as `MPST` | observed |

No environment variable values, credentials or secret material were read or recorded.

## 6. Documentation map (paths only — Freebuff does not restate their content)

| Path | Role (per the document itself) |
| --- | --- |
| `CLAUDE.md` | Project instructions and phase index |
| `README.md` | Project status, endpoints, phase status list |
| `docs/SYSTEM_SPECIFICATION.md` | Primary specification |
| `docs/DEVELOPMENT_ROADMAP.md` | Phase order, shipped record, risk/decision records |
| `docs/DESIGN_SYSTEM.md` | Mobile design system + adoption status |
| `docs/TS-MIGRATION-MANIFEST.md` | Server TypeScript campaign record |
| `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` | Firebase design authority (§14 / §14A / §14B) |
| `docs/superpowers/plans/*.md` | Phase 18 planning documents (2 untracked — protected) |

## 7. Source and test areas (paths only)

- **Server:** `server/src/{app.ts,index.ts}`, `config/`, `constants/`, `controllers/`, `middlewares/`,
  `models/`, `routes/`, `services/`, `utils/`; scripts `server/scripts/{run-tests.mjs,check-module-graph.mjs}`.
- **Server tests:** `server/test/` — 45 `*.test.mjs` plus `helpers.mjs`, `support.mjs`, `testEnv.mjs`,
  `sourceFiles.mjs`, `fakes/`.
- **Mobile:** `mobile/app/` (expo-router), `mobile/components/`, `mobile/hooks/`, `mobile/lib/`,
  `mobile/__tests__/` (15 jest suites).
- **Firebase boundaries (owned by Claude Code; frozen for Freebuff without explicit approval):**
  `server/src/services/firebase/*`, `server/src/services/firebaseAuth.service.ts`,
  `server/src/services/firebaseLink.service.ts`, `server/src/controllers/firebaseAuth.controller.ts`,
  `server/src/config/firebase.ts`, `server/src/middlewares/authenticate.ts`, `server/src/config/jwt.ts`,
  `server/src/models/{user,session}.model.ts`, `server/src/services/auth.service.ts`,
  `server/src/routes/auth.routes.ts`, `server/src/constants/roles.ts`, `mobile/lib/firebase*.ts`.

## 8. Known warnings, defects and open items (references, not restatements)

- **Known warnings:** the LF→CRLF warning above.
- **Known open items / unresolved decisions:** recorded by the project in
  `docs/SYSTEM_SPECIFICATION.md` §29 ("Open Items") and in
  `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14A.5 (`O-1` … `O-11`). Freebuff lists
  their **existence and location only**; it does not restate or decide them. Two recorded verification
  gates remain unverified by the project (`auth:import` bcrypt support; React Native Firebase config
  plugin on the current Expo SDK).
- **Known documentation/source drift:** recorded as observations in `DECISIONS.md`
  **FB-D-101 … FB-D-111**, with the evidence path for each. **None was corrected, and none is a
  Freebuff task.**

## 9. Package / dependency state (observed, names and versions only)

| Side | Observed | Notes |
| --- | --- | --- |
| Server | `server/package.json` — `"type": "module"`, `"main": "src/index.ts"`, `engines.node >= 24`, scripts `start = node src/index.ts`, `test`/`test:unit`/`test:db`, `lint`, `typecheck`, `check:extensions`, `check:specifiers`; deps incl. express 5, mongoose, jsonwebtoken, bcryptjs, helmet, cors, express-rate-limit, dotenv, `firebase-admin` | `SOURCE-CODE OBSERVATION`. No dependency was installed, removed or upgraded by Freebuff |
| Mobile | `mobile/package.json` — Expo SDK 57, React Native 0.86.3, React 19.2.3, expo-router, expo-dev-client, `firebase` (JS SDK), TypeScript, jest + jest-expo + @testing-library/react-native; `expo-updates` **absent** | `SOURCE-CODE OBSERVATION`; deprecation/advisory status **NOT VERIFIED BY FREEBUFF** |

**Dependency lock (Freebuff rule):** dependencies are frozen. Any task that appears to need an
install/uninstall, a `package.json`/lockfile change, or an Expo/React Native/Firebase/Mongoose/Express
version change must **STOP** and explain before acting.

## 10. Test baseline

See `TEST_BASELINE.md` for the full inventory, mode classification and provenance. Summary at this
baseline: **45** server test files and **15** mobile test files, all `PRE-EXISTING`. **Freebuff has
executed none of them**, created none, and modified none.

## 11. Historical context index — `CLAUDE-CODE / HISTORICAL`

For orientation only. **One line per milestone, each attributed to the document it came from.** This
is an index of pointers, not a history and not an architecture summary.

| Milestone group | Source of the claim |
| --- | --- |
| Phases 00–06 (foundation → DB → auth → inventory → mobile → read-only AI) | `README.md` "Phase Status"; `docs/DEVELOPMENT_ROADMAP.md` §3 |
| Phases 07–08 (hardening increments, logging, lint baseline) | `README.md` "Phase Status"; `CLAUDE.md` §7 |
| Phases 10–11 (commercialization groundwork; inventory intelligence) | `README.md` "Phase Status"; `docs/DEVELOPMENT_ROADMAP.md` §13/§14 |
| Phases 12–13, 14A, 15–17 (barcode, suppliers/POs, users API, account security, audit viewer, mobile PO mgmt) | `README.md` "Phase Status"; `docs/SYSTEM_SPECIFICATION.md` §48; `CLAUDE.md` §7 |
| Phases 18A–18F (design system + adoption) | `README.md` "Phase Status"; `docs/DESIGN_SYSTEM.md`; `CLAUDE.md` §7 |
| Phases 19–21 (transfers, performance cascade, archive-only invariant) | `README.md` "Phase Status"; `CLAUDE.md` §7 |
| Phases 22–25 (authorization contract, runtime matrix, design tokens) | `README.md` "Phase Status"; `CLAUDE.md` §7 |
| Phases 26A–29 (sessions, recovery, mobile recovery, B1 hardening, decision record) | `README.md` "Phase Status"; `docs/DEVELOPMENT_ROADMAP.md` §27B/§27D/§27E; `CLAUDE.md` §7 |
| Phases 30A, 32A–32H (EAS foundation, Firebase design → exchange → mobile → linking boundary) | `README.md` "Phase Status"; `docs/DEVELOPMENT_ROADMAP.md` §27J/§27K; `CLAUDE.md` §7 |
| Current milestone: Phase 32H at `d8b693a` | `git log` (read-only) |

## 12. Baseline integrity rules

1. The five protected entries in §3 are byte-verified before and after every task; a hash delta or a
   `git status` appearance is a **STOP** condition, not something to revert.
2. Any file created by Freebuff is recorded in `MASTER_LOG.md` and the owning task record, and is
   listed in `HANDOFF.md` separately from the protected entries.
3. This baseline is not edited. New captures are recorded as new dated sections or new task records
   (append-oriented), so the comparison history survives.

---

## 13. SUPERSEDING CLARIFICATION — status of this baseline (2026-09-28)

> **Appended under §12 rule 3.** Nothing above this line is edited, re-hashed, normalized or removed.
> This note exists so the historical **FB-002** capture is not mistaken for the present repository state.

- **§1–§12 remain historical FB-002 snapshot evidence**, captured `2026-09-21T18:58:35Z` on branch
  `experiment/freebuff-evaluation` at HEAD `d8b693a`. Their branch, HEAD, status and test-count values
  describe that date and are preserved as evidence. They are **not** corrected here.
- **The §3 SHA-256 register is historical and MUST NOT be read as the current protected-file
  register.** Later **authorized** commits legitimately changed **all five** of the recorded values:
  - `server/src/services/ai/providers/http.ts` — **line-ending difference only**; the value recorded in
    §3 still equals the file's *content* hash.
  - `server/test/phase06-ai-wire.test.mjs` — an authorized later content change.
  - `docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md` — authorized Phase 1 change.
  - `docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md` — authorized Phase 1 change.
  - `mobile/eas.json` — **matched its historical hash when this note was written**; **Phase 4A (`d309252`) then legitimately changed its content** (the EAS `production` `EXPO_PUBLIC_API_URL` placeholder was replaced with the Render origin), so the §3 value is historical. Current git blob: `9060e8c3a120984d88530dcfb3284eeb43f66a74`.
- **§12 rule 1's STOP condition belongs to this historical snapshot.** A hash delta caused by a later
  authorized commit is expected drift, not unexplained tampering; the rule guards *unexplained* change
  against the capture it was taken from.
- **Current protected-file integrity is maintained in
  `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §32/§38** — not in §3 of this file.
- **`docs/freebuff/HANDOFF.md` is the living current-state document.** Read it, not this baseline, for
  present Git/branch/commit state and current protected-file status.
