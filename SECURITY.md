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

**Use GitHub's private vulnerability reporting.** It keeps the report private
until a fix is available:

> **https://github.com/nreffejzxc/ai-inventory/security/advisories/new**

This channel is **enabled on this repository** (verified by API readback, not
assumed). It is the only reporting channel offered.

**Do not open a public issue, discussion or pull request describing a
vulnerability**, and do not post exploit details anywhere public before a fix is
released.

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

- `main` is **protected**: the `server` and `mobile` checks are required, the
  branch must be up to date, pull requests are mandatory, force-pushes and branch
  deletion are blocked, and enforcement includes administrators.
- **Secret scanning and push protection** are enabled.
- **Dependabot alerts and security updates** are enabled, with a version-update
  configuration in [`.github/dependabot.yml`](.github/dependabot.yml).
