# 2. Running Inventory AI on a phone

Runs the app on a real Android phone, loading code from *this* laptop and talking to *this* laptop's
backend.

## The four pieces

| Piece | Plain words | If missing |
|---|---|---|
| **adb** | The USB bridge that lets the laptop command the phone | The laptop cannot see the phone |
| **A development build** | An app build that fetches its code from the laptop | The app opens but ignores your edits |
| **Metro** | The part of `npx expo start` that serves the code | "Cannot connect" screen |
| **The backend** | Holds the rules and data | Screens load, every action fails |

A store build **cannot** load code from the laptop — its code is sealed in. Only a development build
can, which is why an app that ignores your edits is almost always the wrong build.

## Step 1 — install the USB tool (once ever)

In **PowerShell**, not WSL:

```powershell
adb version
winget install --id Google.PlatformTools -e    # only if not recognised
```

Then **open a new terminal window** — an open window does not see the installer's updated PATH. On
this machine `adb` is at `C:\Users\jeffe\AppData\Local\Android\Sdk\platform-tools\adb.exe`.

## Step 2 — enable USB debugging (once per phone)

1. **Settings → About device** → tap **Build number** seven times (OPPO/ColorOS: *Version*).
2. **Settings → System settings → Developer options** (OPPO: often *Additional settings*) → **USB
   debugging** on, and **Stay awake** on.

## Step 3 — plug in and authorise (once per laptop)

Use a data cable. Accept *"Allow USB debugging?"* with **Always allow from this computer**. No prompt?
Pull down the shade, tap the USB notification, choose **File transfer**, replug. Then:

```bash
adb devices
```

| Prints | Meaning | Do |
|---|---|---|
| `PV4DDMIZZLTCIVSK   device` | Working | Continue |
| `...   unauthorized` | Prompt not accepted | Accept, or *Revoke USB debugging authorizations* and replug |
| `...   offline` | Stale connection | `adb reconnect`, or `adb kill-server` and replug |
| *(nothing)* | Phone invisible | Cable, port, USB mode, USB debugging off |

**Do not continue until it says `device`.**

## Before Step 4 — does the build have its settings?

A phone build is assembled in EAS from `mobile/eas.json` **and** the **EAS environment** for that
profile. Missing settings do not fail a build — the trap. (On 2026-10-15 the `production` environment
was empty, so a production build had no Firebase settings and silently used the old password path.)

```bash
cd C:/Users/jeffe/inventory-ai/mobile
node scripts/check-build-env.mjs --live     # exits 1 and names every missing setting
npx eas env:list --environment production   # names only, never values
```

It checks `EXPO_PUBLIC_API_URL` (must be a public `https://` address for a release build), the four
Firebase values (**all four or none**), and the two Google files (`GOOGLE_SERVICES_JSON`,
`GOOGLE_SERVICE_INFO_PLIST`). Without `--live` it checks only what is written in the project.

The backend shows the same kind of gap at startup, as a warning it does not refuse to boot on:

```text
[config] integrations mail=off firebase=on emailVerification=off ai=on(openrouter)
[config] warning: email verification is ENABLED but mail is not configured: … Set MAIL_PROVIDER,
MAIL_FROM and BREVO_API_KEY on this host.
```

Both live in the host's dashboard (Render → Environment), never in this project.

## Step 4 — put a development build on the phone

```bash
cd C:/Users/jeffe/inventory-ai/mobile
eas build --profile development --platform android
adb install -r "C:\path\to\the-downloaded.apk"
```

- Installing it **replaces** the normal app and vice versa (same `com.inventoryai.app`); app data is kept.
- Do **not** use `npx expo run:android` — it creates a native `android/` folder this project keeps out
  of the repository.

Check which build is installed:

```bash
adb shell cmd package resolve-activity --brief -a android.intent.action.VIEW -d "inventoryai://expo-development-client/?url=http://localhost:8081"
```

`com.inventoryai.app/.MainActivity` means the right build; *No activity found* means a finished build.

## Step 5 — start the backend (window 1)

```bash
cd C:/Users/jeffe/inventory-ai/server
npm start
```

Everything the phone asks for is printed here — that is how you prove the phone reaches *your* laptop.

## Step 6 — the USB tunnels, then Metro (window 2)

`mobile/.env` says `EXPO_PUBLIC_API_URL=http://localhost:4000`, but on the phone `localhost` is the
phone. `adb reverse` forwards the phone's own ports to the laptop:

```bash
adb reverse tcp:8081 tcp:8081     # phone localhost:8081 -> laptop Metro
adb reverse tcp:4000 tcp:4000     # phone localhost:4000 -> laptop backend
adb reverse --list                # MUST list both
```

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx expo start --dev-client --clear
```

Expo creates the `8081` tunnel itself, so the app loads and looks healthy; **nothing creates
`4000`**. That is why the app can run until it does anything, then say *"Cannot reach the server"*.
Tunnels vanish on any replug or `adb` restart — `adb reverse --list` is the first thing to check.

## Step 7 — open the app

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "inventoryai://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

Pressing **`a`** in the Metro window is the shortcut; the command above is the tested path.

## Step 8 — prove it worked

| Signal | Where | Proves |
|---|---|---|
| `Android Bundled <n>ms node_modules\expo-router\entry.js (1602 modules)` | Metro window | the phone fetched code from **this** laptop |
| `mResumedActivity: ... com.inventoryai.app/.MainActivity` | `adb shell dumpsys activity activities` | the app is on screen, not a crash dialog |
| a new `{"type":"http", ...}` line | backend window | the phone reached **this** laptop's API |

If the first two pass and the third stays silent, the app is pointed elsewhere: re-check
`mobile/.env`, then restart Metro with `--clear`. Test the tunnel without the app:

```bash
adb shell am start -a android.intent.action.VIEW -d "http://localhost:4000/api/health/live"
```

## Step 9 — working

| Want | Do |
|---|---|
| See edits | save the file; press **`r`** in Metro to force a reload |
| Developer menu | shake the phone, or `adb shell input keyevent 82` |
| App logs | the Metro window |
| Stop | `Ctrl+C` in each window |

## Everyday routine

```bash
adb devices
adb reverse tcp:8081 tcp:8081
adb reverse tcp:4000 tcp:4000
adb reverse --list

cd C:/Users/jeffe/inventory-ai/server && npm start
cd C:/Users/jeffe/inventory-ai/mobile && npx expo start --dev-client
```

Then open the app with the Step 7 command.

## If something goes wrong

| What you see | Cause | Do |
|---|---|---|
| *"Cannot reach the server"* | `4000` tunnel missing | `adb reverse tcp:4000 tcp:4000`, then `--list` |
| App ignores edits | Finished build, not a development build | Redo Step 4, check with `resolve-activity` |
| `unauthorized` | Prompt not accepted | Unlock and accept; may reappear after an `adb` restart |
| `offline` | Stale connection | `adb reconnect`, or `adb kill-server` and replug |
| Empty `adb devices` | Cable/port/USB mode/debugging | Another cable and port; recheck Step 2 |
| Metro says 8081 in use | Another Metro running | Let Expo pick another port, or stop the other |
| Red error screen | Real code error | Read the message in the Metro window |
| Worked yesterday | Cable bumped / laptop slept | `adb devices`, then both `adb reverse` lines |

Deep reference: [docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md](../DEVELOPING_ON_A_PHYSICAL_DEVICE.md)
(exact observed outputs from a real OPPO CPH1969 run).

← [Guides index](README.md) · Next: [3. Mirroring](3-see-your-phone-on-your-laptop.md)
