# The `docs/` folder — what is in it, and where to start

This folder holds two very different kinds of writing, and knowing which is which saves a lot of
time:

- **Guides** — written to be *followed*. They tell you what to type and what you should see.
- **Records** — written to be *referenced*. They state what the system is, or what happened on a
  particular date, with evidence. They are long on purpose.

If you are looking for something to read start-to-finish, you want the guides.

---

## 1. Start here — the plain-English guides

**[`guides/`](guides/README.md)** is a small, self-contained set written for readers with limited
technical background. Technical terms are explained where they appear, and nothing there contradicts
the records below.

| Guide | For |
|---|---|
| [guides/README.md](guides/README.md) | Which guide do I need? Plus the five things worth knowing first |
| [guides/1-run-on-your-laptop.md](guides/1-run-on-your-laptop.md) | Starting the backend and the app, and proving they work |
| [guides/2-run-on-your-phone.md](guides/2-run-on-your-phone.md) | Getting the app onto a real Android phone |
| [guides/3-see-your-phone-on-your-laptop.md](guides/3-see-your-phone-on-your-laptop.md) | Mirroring the phone into a laptop window |
| [guides/4-test-accounts-and-mock-data.md](guides/4-test-accounts-and-mock-data.md) | Which accounts exist, how sample data is seeded, and what is safe to delete |
| [guides/5-words-explained.md](guides/5-words-explained.md) | Glossary, A–Z |
| [guides/6-scripts-and-commands.md](guides/6-scripts-and-commands.md) | Every npm script, what it does, what it prints, and what is safe to run |
| [guides/7-over-the-air-updates.md](guides/7-over-the-air-updates.md) | Publishing an update without a rebuild, and rolling one back |
| [guides/8-play-store-submission.md](guides/8-play-store-submission.md) | Building and submitting the Android release |

## 2. What the system *is* — reference documents

| Document | Answers |
|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | The project's own instructions: architecture rules, security rules, the phase index. Short entries, dense wording |
| [`SYSTEM_SPECIFICATION.md`](SYSTEM_SPECIFICATION.md) | **The primary source of truth** for how the system must behave — data, rules, roles, APIs (~3,000 lines) |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | The mobile app's visual language: colour tokens, spacing, accessibility rules |
| [`AUTHENTICATION_AND_USER_VERIFICATION_TARGET_ARCHITECTURE.md`](AUTHENTICATION_AND_USER_VERIFICATION_TARGET_ARCHITECTURE.md) | The target architecture for sign-in, registration and identity verification |
| [`DEVELOPING_ON_A_PHYSICAL_DEVICE.md`](DEVELOPING_ON_A_PHYSICAL_DEVICE.md) | The deep, *verified* phone reference: exact observed outputs from a real run, a long troubleshooting table, the signed-in walkthrough |
| [`../README.md`](../README.md) | The front door: stack, layout, how to run each half, deployment |

## 3. What *happened* — records

These are histories. They are written once and then left alone, because their value is that they
still say what was true on the date they were written.

| Document | Records |
|---|---|
| [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) | Every increment in order, with the evidence each one shipped with (~21,000 lines — an archive, not required reading) |
| [`PHASE_HISTORY.md`](PHASE_HISTORY.md) | The phase-by-phase history in a shorter, chronological form |
| [`AUTH_SECURITY_MASTER_CHECKLIST.md`](AUTH_SECURITY_MASTER_CHECKLIST.md) | The security checklist for accounts, sessions and verification |
| [`TS-MIGRATION-MANIFEST.md`](TS-MIGRATION-MANIFEST.md) | The completed migration of the backend to TypeScript |
| [`SECURITY_DEPENDENCY_DECISIONS.md`](SECURITY_DEPENDENCY_DECISIONS.md) | Security advisories deliberately accepted rather than patched, and why |
| [`SOURCE_PROTECTION.md`](SOURCE_PROTECTION.md) | Which files are **protected by checksum**, and the incident that led to it |
| [`freebuff/`](freebuff/README.md) | A forensic/handoff layer recording agent activity — explicitly *not* architecture, history or specification |
| [`superpowers/`](superpowers/) | Dated plans and design specs written before work began. Point-in-time by nature |

Also at the repository root: [`../SECURITY.md`](../SECURITY.md) — how to report a vulnerability, and
what is in scope.

---

## Two rules before you edit anything here

1. **Some files are protected and must not be edited.** They are pinned by checksums and a check
   fails if one changes — [`SOURCE_PROTECTION.md`](SOURCE_PROTECTION.md) lists them and explains
   why. The reason is not bureaucracy: most of them are the evidence record, and an edited
   measurement is no longer evidence.
2. **Records are append-only.** When reality changes, add a new dated entry — do not rewrite an old
   one. A later entry that says "superseded, see §27X" preserves the history; deleting the earlier
   text destroys it.

Neither rule applies to the guides in section 1. They are ordinary prose and can be reworded,
split or merged freely — if something there is unclear, the guide is what should change.

---

## Reading rule

**You never need to read the records to use or change this project.** Start with
[`../README.md`](../README.md) for the shape of the system and this folder's guides for a task. The
records exist so that a decision made on a particular date can be audited later; when a record and
the code disagree, the code and the specification win and the old record is corrected by a new entry.
