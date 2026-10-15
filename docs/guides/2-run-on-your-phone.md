# 2. Running Inventory AI on a phone

**What this guide gets you:** the app actually running on a real Android phone, loading its code
from *this* laptop, and talking to *this* laptop's backend.

This is the longest guide, because a phone adds three things a laptop does not: a USB cable, an
app that has to be a special kind of build, and the fact that the phone's `localhost` is not the
laptop's.

---

## The mental picture — four pieces, and all four must be working

```text
       YOUR PHONE                              YOUR LAPTOP
  ┌────────────────────┐   USB cable   ┌────────────────────────────────┐
  │  Inventory AI      │◄─────────────►│  adb      — the USB bridge     │
  │  (a *development*  │               │  Metro    — sends the app code │
  │   build of the app)│  (or Wi-Fi)   │  Backend  — holds the rules    │
  └────────────────────┘◄─────────────►└────────────────────────────────┘
```

| Piece | In plain words | If it is missing… |
|---|---|---|
| **adb** | The tool that lets the laptop give the phone instructions over the USB cable | The laptop cannot see the phone at all |
| **A *development* build of the app** | A version of the app that fetches its code from your laptop instead of carrying it inside itself | The app opens but never shows your changes |
| **Metro** | The part of `npx expo start` that sends the app's code | The app shows a "cannot connect" screen |
| **The backend** | The program that holds the rules and the data | Screens load, then every action fails |

> **The misunderstanding that costs the most time:** the normal, finished version of the app (the
> kind you would install from a store) **cannot** load code from your laptop — the code is sealed
> inside it. Only a *development* build can. If the app opens and looks plausible but ignores your
> edits, that is the reason.

---

## Step 1 — install the USB tool (once ever)

In **PowerShell** (not WSL — WSL cannot see USB devices):

```powershell
adb version
```

If that prints a version, you are done. If it says it is not recognised:

```powershell
winget install --id Google.PlatformTools -e
```

> **Then open a NEW terminal window.** The installer updates a list of where programs live, and a
> window that is already open will not see the update. This is the usual cause of "I installed it
> but it says not recognised".

On this machine `adb` is already present, at
`C:\Users\jeffe\AppData\Local\Android\Sdk\platform-tools\adb.exe`.

## Step 2 — let the phone accept instructions (once per phone)

On the phone:

1. **Settings → About device** → tap **Build number** seven times. It should say *"You are now a
   developer"*. (On OPPO/ColorOS this may be under *Version*.)
2. Go to **Settings → System settings → Developer options** (on OPPO it is often under *Additional
   settings*) and turn on **USB debugging**.
3. While you are there, also turn on **Stay awake** — it stops the phone screen locking in the
   middle of a test.

## Step 3 — plug it in and authorise (once per laptop)

1. Use a cable that carries **data**. Some cables only carry power — this is a real and very
   confusing failure.
2. Plug it in. The phone shows *"Allow USB debugging?"* with the computer's fingerprint. Tick
   **Always allow from this computer** and tap **Allow**.
3. If no prompt appears: pull down the notification shade, tap the USB notification, change the
   mode to **File transfer / Android Auto**, and replug.

Now check, on the laptop:

```bash
adb devices
```

| What it prints | What it means | What to do |
|---|---|---|
| `PV4DDMIZZLTCIVSK   device` | Working | Carry on |
| `...   unauthorized` | The prompt was never accepted | Accept it, or use *Revoke USB debugging authorizations* and replug |
| `...   offline` | A stale connection | `adb reconnect` (or `adb kill-server`, replug) |
| *(nothing)* | The laptop cannot see the phone | Cable, port, USB mode, or USB debugging is off |

**Do not continue until this line says `device`.** Everything in Guides 2 and 3 is built on it.

## Before Step 4 — does this build have what it needs? (two minutes, saves hours)

A phone build is assembled in Expo's cloud from settings that live in **two** places: the file
`mobile/eas.json` in this project, and the **EAS environment** for the profile you are building.
Settings that are missing do **not** stop a build — and that is the trap.

**What actually happened, 2026-10-15.** The `production` EAS environment was empty, while `preview`
and `development` each had nine settings. A production build therefore had no Firebase settings at
all. The app still built, still started, and still let someone register — through the **old
password path**, silently, instead of the Firebase-first path with the emailed verification code. A
green build had quietly become the wrong build. The same build has no `google-services.json`, and
*that* one fails **inside the build** rather than at run time.

