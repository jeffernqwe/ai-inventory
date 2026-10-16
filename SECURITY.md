# Security Policy

Inventory AI is a multi-tenant inventory management system: a React Native app, an
Express/MongoDB API, and a read-only AI assistant. This file says how to report a
security problem in it, what is in scope, and what is already known and open.

---

## Supported versions

There are **no tagged releases or GitHub Releases yet**. The `main` branch is the
only supported version, and fixes land there. A report against an older commit
will be answered by checking whether that behaviour still exists on `main`.

---

## Reporting a vulnerability

**Open an issue in this repository.** The repository is **private**, so its issues are
visible only to people who already have access to the code — a report filed there is
not public disclosure. That is the reporting channel, and the code is shared with the
people expected to use it.

**If you do not have access to the repository**, contact the maintainer at the address
recorded in this repository's commit metadata, or through whatever channel you were
already contacted by.

> **Why this replaced GitHub's private vulnerability reporting.** That feature was
> available and enabled while this repository was public. On a **private** repository it
> is not available on this plan — the endpoint answers `404` — so the instruction was
> rewritten rather than left pointing at a page that no longer exists. Recorded in
> `docs/DEVELOPMENT_ROADMAP.md` §27AE.

**Do not disclose a vulnerability publicly** — no public fork, gist, blog post, social
post or package — before a fix has shipped.

### What a useful report contains

1. **What and where** — the component (`server/` or `mobile/`), the endpoint,
   screen or file, and the affected commit or branch.
2. **Reproduction** — the smallest sequence of steps or request that shows the
   problem.
3. **Impact** — what an attacker gains. Please say explicitly whether it crosses
   a tenant boundary, escalates a role, bypasses authentication, or exposes
   credentials or personal data.
4. **Evidence** — a request/response pair, a log excerpt, or a screenshot, with
   **your own secrets redacted**.

### What never to send

- Real credentials, API keys, tokens or password hashes.
- Production data, or data belonging to a business you do not own.
- Anything obtained by accessing another tenant's data.

Use an account and business **you own**, on a local or test environment where
possible.

---

## In scope

- **Server authentication and sessions** — Firebase ID-token exchange, the
  Inventory AI JWT and server-side session records, logout, per-session
  revocation, sign-out-everywhere and session renewal.
- **Authorization and RBAC** — role/permission enforcement, the server as the
  only security boundary, and any route that can be reached without the
  capability it requires.
- **Business (tenant) isolation** — any path that returns or mutates another
  business's data, or that trusts a client-supplied `businessId`.
- **Account recovery and verification** — password reset, email verification,
  token handling and the enumeration-resistance of those flows.
- **The AI boundary** — anything that lets the assistant read outside the
  caller's business, act as a write path, or reach the database other than
  through its server-side read-only tools.
- **Mobile client** — credentials reachable from the app bundle or device
  storage, session handling, and deep-link handling for reset and verification
  links.
- **Repository and CI** — secret exposure in workflow definitions, or a
  workflow that could be made to run untrusted code with credentials.

## Out of scope, or already known and open

The project keeps a full, candid security record at
[`docs/AUTH_SECURITY_MASTER_CHECKLIST.md`](docs/AUTH_SECURITY_MASTER_CHECKLIST.md).
The following are **already recorded, and are not withheld findings** — please
read them before reporting:

