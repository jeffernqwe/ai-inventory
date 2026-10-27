# Inventory AI — simple guides

Plain-English instructions for running, testing and releasing the app. Nothing here replaces the
technical documents listed at the bottom; if they disagree with a guide, they win.

## Which guide do I need?

| I want to… | Read |
|---|---|
| Start the backend and the app on this laptop | [1. Running on a laptop](1-run-on-your-laptop.md) |
| Run the app on a real phone | [2. Running on a phone](2-run-on-your-phone.md) |
| See the phone's screen on the laptop | [3. Mirroring the phone](3-see-your-phone-on-your-laptop.md) |
| Understand test accounts and what data each one holds | [4. Test accounts and mock data](4-test-accounts-and-mock-data.md) |
| Put data in, verify it, or seed production | [9. Seeding data](9-seeding-data.md) |
| Delete a database or one tenant | [10. Deleting data](10-deleting-data.md) |
| Work with Firebase logins | [11. Firebase identities](11-firebase-identities.md) |
| Look up any other command or script | [6. Scripts and commands](6-scripts-and-commands.md) |
| Update an installed app without reinstalling it | [7. Updating the app](7-over-the-air-updates.md) |
| Prepare the Google Play submission | [8. Preparing the Play submission](8-play-store-submission.md) |
| Look up a word | [5. Words explained](5-words-explained.md) |

Guides 5 and 6 are references — jump to the word or command you need. Guides 9, 10 and 11 own the data
commands (put it in, take it out, handle logins), so Guide 6 does not repeat them.

## Five things to know first

1. **Two halves must both run.** The *backend* holds the rules and talks to the database; the *app*
   is the screen. The app does not work alone.
2. **The database is in the cloud** (MongoDB Atlas). "Database unreachable" is a network problem,
   not a broken install.
3. **The phone is a separate computer.** On the phone, `localhost` means *the phone*, so the laptop's
   backend is reached through a USB tunnel (Guide 2).
4. **Nothing here is destructive by default.** Dangerous commands are marked ⚠️ and require a
   confirmation phrase.
5. **Only sign-ins you know the password to can sign in.** Deleting a login while its database record
   exists locks that account out permanently (Guide 11).

## Command conventions

Commands are written for **Git Bash**. A `#` line is a comment; `cd` means "be in this folder first".
No output from `typecheck` or `lint` means clean. Settings written as `NAME=value command` apply to
one command only — in **PowerShell** set `$env:NAME="value"` first, then clear it with
`$env:NAME=$null`.

## Authoritative documentation

These guides do not replace: [CLAUDE.md](../../CLAUDE.md) (project rules),
[docs/SYSTEM_SPECIFICATION.md](../SYSTEM_SPECIFICATION.md) (behaviour),
[docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md](../DEVELOPING_ON_A_PHYSICAL_DEVICE.md) (verified phone
reference), [README.md](../../README.md) (project front door),
[docs/DEVELOPMENT_ROADMAP.md](../DEVELOPMENT_ROADMAP.md) (what shipped, with evidence) and
[docs/AUTH_SECURITY_MASTER_CHECKLIST.md](../AUTH_SECURITY_MASTER_CHECKLIST.md) (security record).

CLAUDE.md and the roadmap are **records**: dated, long because each entry carries its evidence, and
append-only — a later entry supersedes an earlier one rather than editing it. Nothing in them is
protected by a checksum, and the five protected *paths* are listed in the security checklist §8.
`docs/superpowers/plans/` holds dated plans that keep saying what they said then. This folder is the
layer that summarises all of it for a reader who does not need the history.
