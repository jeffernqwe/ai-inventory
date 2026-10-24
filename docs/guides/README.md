# Inventory AI — simple guides

This folder is a **plain-English layer** on top of the project's existing documentation.
Nothing in here replaces the technical documents — it just tries to answer "what do I type,
and what should I expect to see?" without assuming you have read anything else.

If you are not a programmer, start here and read the guide that matches what you want to do.

---

## Which guide do I need?

| I want to… | Read |
|---|---|
| Start the app and its backend on this laptop | [1. Running Inventory AI on a laptop](1-run-on-your-laptop.md) |
| Open and test the app on a real phone | [2. Running Inventory AI on a phone](2-run-on-your-phone.md) |
| See my phone's screen on this laptop | [3. Mirroring the phone to a laptop](3-see-your-phone-on-your-laptop.md) |
| Understand the test accounts and put sample data in | [4. Test accounts and mock data](4-test-accounts-and-mock-data.md) |
| Look up what any command or script does, and how to run it | [6. Every script, explained](6-scripts-and-commands.md) |
| Update the installed app without reinstalling it | [7. Updating the app without reinstalling](7-over-the-air-updates.md) |
| Know what an unfamiliar word means | [5. Words explained](5-words-explained.md) |

**Brand new here?** Read them in that order — each one is written to stand alone, but they build
on each other. Guides 5 and 6 are lookups rather than stories: jump to the word you are stuck on, or
to the command you want to run.

---

## The five things worth knowing before you type anything

1. **There are two halves, and both have to be running.** The *backend* is the program that holds
   the rules and talks to the database. The *app* is what you see on the screen. The app does not
   work on its own.
2. **The database is not on this laptop.** It lives in the cloud (MongoDB Atlas). You never install
   or start it — you just need a working internet connection. That is also why "the database could
   not be reached" is a network problem, not a broken installation.
3. **The phone is a separate computer.** When the phone says `localhost`, it means *the phone*, not
   the laptop. That single fact causes most of the confusing errors, and Guide 2 explains it.
4. **Nothing here is destructive by default.** Every command in these guides either reads, or
   creates sample data in a place that is safe to throw away. The dangerous ones are marked
   ⚠️ **and** explained, twice.
5. **You can only sign in with an account whose password you know.** Deleting an account from the
   sign-in service while its record still exists in the database locks that account out
   permanently (Guide 4 explains why). When in doubt, prefer *adding* data over removing it.

**Guide 6 is a reference, not a story.** It lists every command the project ships — what it does, the
exact line to type, and whether it can harm anything — so when you need one specific command, jump
straight there instead of reading a guide top to bottom.

---

## About the commands in these guides

They are written for **Windows** and are meant to be pasted into a **terminal** — on Windows that
is normally *PowerShell*, and on this machine also **Git Bash**. If you do not know which one you
have, open the Start menu and type `bash`; if *Git Bash* appears, you have it, and every command
below works there unchanged.

A few conventions used throughout:

- A line starting with `#` is a **comment** — a note for you, not something to type.
- `cd some/folder` means "change directory": go into that folder first. Everything else assumes
  you are already there.
- If a command produces no output at all, that is usually **success**. The commands that matter are
  the ones that print something — that is why each step says what you should see.

---

## Where the authoritative documentation lives

These guides **do not** replace the following, and were written carefully so as not to contradict
them. If a guide and one of these disagree, these win — and the guide is the thing that is wrong.

| Document | What it is for |
|---|---|
| [CLAUDE.md](../../CLAUDE.md) | The project's own rules: architecture, security, phases |
| [docs/SYSTEM_SPECIFICATION.md](../SYSTEM_SPECIFICATION.md) | The full specification of how the system behaves |
| [docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md](../DEVELOPING_ON_A_PHYSICAL_DEVICE.md) | The deep, verified phone-and-USB reference (Guide 2 and 3 link into it) |
| [README.md](../../README.md) | The front door: stack, layout, how to run everything |
| [docs/DEVELOPMENT_ROADMAP.md](../DEVELOPMENT_ROADMAP.md) | What has shipped, in order, with evidence |
| [docs/AUTH_SECURITY_MASTER_CHECKLIST.md](../AUTH_SECURITY_MASTER_CHECKLIST.md) | The security record for accounts and sign-in |

Several of those files are **protected** — they are pinned by checksums and must not be edited
(the reasons are in [docs/SOURCE_PROTECTION.md](../SOURCE_PROTECTION.md)). That is deliberate, and
is why this folder was added *alongside* them instead of simplifying them in place. See the note at
the bottom of this file.

---

## Why some documents were left exactly as they were

You asked for the documentation to be made easier to follow, with a clear instruction to leave
anything risky alone. These are the parts that were left untouched, and the reason in each case:

- **CLAUDE.md, SYSTEM_SPECIFICATION.md, DEVELOPMENT_ROADMAP.md, PHASE_HISTORY.md,
  AUTH_SECURITY_MASTER_CHECKLIST.md and AUTHENTICATION_AND_USER_VERIFICATION_TARGET_ARCHITECTURE.md**
  are the project's *source of truth* and its *evidence record*. The roadmap and checklist are
  historical: entries record what happened on a given date, including numbers measured on real
  hardware, and "tidying" them would falsify the record. They are long and technical on purpose.
- **DEVELOPING_ON_A_PHYSICAL_DEVICE.md** is the verified phone reference. It contains exact
  observed outputs (device serials, real bundle lines, a real `dumpsys` line) that make it possible
  to tell "it worked" from "it looked like it worked". Shortening it would delete the evidence.
- **docs/SOURCE_PROTECTION.md**, **SECURITY.md**, **.env.example** and the files listed in the
  protection document are pinned by hash. Editing one of them fails a check in CI.
- **docs/superpowers/plans/** holds dated planning records. They are point-in-time documents; a
  plan from an earlier date must keep saying what it said then.

Everything else in this folder is new, and safe to rewrite if the wording can be improved. If you
find something here that is unclear, the fault is in the new guide, not in the project.