Run this from the `mobile` folder:

```bash
cd C:/Users/jeffe/inventory-ai/mobile
node scripts/check-build-env.mjs --live
```

**How to read it.** One line per build profile. `ok` means every setting that profile needs is
present. Anything else prints `::error::` lines naming the exact missing settings, and the command
exits with code `1`. Without `--live`, the same command checks only what is written inside the
project (which is what the automated checks run) and says so instead of guessing about EAS.

The two halves it checks:

- **The app's settings** — `EXPO_PUBLIC_API_URL` (the backend address, which must be a public
  `https://` address for a released build: `localhost`, `10.0.2.2` and `192.168.…` mean *your
  laptop*, never a phone on a train) and the four Firebase values, which must be **all four or
  none**.
- **The two Google files** — `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST`. EAS hands the
  build the uploaded file's location; without them the build looks for a file that only exists on a
developer's machine.

To see what an environment currently holds (names only — values are never printed here):

```bash
npx eas env:list --environment production
```

**The backend has the same kind of gap, and one command shows it.** New members cannot register on
a server whose mail settings are missing, because the verification code is emailed before any
account exists. That server says so the moment it starts:

```text
[config] integrations mail=off firebase=on emailVerification=off ai=on(openrouter)
[config] warning: email verification is ENABLED but mail is not configured: … Set MAIL_PROVIDER,
MAIL_FROM and the selected provider key (RESEND_API_KEY or BREVO_API_KEY) on this host.
```

One line tells you what is switched on; the warning under it tells you what that costs and which
setting fixes it. **It is a warning on purpose — the server keeps running** (existing members are
unaffected), which is exactly why it had to be said out loud: on 2026-10-15 the deployed service
looked perfectly healthy while being unable to onboard anybody. Both settings live in the hosting
dashboard (Render → Environment), never in this project.

## Step 4 — put a **development** build of the app on the phone

From the `mobile` folder:

```bash
cd C:/Users/jeffe/inventory-ai/mobile
eas build --profile development --platform android
```

This builds the app in Expo's cloud (it takes a while) and gives you a download link. Install it on
the phone with:

```bash
adb install -r "C:\path\to\the-downloaded.apk"
```

Two things worth knowing:

- **Installing it replaces the normal app and vice versa.** They share the same identity
  (`com.inventoryai.app`) and cannot both be present. Your app data is kept.
- **Do not use `npx expo run:android`** for this. It would create a native `android/` folder in the
  project, and this project deliberately keeps those files out of the repository — Expo's cloud
  builds own them.

**Check which one you have** — this asks the phone which app claims the development address:

```bash
adb shell cmd package resolve-activity --brief -a android.intent.action.VIEW -d "inventoryai://expo-development-client/?url=http://localhost:8081"
```

If it answers `com.inventoryai.app/.MainActivity`, you have the right kind of build. If it says
*No activity found*, you have a finished build installed and the next steps will not work.

## Step 5 — start the backend (window 1)

```bash
cd C:/Users/jeffe/inventory-ai/server
npm start
```

Leave it running. **Everything the phone asks for is printed in that window** — which is how you
prove the phone is talking to *your* laptop. See
[Guide 1](1-run-on-your-laptop.md) if this step is unfamiliar.

## Step 6 — the USB tunnels, then Metro (window 2)

This is the step most often forgotten, so it gets its own explanation.

The app is told where the backend lives by a setting in `mobile/.env`:

```text
EXPO_PUBLIC_API_URL=http://localhost:4000
```

On the **phone**, `localhost` means *the phone itself* — not the laptop. So by itself that address
points at nothing. The fix is to tell the phone: *"when you knock on your own door number 4000,
forward that to the laptop."* That is what a **reverse tunnel** is, and `adb` sets it up:

```bash
adb reverse tcp:8081 tcp:8081     # phone's localhost:8081 -> this laptop's Metro
adb reverse tcp:4000 tcp:4000     # phone's localhost:4000 -> this laptop's backend
adb reverse --list                # MUST list both — check before going on
```