| Item | State |
| --- | --- |
| **B1** — a residual timing term on the password-reset request path (the outbound send is detached, but the database work remains) | **Accepted for V1 and deferred**; partially mitigated, explicitly **not** closed |
| **B2** and **E3** — shared-store work for rate limiting and related infrastructure | **Deferred to V4**; open |
| **OD-10** — deriving the credential-change marker server-side instead of from the device-local marker | **Deferred by owner decision**; not implemented |
| **L-17** — reset/verification email **delivery** has never been inspected end-to-end against a real mailbox | Open; a mail-provider delivery issue is not a code vulnerability |
| A dependency-level **PII logging** finding noted in that checklist | Open |
| Four dependency advisories in the **mobile** lockfile — `braces`, `node-forge` (high), `sprintf-js`, `decode-uri-component` (medium) | Open; **no applicable fix exists today**. Three have no published patched release at all (each one's `latest` is inside its own vulnerable range), and `decode-uri-component`'s published fix **cannot be installed** — it is ESM-only against a CommonJS consumer, and applying it breaks the app's deep-link query parsing. All four are transitive dependencies of the mobile build/tooling chain, and their advisories need attacker-controlled input to a build tool — except the deep-link decode, which is **inside the shipped apps** (measured from the production Android and iOS source maps; the other three are in neither bundle) and whose cost is a hang, with no data exposure. Recorded in full with the reproduction in roadmap **§27CJ** |

Also out of scope: reports that require a rooted or jailbroken device, physical
access to an unlocked device, or a modified client build, unless they
demonstrate a server-side impact. Missing security headers alone, and automated
scanner output without a demonstrated impact, will be closed with an explanation
rather than a fix.

---

## Rules for testing

Good-faith research is welcome on these terms:

- **Only against accounts you own.** Never test against another person's account,
  business or data.
- **If you reach data you do not own, stop.** Report it immediately instead of
  exploring further, and do not download, retain or share it.
- **No denial of service**, load or stress testing, or automated scanning that
  degrades the service for anyone.
- **No social engineering** of the maintainer, hosting provider or any third
  party, and no physical attacks.
- Work from your own fork or local environment where the issue can be shown
  there.

There is **no bug-bounty programme and no payment** for reports.

---

## What to expect

Reports are triaged on a **best-effort basis**. There is no guaranteed response
time and no service-level agreement; the target is an initial acknowledgement
**within five business days**.

You will be told whether the report is accepted, and updated when a fix ships.
Credit in the advisory is offered if you want it, and withheld if you prefer.

---

## Repository controls, for reference

These are verifiable settings on this repository, not claims:

- The repository is **private**.
- The `ci` workflow runs the `server`, `mobile` and `secret-guard` jobs on every pull request
  and every push to `main`. Pull requests are how work is landed here, but this is a
  **convention, not an enforced control**: `main` cannot be protected on a private repository at
  this plan level, and the `main-guard` workflow that used to flag a direct push was **removed on
  2026-10-09** as part of keeping the workflow minimal (docs/DEVELOPMENT_ROADMAP.md §27AE).
- **Dependabot alerts and security updates** are enabled, with version-update
  configuration in [`.github/dependabot.yml`](.github/dependabot.yml).
- **`scripts/check-secrets.mjs`** scans every tracked file for credential-shaped content
  on each CI run, replacing the GitHub-side scanner (see below).

**Four protections this repository does NOT have, stated plainly:**

1. **Branch protection is unavailable on this plan for a private repository** — the API
   answers `403 Upgrade to GitHub Pro`. The checks therefore **report** rather than
   **gate**: nothing stops a merge past a red check, and nothing flags a direct push to
   `main`. Making the repository public or upgrading the plan restores enforcement
   (roadmap §27AE).
2. **GitHub secret scanning and push protection are unavailable here** for the same
   reason; `scripts/check-secrets.mjs` is the replacement. It is pattern matching over
   tracked files, so it cannot see a credential that is split, encoded or assembled at
   runtime.
3. **Forking cannot be switched off** on a personal (non-organization) private
   repository — GitHub answers `422 Allow forks setting can only be changed on org-owned
   private repositories`. Nobody outside the repository can fork it, but anyone granted
   access could. Moving the work into a GitHub Organization is the fix, and it is
   recommended in [`docs/SOURCE_PROTECTION.md`](docs/SOURCE_PROTECTION.md).
4. **No automated check watches the repository's visibility or its access list.** A daily
   monitor (`access-guard.yml`) existed briefly and was **removed on 2026-10-09** to keep
   the workflow minimal, so an accidental change of visibility or a new collaborator is
   noticed by nobody until someone looks. The replacement is a manual, one-command check —
   `node scripts/audit-access.mjs` — and it is worth running before anything that touches
   repository settings (roadmap §27AF).
