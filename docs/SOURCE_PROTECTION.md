# Source Protection & Intellectual Property

How the Inventory AI source is protected, what that protection **actually** prevents,
what it does **not**, and what to do as the product grows toward production.

This document exists because "nobody can copy my code" is not a state a software project
can reach. What can be done is to raise the cost, narrow the audience, and make the
remaining exposure visible instead of assumed. Everything below was verified against the
live repository and GitHub API on **2026-10-09**; the raw evidence is kept in
`docs/DEVELOPMENT_ROADMAP.md` §27AE and `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §42.

---

## 1. Current posture, measured

| Property | State | How it was established |
| --- | --- | --- |
| Visibility | **Private** | `GET /repos/{owner}/{repo}` → `visibility: private` |
| Who can read it | **The owner account only** | collaborators API returns exactly one login, with admin |
| Deploy keys | **None** | `GET /repos/…/keys` → empty |
| Webhooks | **None** | `GET /repos/…/hooks` → empty |
| CI/vault secrets in GitHub | **None** | `GET /repos/…/actions/secrets` → empty; the workflows need no repository secrets |
| Forks | **0** (`network_count: 0`) | forks API; nobody copied it through GitHub |
| Clones (recorded window) | 24 clones / 3 unique cloners | traffic API — consistent with the owner's own machines and CI |
| Credentials in history | **None found** | full-history scan over every reachable blob: no `.env`, keystore, `.pem`, `.p12`, `google-services.json` or service-account file was **ever** added, and no provider token pattern matched |
| Licence | **Proprietary, all rights reserved** | [`LICENSE`](../LICENSE) |

Three local files hold real credentials and are all **git-ignored and untracked**:
`.env`, `server/.env`, `mobile/.env`. Nothing sensitive is tracked.

### Owner-only access audit, 2026-10-09

A second pass asked a narrower question: is the owner really the only human who can
reach this source? Every line below was read from the live API, and anything that could
not be read says so.

| Surface | Finding |
| --- | --- |
| Collaborators | **Exactly one account** — the owner, with `admin` |
| Pending invitations | **None** |
| Deploy keys | **None** |
| Webhooks | **None** |
| Actions secrets | **None** — no credential exists inside GitHub at all |
| Deployment environments | **None** |
| Owned by an organization | **No** — a personal account, which is why some controls below are unavailable |
| Actions shared with other repositories | **`none`** — this repository's actions are not consumable by any other repository |
| Default `GITHUB_TOKEN` permissions | **`read`**, and workflows cannot create or approve pull requests |
| Action references | **Pinned to full commit SHAs**, each equal to the commit the `v4` tag already resolved to (`v4.4.0`), so an upstream tag re-point cannot change what CI executes |
| Public gists on the account | **None** — nothing was ever pasted out that way |
| InventoryAI code found in public repositories | **None** — code search across the account for two distinctive identifiers returned zero |
| Other repositories on the account | 4 private, 21 public (unrelated projects) |
| Traffic, recorded window | 24 clones / 3 unique cloners and 244 views / 1 unique viewer, ending 2026-10-07 — consistent with the owner's own machines and CI runs |

Two controls now watch the policy unattended, and their split is deliberate:

- [`.github/workflows/access-guard.yml`](../.github/workflows/access-guard.yml) runs **daily** and
  **hard-fails** if the repository is no longer private, if it has a fork or fork network, or if
  any collaborator other than the owner appears. It also prints the HTTP status of the
  administration-level endpoints it cannot read, so an unreadable check is visible as such and
  never mistaken for a pass.
- [`scripts/audit-access.mjs`](../scripts/audit-access.mjs) is the deep audit, and it needs a
  credential that *can* read those endpoints — the owner's own `gh` session. One dependency-free
  command, non-zero exit on any violation, names only (never a secret value):

  ```bash
  node scripts/audit-access.mjs        # PASS/FAIL/INFO against the live API
  ```

**The one gap neither tool closes:** which **GitHub Apps** are installed with access to this
repository cannot be read from the CLI — `GET /user/installations` requires a token authorised to
an App, and `GET /repos/…/installation` requires an App JWT (both answered `403`/`401`). A hosting
or CI app with this repository selected is a live path to the source, so that list has to be read
in the UI. Nothing in this audit revoked, narrowed or otherwise touched any app installation.

### What could not be verified from here

Two controls are owner-side, because the API will not answer for a user token. **Check
them in the GitHub UI — they are the weakest links right now:**

1. **Two-factor authentication on the GitHub account.** `GET /user` returned
   `two_factor_authentication: null` for this token, so it could not be confirmed. If
   account 2FA is off, nothing on this page matters — the account is the single door to
   the source. Use an authenticator or a hardware key, not SMS.
2. **Which GitHub Apps can reach this repository.** `GET /user/installations` answers
   `403` unless the token belongs to a GitHub App, so the list could not be read from the
   CLI. Check **Settings → Applications** and, for the hosting provider's app (Render),
   confirm it has access to **only the repositories it needs** rather than all of them.
   A deployment integration with blanket access is a real path to the source.

---

## 2. What happened while the repository was public

The repository was made public on **2026-10-09** to unlock free branch protection, and
made private again the same day — roughly a **90-minute** window. That window is the
single most important caveat in this document.

**What the data shows:** `forks: 0` — no GitHub fork exists. Traffic recorded 244 views
and 24 clones across its window, all from 3 unique cloners, consistent with the owner's
own machines and CI runs.

**What the data cannot show:** GitHub's traffic API lags by roughly two days, so its
last recorded day is **2026-10-07** — it does **not** cover the public window. Clones
that happened after the flip are not visible yet, and **a clone leaves no permanent
record** the way a fork does. In addition, public repositories are routinely mirrored by
third parties for archival and research purposes (project archives, dataset snapshots,
search and code-index crawlers) without any notification to the owner.

**The honest conclusion: it cannot be established that no copy was taken.** What is
true is that (a) no fork exists, (b) no visible fork or clone network exists, and (c) the
source has been private since. To re-check later:

```bash
gh api repos/nreffejzxc/ai-inventory/traffic/clones --jq '{clones:.count, uniques:.uniques}'
gh api repos/nreffejzxc/ai-inventory/forks        --jq 'length'
```

If the number of unique cloners rises above the owner's own machines and CI, that is the
signal to rotate credentials and treat the code as disclosed. **A disclosure is a
business fact, not a code fact** — nothing in this repository can undo it.

---

## 3. What is protected, and by what

| Lever | What it does | Strength |
| --- | --- | --- |
| **Private repository** | Removes the one-click clone path, the web UI, search/indexing, and public CI logs | **High** — the main control |
| **Server-side secrets only** | The AI provider keys, Mongo credentials, mail keys and Firebase admin credentials never reach a client; the mobile app talks only to the API | **High** — enforced by architecture, not policy |
| **Proprietary licence** | Grants no rights; makes copying a licence breach and a copyright issue rather than a grey area | **Legal**, not technical |
| **Business/tenant isolation, RBAC on the server** | A stolen client cannot read another business's data | **High** |
| **`scripts/check-secrets.mjs` in CI** | Fails a change that introduces a credential-shaped string; replaces GitHub's scanner, which is unavailable on a private repo at this plan level | **Medium** — pattern matching, not proof |
| **`access-guard` (daily)** | Fails if the repository stops being private, gains a fork, or gains a collaborator other than the owner; reports the endpoints it cannot read | **Medium-High** — unattended, but a day late and partial by permission |
| **`scripts/audit-access.mjs`** | The full access audit on demand, with the admin rights CI lacks | **Medium** — manual, so only as current as its last run |
| **Pinned action SHAs** | An upstream tag re-point cannot change what CI executes | **Medium** — supply chain only |
| **`main-guard`** | Fails when a commit reached `main` without a pull request | **Detective** only |

### What was deliberately **not** done

- **No obfuscation of the mobile bundle.** Expo/React Native release builds are already
  minified and use Hermes bytecode, so casual reading is already hard. A JavaScript
  obfuscator would raise the bar only marginally, cost build-tool reliability, break
  tooling, and create a false sense of protection. **Anything shipped to a device can be
  read.** The durable answer is to keep the valuable logic on the server, not to hide it
  in the client.
- **No code-splitting of the repository.** Splitting private modules out adds real
  overhead; it is worth doing when the first external collaborator appears, not before.

---

## 4. Limitations — what cannot be prevented

1. **A distributed client can be reverse-engineered.** The mobile bundle can be
   extracted from an APK/IPA and read. Assume the client's logic is public.
2. **A copy taken during the public window cannot be recalled** (§2).
3. **Owners and insiders are inside the trust boundary.** Anyone given repository access,
   a deploy token, or a laptop with `.env` on it can copy the source. Least privilege and
   revocation are the only controls.
4. **A compromised machine or token is not a repository problem.** The git-ignored `.env`
   files hold live credentials; malware or a stolen laptop defeats every setting here.
5. **Private ≠ encrypted.** GitHub's operators can read the repository, as can anything
   with the account's credentials.
6. **No technical measure enforces a licence.** Detecting and acting on a copy is a legal
   process with real cost.
7. **On this plan, enforcement is missing:** branch protection is unavailable on a private
   repo without GitHub Pro, so the CI checks *report* rather than *gate*, and
   `main-guard` catches a bypass only afterwards. No secret scanning either.
8. **Forking cannot be switched off** on a personal private repo — the attempt answers
   `422 Allow forks setting can only be changed on org-owned private repositories`, so a
   personal account cannot close it at all. Nobody outside can fork it (a fork of a private
   repository requires read access, and only the owner has it), but a future collaborator
   could. This is one of the reasons an organization is recommended in §5.
9. **GitHub Apps are outside every automated check here.** A deployment or CI app with
   repository access holds its own credential, cannot be enumerated from the CLI (§1), and
   is not a collaborator — so `access-guard` cannot see it. Reviewing that list is a manual,
   recurring task, and the single most likely way access is granted without this audit
   noticing.

---

## 5. Recommended practices as the product grows

### Now (single owner, pre-launch)

1. **Turn on 2FA with a hardware key** for GitHub, the hosting provider, MongoDB Atlas,
   Firebase/Google, the mail provider and the app stores. Record recovery codes offline.
   This protects more than every other item on this list.
2. **Review the hosting/CI integrations' repository access** (§1) and narrow each one to
   selected repositories.
3. **Stop making the repository public again.** If enforcement is wanted, buy it:
   **GitHub Pro ($4/month)** restores protected branches on a private repo and raises
   Actions minutes to 3,000. That is cheaper than one leaked clone.
4. **Use fine-grained, short-lived credentials** for automation, scoped to one repository
   — not a classic token with blanket access — and rotate them on a schedule.
5. **Keep three backups that are not the same account:** the working clone, an encrypted
   offline copy (`git bundle` + `age`/GPG on removable media, in a safe), and a second
   private remote hosted elsewhere. Losing the GitHub account must not lose the project.
   Encrypt them: a bundle *is* the source code.
6. **Never commit a credential, and treat any that lands as already leaked** — rotate
   first, clean the history second. Cleaning history does not un-leak it.

### Before the first collaborator or contractor

7. **Put the access terms in writing before sharing code**: an NDA and an assignment of
   IP (or a contractor agreement assigning work product). A proprietary `LICENSE` governs
   copying; it does not create a duty of confidentiality.
8. **Grant the minimum role**, ideally read-only, with a scheduled end date; give access
   through the GitHub UI (visible in the audit trail) rather than by exporting a `.zip`.
9. **Rotate every secret that person could have seen** when the engagement ends, and
   remove their access the same day.
10. **Move the work into a GitHub Organization** once more than one person is involved:
    org-owned private repos can have forking disabled, teams give least-privilege roles
    instead of per-repo collaborators, and the organization audit log records access
    changes. Personal repositories cannot do any of that.

### As it approaches production and scale

11. **Keep the proprietary logic server-side**, and treat the client as a thin,
    replaceable shell. This is the only scalable answer to reverse engineering.
12. **Trademark the product name** and keep dated authorship evidence (git history and
    signed releases are useful); consider formal copyright registration in the relevant
    jurisdiction. Budget for legal advice rather than treating the licence as sufficient.
13. **Keep the design and specification documents private too.** They describe the
    architecture and the reasoning, which is often more valuable than the code, and they
    live in the same repository for that reason.
14. **Adopt GitHub Secret Protection ($19/active committer/month) when a team exists** —
    native scanning across the organization, with push protection.
15. **Review access quarterly** with `node scripts/audit-access.mjs`, plus the two things it
    cannot read: **GitHub Apps** and the account's own tokens and SSH keys. Access granted
    for a task tends to outlive the task, and the Dependabot queue is part of the same
    review.
16. **Assume compromise, design for recovery:** rotate on a schedule, monitor the audit
    trail, and be able to rebuild from backups without the original account.

---

## 6. Related records

- [`SECURITY.md`](../SECURITY.md) — how to report a vulnerability, and what is in scope.
- [`LICENSE`](../LICENSE) — the proprietary terms.
- [`docs/AUTH_SECURITY_MASTER_CHECKLIST.md`](AUTH_SECURITY_MASTER_CHECKLIST.md) §42 — the
  CI gate, the visibility change and the findings it produced (`F-23`, `F-24`, `F-25`).
- [`docs/DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) §27AE — the dated record of
  every setting, with the evidence.