Now start Metro:

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx expo start --dev-client --clear
```

**Why the tunnel is so easy to miss:** Expo creates the `8081` one for you, so the app loads and
looks healthy. Nothing creates `4000`. The result is an app that runs perfectly until it tries to
do anything, and then says *"Cannot reach the server. Check your connection and try again."* — a
message about a connection that is working fine.

**Tunnels are lost whenever the cable is disturbed.** A replug, an `adb` restart, a bumped cable —
all of them remove the tunnels. If the app suddenly cannot reach the server, run
`adb reverse --list` first: recreating both lines fixes it far more often than anything else.

## Step 7 — open the app

The reliable way is a direct instruction to the phone (the `:` and `/` inside must be written as
`%3A` and `%2F`):

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "inventoryai://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

There is a shortcut — pressing **`a`** in the Metro window asks Expo to open the app for you — but
the direct command above is the one that has been tested on this machine, so prefer it when
something is wrong.

## Step 8 — prove it worked (do not skip)

Three independent signals. Each one proves something different, and you want all three:

| Signal | Where you see it | What it proves |
|---|---|---|
| `Android Bundled <n>ms node_modules\expo-router\entry.js (1602 modules)` | the Metro window | **the phone** fetched the app's code from **this** laptop |
| `mResumedActivity: ... com.inventoryai.app/.MainActivity` | `adb shell dumpsys activity activities` | the app is on screen — not a crash dialog |
| a new `{"type":"http", ...}` line | the backend window | the phone reached **this** laptop's API |

If the first two pass but the third stays silent, the app is running but pointed somewhere else.
Re-check `mobile/.env`, then restart Metro with `--clear` (settings beginning `EXPO_PUBLIC_` are
baked into the code as it is served, so a running Metro keeps handing out the old value).

**You can also test the tunnel without the app at all** — open the API's health address in the
phone's own browser. A request you never made from the laptop appearing in the backend log is
proof the forwarding works:

```bash
adb shell am start -a android.intent.action.VIEW -d "http://localhost:4000/api/health/live"
```

## Step 9 — working on the app

| I want to… | How |
|---|---|
| See my edits | change the file — it reloads by itself; press **`r`** in the Metro window to force it |
| Open the app's developer menu | shake the phone, or `adb shell input keyevent 82` |
| See what the app is printing | the Metro window shows its log messages |
| Stop everything | `Ctrl+C` in each window, close any mirroring window |

---

## The everyday routine (once the one-time steps are done)

```bash
adb devices                      # 1. must say "device"
adb reverse tcp:8081 tcp:8081    # 2. the tunnels — the commonly missed step
adb reverse tcp:4000 tcp:4000
adb reverse --list               #    must list both

cd C:/Users/jeffe/inventory-ai/server && npm start          # 3. window 1
cd C:/Users/jeffe/inventory-ai/mobile && npx expo start --dev-client   # 4. window 2
```

Then open the app with the `am start` command from Step 7.

---

## If something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| *"Cannot reach the server"* in the app | The `4000` tunnel is missing | `adb reverse tcp:4000 tcp:4000`, then `--list` |
| The app opens but ignores your edits | A finished build, not a development build | Re-do Step 4 and check with `resolve-activity` |
| `adb devices` says `unauthorized` | The phone did not accept the prompt | Unlock the phone and accept it; the prompt can reappear after an `adb` restart |
| `adb devices` says `offline` | Stale connection | `adb reconnect`, or `adb kill-server` then replug |
| `adb devices` is empty | Cable/port/USB mode, or USB debugging off | Try another cable and port; recheck Step 2 |
| Metro says port 8081 is in use | Another Expo/Metro is running | Let Expo pick another port, or stop the other window |
| The app shows a red error screen | A real code error | The full message is in the Metro window — read it there, not on the phone |
| Everything worked yesterday, nothing works today | Cable bumped / laptop slept | `adb devices`, then redo the two `adb reverse` lines |

---

## For the deep reference

[docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md](../DEVELOPING_ON_A_PHYSICAL_DEVICE.md) is the full,
verified reference for this topic: it records the exact observed outputs from a real run
(2026-10-10, an OPPO CPH1969 on Android 11), a long troubleshooting table, the signed-in
walkthrough, and the optional wireless setup. Read it when you need to tell "it worked" from "it
looked like it worked".

Next: [3. Mirroring the phone to a laptop](3-see-your-phone-on-your-laptop.md) if you want to watch
and control the phone from the laptop window.
