# Source Protection & Intellectual Property

How the Inventory AI source is protected, what that actually prevents, and what it does not.
"Nobody can copy my code" is not a state a software project reaches; the achievable goal is to raise
the cost, narrow the audience, and make the remaining exposure visible rather than assumed.

Measured against the live repository and the GitHub API on **2026-10-09**. The dated record is
[`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) §27AE and §27AF.

---

## 1. Posture, measured

| Property | State |
| --- | --- |
| Visibility | **Private** |
| Who can read it | The owner account only — one collaborator, `admin`; no pending invitations |
| Deploy keys / webhooks / Actions secrets / environments | **None** — no credential exists inside GitHub for this repository |
| Forks | **0** |
| Traffic, last recorded window | 24 clones / 3 unique cloners, 244 views / 1 unique viewer — consistent with the owner's machines and CI |
| Credentials in history | **None found** — no `.env`, keystore, `.pem`, `.p12`, `google-services.json` or service-account file was ever committed; no provider token pattern matched |
| Licence | Proprietary, all rights reserved ([`LICENSE`](../LICENSE)) |
| Default `GITHUB_TOKEN` | Read-only; workflows cannot create or approve pull requests |
| Actions | Pinned to full commit SHAs (re-pinned to v7 on 2026-10-11), so an upstream tag move cannot change what CI runs |

`.env`, `server/.env` and `mobile/.env` hold real credentials and are all git-ignored and untracked.

### Two things the API would not answer

Both are owner-side, and both are the weakest links until checked in the UI:

1. **Two-factor authentication.** `GET /user` returned `two_factor_authentication: null` for the
   token used, so it could not be confirmed. If 2FA is off, nothing else on this page matters — the
   account is the single door.
2. **Which GitHub Apps can reach this repository.** `GET /user/installations` needs an App token
   (`403`), and `GET /repos/…/installation` needs an App JWT. A hosting or CI app with this
   repository selected holds its own credential and is not a collaborator. Read it in **Settings →
   Applications**, and narrow the Render integration to the repositories it needs.

### The audit is manual, by decision

A scheduled `access-guard` workflow was written, ran green, and was removed on 2026-10-09 along with
`main-guard`, to keep the workflow set minimal: branch protection, rulesets and secret scanning are
unavailable at this plan level, so unattended detection bought little. What remains is
[`scripts/audit-access.mjs`](../scripts/audit-access.mjs):

```bash
node scripts/audit-access.mjs     # PASS / FAIL / INFO against the live API
```

One dependency-free command, non-zero exit on any violation, names only and never a secret value, and
it lists the settings it could not read so their absence stays visible. **Nothing schedules it, so
when it runs is a habit, not a control.**

---

## 2. The public window

The repository was made public on **2026-10-09** to unlock free branch protection, then made private
again the same day — roughly a **90-minute** window, and the most important caveat in this document.

- **What is known:** no fork exists; no visible clone network exists; the source has been private
  since.
- **What cannot be known:** GitHub's traffic API lags ~2 days, so its last recorded day (2026-10-07)
  does not cover the window, and a clone leaves no permanent record the way a fork does. Public
  repositories are also mirrored by third parties without notifying anyone.

**The honest conclusion: it cannot be established that no copy was taken.** Re-check with:

```bash
gh api repos/nreffejzxc/ai-inventory/traffic/clones --jq '{clones:.count, uniques:.uniques}'
gh api repos/nreffejzxc/ai-inventory/forks --jq 'length'
```

Unique cloners above the owner's machines and CI is the signal to rotate credentials and treat the
code as disclosed. A disclosure is a business fact; nothing in the repository can undo it.

---

## 3. What protects it

| Lever | Strength |
| --- | --- |
| **Private repository** — removes the clone path, web UI, indexing and public CI logs | **High**; the main control |
| **Server-side secrets only** — AI keys, Mongo credentials, mail keys and Firebase admin credentials never reach a client | **High**; enforced by architecture |
| **Server-side tenant isolation and RBAC** — a stolen client cannot read another business's data | **High** |
| **Proprietary licence** — copying is a licence breach, not a grey area | Legal, not technical |
| **`scripts/check-secrets.mjs` in CI** — fails a credential-shaped string; every rule carries a canary, so a rule that stopped matching fails the job instead of passing silently | Medium; pattern matching, not proof |
| **`scripts/audit-access.mjs`** | Medium; manual, so only as current as its last run |
| **Pinned action SHAs** | Medium; supply chain only |
| **The protected-file register** — five paths whose contents must not change by accident | **Manual.** The register and its git blob hashes are in [`AUTH_SECURITY_MASTER_CHECKLIST.md`](AUTH_SECURITY_MASTER_CHECKLIST.md) §8; **no script verifies them**, so the check happens only when someone runs it |

### Deliberately not done

- **No obfuscation of the mobile bundle.** Release builds are minified and use Hermes bytecode
  already; an obfuscator raises the bar marginally, costs build reliability, and creates false
  confidence. **Anything shipped to a device can be read.** The durable answer is to keep valuable
  logic on the server.
- **No repository splitting.** Real overhead, worth doing when the first external collaborator
  appears, not before.

---

## 4. What cannot be prevented

1. **A distributed client can be reverse-engineered** — assume the client's logic is public.
2. **A copy taken during the public window cannot be recalled.**
3. **Owners and insiders are inside the trust boundary** — least privilege and revocation are the
   only controls.
4. **A compromised machine or token is not a repository problem** — the ignored `.env` files hold
   live credentials.
5. **Private is not encrypted** — GitHub's operators, and anything holding the account's credentials,
   can read it.
6. **No technical measure enforces a licence.**
7. **Enforcement is missing at this plan level**: branch protection needs GitHub Pro on a private
   repo, so CI *reports* rather than gates and a direct push to `main` is neither prevented nor
   flagged. There is no secret scanning either.
8. **Forking cannot be switched off** on a personal private repo (`422 … only on org-owned private
   repositories`). Nobody else can fork it today — a fork needs read access — but a future
   collaborator could.
9. **Nothing notices on its own.** A changed visibility, a new collaborator, a deploy key or a
   webhook is discovered only when the audit is run.
10. **GitHub Apps are outside every CLI check.** Reviewing that list in the UI is the single most
    likely way access is granted without the audit noticing.

---

## 5. What to do, in order

**Now**

1. **Turn on 2FA with a hardware key** for GitHub, Render, MongoDB Atlas, Firebase, Brevo and the app
   stores; keep recovery codes offline. This protects more than everything else here.
2. **Review the Render and any CI integration's repository access** (§1).
3. **Do not make the repository public again.** If enforcement is wanted, GitHub Pro ($4/month)
   restores protected branches on a private repo.
4. **Keep three backups that are not the same account**: the working clone, an encrypted offline
   `git bundle`, and a second private remote. A bundle *is* the source code — encrypt it.
5. **Treat any committed credential as already leaked**: rotate first, clean history second.

**Before the first collaborator**

6. Put the access terms in writing (NDA + IP assignment), grant the minimum role with an end date,
   and rotate everything that person could see when the engagement ends.
7. Move the work into a GitHub Organization: org-owned private repos can disable forking, teams give
   least privilege, and the audit log records access changes.

**As it scales**

8. Keep the valuable logic server-side and the client a thin shell.
9. Trademark the name; keep dated authorship evidence.
10. Review access quarterly — `node scripts/audit-access.mjs`, plus the two things it cannot read
    (GitHub Apps, account tokens and SSH keys) and the Dependabot queue.
11. Assume compromise and design for recovery: scheduled rotation, monitored audit trail, and the
    ability to rebuild without the original account.

---

## 6. Related

- [`SECURITY.md`](../SECURITY.md) — reporting a vulnerability and what is in scope.
- [`AUTH_SECURITY_MASTER_CHECKLIST.md`](AUTH_SECURITY_MASTER_CHECKLIST.md) §8 — protected
  working-tree entries and the project's git change-safety rules.
- [`LICENSE`](../LICENSE) — the proprietary terms.
