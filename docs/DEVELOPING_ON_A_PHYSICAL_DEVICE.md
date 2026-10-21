# Developing on a Physical Android Device (Windows)

How to mirror and control your **real** Android phone from your Windows laptop and run
Inventory AI on it — no emulator. This is a developer-workflow guide, not an architectural
record; it changes no product behaviour.

Steps 1–6 and the troubleshooting table were executed and verified on this machine
(2026-10-10) against an **OPPO CPH1969 running Android 11 (SDK 30)**, with scrcpy 4.1 and
adb 37.0.1. Two things are **upstream-documented rather than verified here**, and are marked
as such below: pressing `a` in the Metro terminal (step 6d — the deep link is the verified
route) and the wireless setup (step 10).

**Section 7 (the authenticated walkthrough) states its own provenance at the top:** its tunnel,
launch and pre-flight steps were verified on **2026-10-11**, while the registration journey itself
has **not yet been run** on the device and is written from the code.

---

## 0. The mental model — why there are four pieces

Understanding this is what makes the troubleshooting obvious instead of accidental:

```text
  your phone                         your laptop
  ┌──────────────┐   USB cable   ┌──────────────────────────────┐
  │              │◄─────────────►│ adb        (the bridge)      │
  │  Inventory   │               │  └─ scrcpy  video ◄── input  │
  │  AI (dev     │    Wi-Fi      │  └─ Metro  :8081  (JS)       │
  │  client)     │◄─────────────►│  └─ API    :4000  (backend)  │
  └──────────────┘               └──────────────────────────────┘
```

| Piece | What it actually does | Why you need it |
|---|---|---|
| **adb** | Runs commands on the phone over USB | Everything else is built on it |
| **scrcpy** | Pushes a small server to the phone, streams video back, sends your mouse/keyboard to it | You watch and control the phone in a window |
| **Expo dev client** | A build of the app whose JS comes from your laptop at runtime | A *standalone* APK has the JS baked in and **cannot** load your edits |
| **Metro (`:8081`)** | Serves the JS bundle | This is what makes hot reload possible |
| **Backend (`:4000`)** | Serves the API | The app must reach it; MongoDB is never contacted by the phone |

The single most common misunderstanding: **installing the app from a `preview` or
`production` EAS build does not give you a dev client.** Those are finished apps pointed at a
fixed backend. Only the `development` profile build (`developmentClient: true`) loads from
Metro.

---

## 1. Install the tools (once per laptop)

Run these in **PowerShell** (or Windows Terminal). Not WSL — WSL cannot see your USB device.

```powershell
# What do you already have?
adb version
scrcpy --version
node -v          # this server requires Node >= 24
```

Install anything missing:

```powershell
# ADB / platform-tools
winget install --id Google.PlatformTools -e

# scrcpy (user-scope, no admin needed)
winget install --id Genymobile.scrcpy -e --accept-source-agreements --accept-package-agreements
```

> **Open a NEW terminal afterwards.** winget updates your user `PATH`, and an already-running
> shell will not see it. This is the single most common "I installed it but `scrcpy` is not
> recognised" cause.

**Verify:**

```powershell
scrcpy --version          # -> scrcpy 4.1 <https://github.com/Genymobile/scrcpy>
where.exe scrcpy          # -> the WinGet package path
adb version               # -> Android Debug Bridge version 1.0.41
```

Notes specific to this machine:
- adb lives at `C:\Users\jeffe\AppData\Local\Android\Sdk\platform-tools\adb.exe` (Android SDK
  is already installed; you do **not** need to install platform-tools again).
- scrcpy ships its **own** `adb.exe`. It will use the one on your `PATH` normally. To force a
  specific one: `$env:ADB = "C:\path\to\adb.exe"` before starting scrcpy.
- `eas` is a **global** CLI here (`eas-cli/24.7.0`), not a project dependency.
  `eas --version` works from any folder.

---

## 2. Enable USB debugging (once per phone)

On the phone:

1. **Settings → About device** → tap **Build number** seven times (on ColorOS it may be under
   *Version*). You should see *"You are now a developer"*.
2. Back out to **Settings → System settings → Developer options** (ColorOS often nests it under
   *Additional settings*).
3. Turn on **USB debugging**.

While you are there, two more settings that save you grief:

- **Stay awake** (keep the screen on while charging) — useful because the phone's own sleep
  timer will otherwise lock the screen mid-test.
- **USB debugging (Security settings)** — OPPO/Realme/Vivo only. This grants the shell extra
  permissions (simulating input, writing secure settings). See the troubleshooting table for
  the one error it fixes.

**Verify** (with the phone plugged in) — this is the whole point of step 2:

```powershell
adb devices
# PV4DDMIZZLTCIVSK       device          <- "device" is what you want
```

If USB debugging were off, you would see an **empty list** instead.

---

## 3. Connect over USB and authorize (once per laptop)

1. Use a cable that carries **data**, not a charge-only cable. This is a real failure mode.
2. Plug it in. Android shows **"Allow USB debugging?"** with the computer's RSA fingerprint.
   Tick **Always allow from this computer** and tap **Allow**.
3. If no prompt appears, pull down the notification shade, tap the USB notification and switch
   the mode to **File transfer / Android Auto**, then replug.

**Interpreting `adb devices` — each state means something different:**

| Output | Meaning | Fix |
|---|---|---|
| `PV4DDMIZZLTCIVSK  device` | Working | Go to step 4 |
| `PV4DDMIZZLTCIVSK  unauthorized` | Prompt not accepted | Accept it, or revoke + replug (below) |
| `PV4DDMIZZLTCIVSK  offline` | Stale adb handle | `adb reconnect` or `adb kill-server` then replug |
| *(empty list)* | Not seen at all | Cable, port, USB mode, or USB debugging is off |

To re-do an authorization: Developer options → **Revoke USB debugging authorizations** →
replug → accept the prompt again.

---

## 4. Verify ADB really recognises your phone

```powershell
adb devices -l
# PV4DDMIZZLTCIVSK  device product:CPH1969 model:CPH1969 device:OP4863 transport_id:42

adb shell getprop ro.product.model          # CPH1969
adb shell getprop ro.build.version.release  # 11
adb shell getprop ro.build.version.sdk      # 30
```

Set the serial once per terminal so later commands are exact even with several devices attached:

```powershell
$serial = "PV4DDMIZZLTCIVSK"    # copy from `adb devices`
```

Anything that talks to the phone — `scrcpy`, `adb install`, `adb shell input` — works from
step 4 onward. **Never proceed to scrcpy if `adb devices` is not clean.** scrcpy is built on
adb; if adb cannot see the phone, scrcpy never will.

---

## 5. Mirror and control the phone (scrcpy)

```powershell
scrcpy -s $serial -m 1024 --window-title "Inventory AI"
```

| Flag | Meaning |
|---|---|
| `-s $serial` | Target this device (use `-d` to mean "the USB one") |
| `-m 1024` | Scale the long edge to 1024 px so the window fits a laptop |
| `--window-title` | Name the window |
| `--no-audio` | Skip audio (Android 11+ streams audio by default) |
| `-w` | Keep the phone awake — **see the ColorOS caveat below** |
| `--record=file.mp4` | Also record the session (great for bug reports) |
| `--tcpip=PHONE_IP` | Switch to a wireless connection (step 10) |

**Where it runs:** in any folder. The terminal you started it from **is** scrcpy's console —
it prints logs and closing it stops mirroring.

**Verify it is genuinely working — a window appearing is not enough.** On success the console
prints lines like these (real values from this phone; your numbers follow your `-m`):

```text
INFO: ADB device found:
INFO:     -->   (usb)  PV4DDMIZZLTCIVSK   device  CPH1969
scrcpy-server: 1 file pushed
[server] INFO: Device: [OPPO] OPPO CPH1969 (Android 11)
INFO: Renderer: direct3d11
INFO: Texture: 472x1024
```

`INFO: Texture: <w>x<h>` is the proof that frames are actually arriving — that is the phone's
1080×2340 screen scaled down. Confirm on the phone side too:

```powershell
adb shell ps -A | findstr app_process     # two shell-owned entries = scrcpy server is running
```

**Controls** (verbatim from `scrcpy --help`; MOD is left-Alt or left-Windows key):

| Action | Shortcut |
|---|---|
| Your finger | move the mouse |
| Tap | left-click |
| Swipe / scroll | click-and-drag |
| Type | just type (into a focused field) |
| BACK | right-click · `MOD+b` · `MOD+Backspace` |
| HOME | middle-click · `MOD+h` |
| Recent apps | 4th-click · `MOD+s` |
| Notification panel | 5th-click · `MOD+n` (collapse: `MOD+Shift+n`) |
| Screen off (keep mirroring) / on | `MOD+o` / `MOD+Shift+o` |
| Power button | `MOD+p` |
| Rotate | `MOD+r` (window: `MOD+Left` / `MOD+Right`) |
| Fullscreen | `MOD+f` or `F11` |
| Pixel-perfect 1:1 window | `MOD+g` |
| Pinch-zoom / rotate | Ctrl + click-and-move |
| Two-finger tilt | Shift + click-and-move |
| Quit | `MOD+q` |
| Install an APK | drag an `.apk` file onto the window |

---

## 6. Run Inventory AI on the phone

### 6a. Prerequisite: a development (dev-client) build on the phone

A phone can only load JS from your laptop if a **dev client** is installed. Two ways to get one:

```powershell
# Cloud build (this project's normal route) — from mobile/
cd C:\Users\jeffe\inventory-ai\mobile
eas build --profile development --platform android

# ...then install the APK it produces:
adb install -r "C:\path\to\downloaded.apk"
```

A local alternative, `npx expo run:android`, would compile and install a dev client without an
EAS round-trip, but it **generates a native `mobile/android/` directory**. This project
deliberately keeps the Expo Continuous Native Generation architecture — no `android/` or
`ios/` directory exists or is committed, and EAS owns the native builds — so use the EAS
`development` profile here rather than generating native projects locally. (`/android` is
git-ignored, so the local route would not pollute git, but it is not this project's workflow.)

Installing a dev build **replaces** any standalone build of the same package
(`com.inventoryai.app`) on the phone, and vice versa — they cannot coexist. App data is kept
when the signing key matches.

Verify: `adb shell cmd package resolve-activity --brief -a android.intent.action.VIEW -d "inventoryai://expo-development-client/?url=http://localhost:8081"` should name
`com.inventoryai.app/.MainActivity`. If it says *No activity found*, you have a standalone
build installed, not a dev client.

### 6b. Start the backend (terminal 1)

```powershell
cd C:\Users\jeffe\inventory-ai\server
npm start                 # node src/index.ts — needs server\.env
```

Verify it is really ready before touching the phone:

```powershell
curl.exe http://localhost:4000/api/health/ready
```

Watch this window while you use the app: **every request the phone makes is logged here**, in
JSON, which is your end-to-end proof that the phone is talking to *your* laptop and not to
production.

### 6c. Point the app at this laptop, then start Metro (terminal 2)

```powershell
cd C:\Users\jeffe\inventory-ai\mobile
Get-Content .env | Select-String "EXPO_PUBLIC_API_URL"     # check the API URL
ipconfig | findstr /i "IPv4"                               # compare with your LAN address
npx expo start --dev-client
```

- `EXPO_PUBLIC_API_URL` must be a URL the **phone** can reach. On the same Wi-Fi that means
  `http://<laptop-lan-ip>:4000`, e.g. `http://192.168.1.4:4000`.
- If your laptop's IP changes (new network, new DHCP lease), update `mobile/.env` and restart
  Metro with `--clear`. `EXPO_PUBLIC_*` is **inlined at bundle time**, so a running Metro keeps
  serving the old value.
- `--clear` also fixes most stale-code weirdness.

### 6d. Launch the app on the device

Open the app the easy way — press **`a`** in the Metro terminal (Expo opens the dev client
against your dev server).

Or force it deterministically with a deep link — the scheme is `inventoryai`, and the inner URL
must be percent-encoded (`:` → `%3A`, `/` → `%2F`):

```powershell
$ip = "192.168.1.4"
adb shell am start -a android.intent.action.VIEW -d "inventoryai://expo-development-client/?url=http%3A%2F%2F${ip}%3A8081"
```

If you would rather not depend on Wi-Fi at all, use USB tunnelling instead:

```powershell
adb reverse tcp:8081 tcp:8081     # phone's localhost:8081 -> your Metro
adb reverse tcp:4000 tcp:4000     # phone's localhost:4000 -> your backend
# then set EXPO_PUBLIC_API_URL=http://localhost:4000 and restart Metro --clear
```

### 6e. Verify — three independent signals

1. **Metro served the bundle:** its terminal prints
   `Android Bundled 2930ms node_modules\expo-router\entry.js (1602 modules)`.
2. **The app is on the screen:** you see it in the scrcpy window. For text you can read
   mechanically: `adb shell uiautomator dump /sdcard/w.xml` then `adb exec-out cat /sdcard/w.xml` — **in Git Bash prefix it with `MSYS_NO_PATHCONV=1`, or MSYS silently rewrites the `/sdcard/` argument to a Windows path; it can also fail with `ERROR: null root node returned by UiTestAutomationBridge`, and a failed dump leaves a STALE file behind** (see 7e).
3. **It is talking to your laptop:** the terminal from 6b logs lines such as
   `{"ts":"...","type":"http","method":"GET","path":"/api/auth/me","status":401}`.

If (1) and (2) pass but (3) stays silent, the app is running but pointing somewhere else —
recheck `EXPO_PUBLIC_API_URL` and restart Metro with `--clear`.

### 6f. The edit → see loop

| Goal | How |
|---|---|
| Reload after an edit | files auto-reload; press **`r`** in the Metro terminal to force it |
| Open the dev menu | shake the phone, or `adb shell input keyevent 82` |
| See runtime logs | the Metro terminal prints `console.log` from the phone |
| Stop everything | `Ctrl+C` in each terminal, close the scrcpy window |

---

## 7. The authenticated walkthrough — registration, verification, and reading the log

Everything above gets the app **running on the phone**. This section gets you **signed in**, which
is a different job: it crosses Firebase, the mail provider and MongoDB, and the first successful
run is what creates a tenant.

> **Provenance — read this before trusting a step.** The tunnel, launch, bundle and
> "it is really talking to this laptop" steps in 7b were executed and verified on this machine on
> **2026-10-11** (OPPO CPH1969), and the four pre-flight probes in 7c were run against the live
> server with their real answers recorded below. The **full registration run end to end has not
> been performed yet** — 7d–7f are written from the code, with file references, so that the first
> attempt is diagnosable rather than a mystery. Treat them as a runbook, not as a transcript.
>
> **One measured correction, 2026-10-11 (roadmap §27AV):** an earlier session recorded the local database
> as "entirely empty". It is not, and the count behind that claim was taken against a database named
> `test` that does not exist. What is true, and what 7a now says, is that **no tenant exists for a new
> address** until verification completes. Probe 1b shows you how to read the name the server actually uses.

### 7a. What "authenticated" needs — and why the first run is special

Registration is **Firebase-first**, and the ordering *is* the security model:

```text
Firebase account  →  code mailed  →  you verify  →  MongoDB Business + User  →  Inventory AI JWT
```

No `Business`, no `User`, no JWT and no session row exist until the address is verified. Three
consequences you will otherwise mistake for bugs:

- **No `User`, no `Business` and no session exist for your address until the first person completes
  verification** — and that person **creates the tenant** and becomes its OWNER. The *database* itself is
  **not** empty: on this machine it is `inventoryai_dev_db`, which holds 11 acceptance-test tenants, every one
  of them empty. **Read the name off the server's boot line rather than assuming it** — see 7c probe 1b and 7e.
- After a first sign-in the inventory, dashboard, history and audit screens are **legitimately
  empty**. Nothing is broken; there is simply no data yet.
- An address that **already exists** in Firebase does not fail cleanly — see 7f.

### 7b. The USB tunnels (verified)

This is the variant that needs no Wi-Fi agreement between the phone and the laptop, and it is what
the 2026-10-11 run used. The phone's own `localhost` is forwarded to this laptop:

```powershell
adb reverse tcp:8081 tcp:8081     # phone's localhost:8081 -> your Metro
adb reverse tcp:4000 tcp:4000     # phone's localhost:4000 -> your backend
adb -s $serial reverse --list     # MUST list both
```

`mobile/.env` must then point at that loopback address, and Metro must be restarted because
`EXPO_PUBLIC_*` is inlined at bundle time:

```powershell
# mobile/.env
EXPO_PUBLIC_API_URL=http://localhost:4000

cd C:\Users\jeffe\inventory-ai\mobile
npx expo start --dev-client --clear
```

Launch the app against this Metro (the scheme is `inventoryai`; the inner URL must be
percent-encoded):

```powershell
adb shell am start -a android.intent.action.VIEW `
  -d "inventoryai://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

Then prove the three signals of step 6e — and note what each one actually proves:

| Signal | Where you see it | What it proves |
|---|---|---|
| `Android Bundled <n>ms node_modules\expo-router\entry.js (1602 modules)` | the Metro terminal | the **phone** fetched the JS from **this** Metro |
| `mResumedActivity: ... com.inventoryai.app/.MainActivity` | `adb shell dumpsys activity activities` | the app is the foreground activity, not a crash dialog |
| a new `{"type":"http",...}` line in the backend terminal | the backend terminal | the phone reached **this** laptop's API |

**Two tunnel gotchas, both observed on this machine:**

- **The tunnels do not survive an adb server restart or a replug.** After `adb kill-server`, a USB
  hiccup or a reboot, re-run both `adb reverse` commands and check `reverse --list` — the app will
  otherwise show a network error while everything else looks healthy.
- **After the adb daemon restarts, the phone can drop back to `unauthorized`** even though it was
  `device` minutes earlier. Unlock it and accept the prompt again (see the troubleshooting table).

To prove the tunnel **independently of the app** — worth doing when a screen is stuck — open the
API from the phone's own browser. A request you did not make from the laptop will appear in the
backend log:

```powershell
adb shell am start -a android.intent.action.VIEW -d "http://localhost:4000/api/health/live"
# backend log then shows: GET /api/health/live -> 200  (and a follow-up GET /favicon.ico -> 404)
```

### 7c. Pre-flight — prove the server can verify and mail *before* you type anything

Four probes, in order of what they rule out. **Run them from the repository root** — the
`.env` paths below are relative to it — and note that all four were run on 2026-10-11 and all
four passed:

```powershell
# 1. The server is up and MongoDB is reachable
curl.exe -s -o NUL -w "ready %{http_code}`n" http://localhost:4000/api/health/ready
# -> ready 200

# 1b. WHICH database it is serving — read it, never assume it. `MONGODB_DB_NAME` decides this and the
#     URI's path segment does not; a client built from the URI alone falls back to a database named
#     `test`, which here DOES NOT EXIST, so checking emptiness there proves nothing. The name is printed
#     once at boot (7e): look for `[db] connected to MongoDB`. On this machine it reads
#     `database: inventoryai_dev_db` — the correct one. (Before 2026-10-11 it read
#     `inventoryai_test_db`, the database `npm test` writes to and `npm run cleanup:test-mongodb`
#     EMPTIES — an account created there could be deleted by a test run. Repointed and restarted;
#     roadmap §27AV.)

# 2. THE decisive probe. A deliberately invalid token, on a route that verifies one.
curl.exe -s -X POST http://localhost:4000/api/auth/email-verification/request `
  -H "Content-Type: application/json" -d "{\"idToken\":\"not-a-real-token\"}"
```

Read the answer as a configuration report — this is why the probe is worth more than a code review:

| Answer | Meaning |
|---|---|
| code `FIREBASE_TOKEN_INVALID` (HTTP 400) | **all three are present** — Admin credentials, code pepper and a mail provider. Healthy. |
| HTTP 503 code `FIREBASE_NOT_CONFIGURED` | the Firebase service account is missing or unparseable |
| HTTP 503 code `EMAIL_VERIFICATION_NOT_CONFIGURED` | the 32+ character pepper, or the mail provider, is missing |
| HTTP 503 code `EMAIL_VERIFICATION_MAIL_FAILED` | the provider refused a send — but note this only fires *after* a valid token, so a bad-token probe never reaches it |

```powershell
# 3. Is Email/Password sign-in ENABLED for the Firebase project?
$key = (Get-Content .\mobile\.env | Select-String '^EXPO_PUBLIC_FIREBASE_API_KEY=').ToString().Split('=',2)[1]
curl.exe -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$key" `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"preflight-does-not-exist@example.invalid\",\"password\":\"not-a-real-password-1\",\"returnSecureToken\":false}"
# -> INVALID_LOGIN_CREDENTIALS / EMAIL_NOT_FOUND  = provider ENABLED, safe to proceed
# -> OPERATION_NOT_ALLOWED = BLOCKER: enable Email/Password in the Firebase console

# 4. Is the mail sender verified in Brevo?
$bk = (Get-Content .\server\.env | Select-String '^BREVO_API_KEY=').ToString().Split('=',2)[1]
curl.exe -s -H "api-key: $bk" -H "accept: application/json" `
  -H "User-Agent: InventoryAI-preflight/1.0" https://api.brevo.com/v3/senders
# -> {"senders":[{"email":"<your MAIL_FROM>","active":true}]}  — MAIL_FROM must appear here, active
```

> **If probe 4 answers 403 with a Cloudflare "Error 1010" page:** that is a *request-shape* block,
> not a Brevo refusal — a bare HTTP client is rejected before the API sees it. The
> `User-Agent` header above is the fix. Do **not** read it as "the sender is unverified".

### 7d. The journey, step by step — and what each step must leave in the log

Run this with the backend terminal visible. Each row's log evidence is what success looks like.

| # | On the phone | What the backend must log | Notes |
|---|---|---|---|
| 1 | Open the app, tap **New to Inventory AI? Create one** | *nothing* | a server line here means something else fired |
| 2 | Fill business name, your name, email, password → **Create Account** | *nothing yet* | this step talks to **Firebase over the phone's internet**, not to your laptop |
| 3 | *(automatic)* the app requests the verification code | `POST /api/auth/email-verification/request → 200`, then a `email_verification_code_requested` record | the code is mailed to the address the **token** names |
| 4 | Read the email, type the six digits, submit | `POST /api/auth/email-verification/confirm → 200`, then `email_verification_completed` | 5 attempts per code, 10-minute TTL |
| 5 | *(automatic)* tenant creation — this is where MongoDB changes | `POST /api/auth/firebase/register → 201` | **201**, the only 201 in this flow |
| 6 | *(automatic)* session exchange | `POST /api/auth/firebase/exchange → 200` | the JWT is minted here and nowhere else |
| 7 | You land on the dashboard | `GET /api/auth/me → 200`, then that screen's own list calls | empty lists are correct on a fresh tenant |

If step 2 succeeds and step 3 logs **nothing at all**, the app could not reach the API: check
`adb reverse --list` first, before reading anything else.

### 7e. Reading the backend log

Three shapes, and knowing which is which makes the rest obvious. The first two are JSON; the boot lines
are not, and they appear exactly once.

**Boot records** — printed when the server starts, and the only place the resolved database name is
visible:

```text
[db] connected to MongoDB (database: inventoryai_dev_db)
[server] environment=development listening on http://localhost:4000
```

**Read that name rather than assuming one.** The connection passes an explicit `dbName`, so `MONGODB_DB_NAME`
decides the database and the URI's own path segment does not. A client built from the URI alone falls back
to a database called `test` — on this machine that database **does not exist**, so counting documents
there proves nothing about the service. Before 2026-10-11 the local server read `inventoryai_test_db` — the
database the test suite writes to and `npm run cleanup:test-mongodb` empties, so a test run could delete what
a device run created. It now reads `inventoryai_dev_db`, which holds the owner's acceptance-test tenants.
Full account: roadmap §27AV.

**HTTP records** — one per request:

```json
{"ts":"2026-10-11T08:18:17.000Z","level":"info","type":"http","requestId":"...","method":"GET","path":"/api/health/live","status":200,"durationMs":1.9}
```

`path` is the **path only** — the query string is captured away — and **the request body is never
logged**. That is what keeps a Firebase ID token, a password or a verification code out of the log
by construction rather than by discipline.

**Event records** — the flow's own milestones, named by an allowlist:

| `type` | `reason` values | Means |
|---|---|---|
| `email_verification_code_requested` | — | a code became the identity's current challenge |
| `email_verification_completed` | — | the code was correct and Firebase recorded `email_verified` |
| `email_verification_failed` | `blank_code`, `invalid_code`, `mail_not_configured`, `mail_delivery_failure`, `mail_dispatch_error` | a code was refused, or could not be delivered |
| `email_verification_bridge_failed` | `firebase_token_invalid`, `firebase_not_configured`, `firebase_unavailable`, `firebase_unknown` | the code was **right** and the Admin write failed |
| `firebase_token_rejected` / `firebase_unavailable` / `firebase_not_configured` | an allowlisted SDK reason such as `malformed-token` | the token verifier's own verdict |

**None of these carry a uid, an email address, a code, an HMAC, the pepper or a token.** A log can
therefore be shared or pasted into an issue without redaction.

To keep a searchable copy instead of scrolling a terminal:

```powershell
cd C:\Users\jeffe\inventory-ai\server
npm start *> "$env:TEMP\inventoryai-server.log"        # all streams to one file

# in another window — the lines that matter, live
Get-Content "$env:TEMP\inventoryai-server.log" -Wait |
  Select-String 'email_verification|api/auth|firebase_|"status":5'
```

The Bash equivalent, if you are in Git Bash: `grep -aE 'email_verification|api/auth' file.log`.
Keep log files **out of the repository** — `$env:TEMP` is a good place; `.git/` also works and can
never be committed.

Two reading traps worth knowing:

- `curl` from **this laptop** and requests from the **phone** land in the same log. A request you
  made yourself is not evidence the app is connected; that is why 7b uses the phone's own browser.
- **In Git Bash the documented one-liner is silently sabotaged.** MSYS rewrites the `/sdcard/...`
  argument into a Windows path — `uiautomator dump /sdcard/w.xml` answers
  `UI hierchary dumped to: /Files/Git/sdcard/w.xml`, a location nothing reads. Set
  **`MSYS_NO_PATHCONV=1`** (or write `//sdcard/w.xml`) and it works. Measured 2026-10-12: with the
  flag the hierarchy dumped on the first attempt; the same command without it targeted the mangled
  path. PowerShell never had this problem, which is why the guide did not see it.
- **`uiautomator dump` is also genuinely intermittent on this device, flag or no flag.** In the
  2026-10-12 run it succeeded twice and then failed four consecutive times with
  **`ERROR: null root node returned by UiTestAutomationBridge`**. Treat it as a best-effort reader
  with a fallback, not a dependable one: fall back to the scrcpy window, to
  `dumpsys activity activities` for which activity is in front, and to OCR over
  `adb exec-out screencap -p`.
- **A FAILED dump leaves the PREVIOUS file in place, so a naive reader returns a STALE screen.**
  This is the trap that actually bites: on 2026-10-12 a stale dump showed the **Login** screen while
  the app was signed in and sitting on the dashboard — the server log (`firebase/exchange 200`,
  `dashboard 304`) is what caught it. Delete `/sdcard/w.xml` *and* your local copy before every
  dump, and treat a 0-byte read as a failure rather than as a screen.

### 7f. Failure → log line → cause → fix

| What you see | Backend log | Cause | Fix |
|---|---|---|---|
| *"Cannot reach the sign-in service. Check your connection and try again."* | **no line at all** | the **phone has no internet**. Firebase goes over the phone's data/Wi-Fi; only the API goes over USB. | reconnect the phone's data or Wi-Fi — the tunnel cannot help here |
| *"An account with this email already exists"* | no line | Firebase has that address and **this password does not open it** | sign in instead, or use a different address |
| You are **adopted** silently and land on the verify screen with a code in flight | `request → 200`, `code_requested` | the address already existed in Firebase and the **same password** opened it | expected, not an error — continue |
| Failure shown right after **Create Account** | `email_verification_failed` with `mail_delivery_failure`, or HTTP 503 | the send failed; the challenge was kept and its cooldown is **still running** | wait out the on-screen cooldown, then **Resend** |
| A resend is refused immediately | HTTP 429 `EMAIL_VERIFICATION_RATE_LIMITED` + `Retry-After` | the **60-second** cooldown | wait the seconds the app shows — it reads the server's own number |
| 429 persists across several attempts | 429 on every verify route | the **per-IP** limiter: 30 requests per 15 minutes, shared by everything the phone does | wait, or restart the server (development only) |
| *"That verification code is invalid or has expired"* | HTTP 400, `email_verification_failed` with `invalid_code` | wrong, expired (10 min), already used, or **5 attempts spent** | request a new code — note this one answer is deliberately the same for every one of those causes |
| A code was requested but never arrived | `code_requested` present, **no** failure record | it left the server | check **Spam/Promotions** — the sender is your own address, so it is in your own mailbox, not in the API's control |
| HTTP 503 `EMAIL_VERIFICATION_NOT_CONFIGURED` | same code | the pepper or the mail provider is missing | fix `server\.env`, restart the server |
| HTTP 503 `FIREBASE_NOT_CONFIGURED` | same code | the service account is missing/unparseable | fix `FIREBASE_SERVICE_ACCOUNT_JSON`, restart |
| HTTP 503 `FIREBASE_UNAVAILABLE` | `firebase_unavailable` | Google was unreachable | transient; try again |
| HTTP 400 `FIREBASE_TOKEN_INVALID` | `firebase_token_rejected` | the provider credential was rejected — expired, or **revoked** | in the app use **Wrong account? Sign out**, then start again. This is deliberately 400 and **not** 401, so a bad provider credential can never look like a lost session |
| The onboarding screen asks for your business name again | `exchange → 403 REGISTRATION_REQUIRED` | you verified, but the app no longer remembers the registration context — it is **in-memory** and an app restart clears it | type it again; this is the recovery path, not a defect |
| `409 EMAIL_IN_USE` | same code | a MongoDB account already owns that address | sign in to it |
| The screen spins and then fails, everything else looks fine | **no line** for the attempt | the USB tunnel dropped | `adb -s $serial reverse --list`, then re-run both `adb reverse` commands |

### 7g. What this runbook has and has not proven

**Verified on 2026-10-11:** the USB tunnels, Metro serving the bundle to the device, the launch
deep link, the phone's own request reaching this laptop's API, `mobile\.env` pointing at
`http://localhost:4000`, and all four pre-flight probes (Firebase Admin present, pepper present,
Brevo key live with the configured `MAIL_FROM` a verified active sender, Email/Password enabled for
the project).

**Not yet performed:** the registration journey itself, end to end, on the device — so steps 7d–7f
are code-derived. The first attempt should be treated as the test of this section, and the log
table above is what makes the outcome readable either way.

**Outside this machine's reach:** whether the mail provider's daily quota has room, and whether the
receiving mailbox files the code as spam. Neither is a code defect.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `scrcpy` is not recognised | PATH updated after the shell started | Open a **new** terminal, or `RefreshEnv`/re-login |
| `adb devices` empty | Cable is charge-only / USB debugging off / bad port | Data cable, different port, re-enable USB debugging |
| `unauthorized` | RSA prompt not accepted | Accept it; then Developer options → Revoke authorizations → replug |
| `offline` | Stale adb handle | `adb reconnect` then `adb devices`; if it persists, `adb kill-server` and replug |
| `more than one device/emulator` | Two devices attached | Add `-s $serial`, or `-d` for the USB one |
| scrcpy: `ERROR: Could not find any ADB device` | adb itself cannot see the phone | Fix `adb devices` first; scrcpy has no separate fix |
| scrcpy: `ERROR: Could not change "stay_on_while_plugged_in"` | **ColorOS/OriginOS refuses `WRITE_SECURE_SETTINGS` to the shell** — expected on OPPO/Realme/Vivo | Harmless: only stay-awake is skipped. Tick **USB debugging (Security settings)** in Developer options to get it, or just raise the phone's screen timeout |
| Mirroring is fine but taps do nothing | Input injection blocked by an OEM security policy | Enable **USB debugging (Security settings)**, then restart scrcpy |
| Phone screen stays black in the window | Screen asleep | `MOD+p`, or right-click (powers on when the screen is off) |
| `adb: failed to stat ...` when installing | You passed a Git-Bash path (`/tmp/x.apk`) to Windows adb | Use a Windows path (`C:\...`), or `cygpath -w` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Different signing key | `adb uninstall com.inventoryai.app` then install |
| App cannot reach the backend | IP changed, or Windows Firewall blocks inbound 4000 | Update `EXPO_PUBLIC_API_URL` + `--clear`; allow Node on **Private** networks; or use `adb reverse` |
| `ping 192.168.1.4` fails from the phone but the app works | Windows Firewall commonly drops ICMP while allowing TCP | **Do not trust ping** — test the real port instead |
| `Could not parse Expo config: google-services.json` while bundling | Those files are EAS-managed and not in the repo | Non-fatal warning; ignore |
| Metro: port 8081 in use | A previous Metro is still running | Close it, or answer its "use another port" prompt |
| Stale UI after changing `.env` | `EXPO_PUBLIC_*` is inlined at bundle time | `npx expo start --dev-client --clear` |
| `adb devices` returns `unauthorized` after it worked before | The adb server restarted (reboot, `adb kill-server`, USB hiccup) and the phone wants re-approval | Unlock and accept the prompt; if none appears, revoke authorizations in Developer options and replug |
| `uiautomator dump` writes to `/Files/Git/sdcard/w.xml` | **Git Bash rewrote the path**, not a device fault | prefix with `MSYS_NO_PATHCONV=1` (or use `//sdcard/...`) — see 7e |
| `uiautomator dump` prints `ERROR: null root node returned by UiTestAutomationBridge` | Intermittent: the shell could not read this window's accessibility tree on that attempt (seen here on Android 11 with the RN surface up) | **retry**, then fall back to the scrcpy window; `dumpsys activity activities` still names the foreground activity. Never trust the file left behind by a failed dump — delete it first — see 7e |
| The app reports a network error while the backend is healthy | The `adb reverse` tunnels were lost — they do not survive an adb server restart or a replug | Re-run both `adb reverse` commands; confirm with `adb -s $serial reverse --list` |
| A route the source clearly contains answers **404** — from the phone, or from the deployed host | **The server you are pointed at predates the route.** A long-lived `npm start` never reloads, so a process from yesterday serves yesterday's routes; an uncommitted change is the same fault one step further out | `curl` the route **from the laptop** first: `404` means restart the backend (`npm run dev` watches; `npm start` does not) or deploy. Only a `200`/`400` there makes the phone the suspect |
| *"Cannot reach the sign-in service"* while the API is reachable | Firebase Auth goes over the phone's **internet**, not the USB tunnel | Reconnect the phone's data/Wi-Fi |

---

## 9. The routine — do this every time

```powershell
# 1. plug the phone in, then:
adb devices                                  # must say "device"

# 2. mirror it
scrcpy -s PV4DDMIZZLTCIVSK -m 1024 --window-title "Inventory AI"

# 3. THE TUNNELS — required, and the step most often missed (see below)
adb reverse tcp:8081 tcp:8081                # phone's localhost:8081 -> Metro
adb reverse tcp:4000 tcp:4000                # phone's localhost:4000 -> backend
adb reverse --list                           # must list BOTH before you go on

# 4. terminal 1 — backend
cd C:\Users\jeffe\inventory-ai\server; npm start

# 5. terminal 2 — Metro, then press "a" to open the dev client on the phone
cd C:\Users\jeffe\inventory-ai\mobile; npx expo start --dev-client
```

Three windows: the phone mirror, the backend log, the Metro log. Edit code → the phone reloads;
if you change `.env`, restart Metro with `--clear`.

### Why step 3 exists, and why it bites

`mobile/.env` sets `EXPO_PUBLIC_API_URL=http://localhost:4000`. On the phone, `localhost` is the
**phone**, not your laptop — so without the `tcp:4000` tunnel the app loads fine (Metro works, because
`tcp:8081` *is* there) and then **every API call fails with** *"Cannot reach the server. Check your
connection and try again."*

The reason it is easy to miss: **Expo creates the 8081 tunnel for you, but nothing creates 4000.**
The dev client shows a running app, so the connection looks healthy — the only thing broken is the
one tunnel no tool bothered to add.

A reverse tunnel is bound to the **current ADB connection**, so it is lost on every replug, every
`adb` restart and every cable bump. Recreate both whenever `adb reverse --list` does not list them.
Two checks, in this order, tell you which half is broken:

```powershell
curl http://localhost:4000/api/health/ready   # on the laptop: must answer 200
adb reverse --list                            # must list tcp:8081 AND tcp:4000
```

A tunnel to a port nothing is listening on fails exactly like a missing tunnel, which is why the
`curl` comes first — it separates a dead backend from a missing tunnel. If you would rather not use
tunnels at all, set `EXPO_PUBLIC_API_URL` to the laptop's LAN address instead (Section 6) and put the
phone on the same Wi-Fi; the tunnel route needs no Wi-Fi at all and is the default here.

---

## 9b. Driving the app without touching the screen *(the headless recipe)*

When you are testing from here and would rather not use the mirror, a whole session can be driven and read over
`adb`. The coordinates below are **this** phone's (1080×2340) — take them from the dump each time, never from memory.

**Navigate by deep link instead of hunting for a tab.** The app registers the `inventoryai` scheme, so a route opens
directly:

```bash
adb shell am start -a android.intent.action.VIEW -d "inventoryai://ai"
# "Activity not started, intent has been delivered to currently running top-most instance."
# is the SUCCESS message: the running app navigated. It is not an error.
```

**Read the screen as text.** The UI hierarchy is the screen's own account of itself, and it is readable where a
screenshot is not:

```bash
MSYS_NO_PATHCONV=1 adb shell uiautomator dump /sdcard/ui.xml      # write it on the phone
MSYS_NO_PATHCONV=1 adb shell cat /sdcard/ui.xml | tr '>' '\n' \
  | grep -oE 'text="[^"]+"' | sed 's/text="//;s/"$//'             # read just the visible text
```

`MSYS_NO_PATHCONV=1` is **not optional under Git Bash**: without it the *laptop* rewrites `/sdcard/ui.xml` into
`C:/Program Files/Git/sdcard/ui.xml`, and both the dump and the read fail in a way that looks like the phone's fault.

**Take the coordinates from the dump — and re-read them after anything opens.** A node's
`bounds="[48,2040][756,2172]"` means tap its centre: `adb shell input tap 402 2106`. The trap that wastes real time:
**opening the keyboard lifts the input row**, so the Send button sat at y≈2103 with the keyboard closed and y≈1338
with it open. A tap at the old coordinates lands on the keyboard and **the message silently never sends** — the text
stays in the field, which looks exactly like the app ignoring you.

Type with `%s` for spaces and keep punctuation out of it:

```bash
adb shell input tap 402 2106                                   # focus the message field
adb shell input text "How%smuch%sstock%sdo%swe%shold"            # %s is a space
```

**Check that the field you meant to type into is the one that has focus.** `input text` goes to the focused view, and
a tap does not always move focus the way it looks like it did — signing in once, the password landed in the **email**
field and the login failed for a reason nothing on screen explained. Take a dump after the tap and confirm
`focused="true"` on the node you are about to fill; the same dump tells you the field's **current** bounds, which is
what the next tap needs.

**A blank screen after `input text` is usually the dev menu reloading, not a crash.** `input text` injects real
**hardware key events**, and React Native's development support maps a stray **`r`** — one that no text field consumed
— to *reload*. On 2026-10-20 that looked exactly like a defect: typing into a password field whose tap had **not** yet
focused it sent `r` to the activity, the React context was torn down and rebuilt (`getOrCreateReloadTask(): Starting
React Native reload`), and `screencap` showed an empty dark screen because the red-box overlay is a `SurfaceView`
that screenshots do not capture. Two lessons, both cheap: **confirm focus before typing** (the paragraph above), and
**read `adb logcat` for `Starting React Native reload` before calling anything a crash** — the app is fine, the
automation typed at the wrong thing. A password with no `r` in it (`Testpass9021`) removes the trap entirely.

**A tap that opens the Expo dev menu is the dev-client's overlay, not your app.** In a development build a floating
**`Tools`** control sits over the UI (on this phone at `[915,852][993,930]`). It is not part of Inventory AI; tapping it
opens the dev menu, and the next tap is swallowed by it as well. Press `BACK` to dismiss the menu and read the dump to
find the app's own control instead of trusting a remembered coordinate.

**Make sure the server you started is the server that answers.** This is the trap that cost the most time on
2026-10-17, and it is silent on Windows: **a second `npm start` can bind `:4000` successfully while a stale process
keeps serving every request** — the new one still prints `[server] environment=development listening on …`, and
`/api/health/ready` still answers `{"status":"ready"}` from the old one. Anything you changed in the environment
(a provider override, a feature flag) then looks like it was ignored, because the process reading it is not the one
handling your request.

```bash
netstat -ano | grep '0.0.0.0:4000'     # LISTENING  <pid>  <- compare with the PID you started
tasklist //FI "IMAGENAME eq node.exe"   # and look for more than one 'node src/index.ts'
```

The proof is always **the thing you pointed the config at** — a stub that logs its own requests, a feature flag's own
log line. Readiness, a startup banner and a bound port all identify *a* server, never *which*.

**This is now checked by the server itself (2026-10-18).** Every response carries an `x-instance-id` header, the
startup line prints the same id, and a boot asks the port it just bound to name itself — a different id there is
fatal (`port 4000 … is answered by a DIFFERENT server instance … NOT serving`), so the silent case is no longer
silent. Compare them by hand when you want certainty:

```bash
curl.exe -s -D - -o NUL http://localhost:4000/api/health/live | grep -i x-instance-id
```

A header id that does not match the `instance=` on the line you just watched means you are reading an older
server's logs and every request is going to it — the guard on the next boot will refuse to start rather than let
that happen again, but an already-running stale process still has to be stopped by hand (the commands above).

**Verify a turn from the server log, not by watching the screen.** Screen polling is slow and racy, and the backend
already records both halves of what you want to know:

```bash
grep -c '"path":"/api/ai/chat"' server/logs/server.log    # the turn count
grep '\[ai\] turn' server/logs/server.log | tail -1       # provider ms, tool ms, tokens, model, outcome
grep 'empty completion' server/logs/server.log            # the shape line, when one fires
```

**A whole pass, without the taps (2026-10-21).** Everything above is still the right way to *investigate*;
for a *repeatable* pass use the harness, which drives the same app by route and by label and leaves a
report behind:

```bash
node scripts/device/run.mjs --list
node scripts/device/run.mjs --all --product=<id>          # read-only: screens + label PDF decode
node scripts/device/run.mjs --journey=draft --allow-writes
node scripts/device/run.mjs --journey=draft --until=9      # stop after step 9, write state.json
```

It needs the phone, the development build and the two tunnels, and it exits **2** ("could not check")
rather than **1** when a precondition is missing — a signed-out session, no debuggable build, no
fresh PDF. Evidence from the run that produced it is in
[docs/evidence/device-runs](docs/evidence/device-runs/README.md).

The traps above are encoded in it, because each one cost a run: **`exec-out` for binaries** (`adb shell
cat` rewrote a PDF's newlines and a good label was reported undecodable), **distrust inverted dump
boxes** (a mid-scroll dump put "Create draft order" at y=1653, inside the quantity field), **close the
keyboard before tapping** (only when `dumpsys input_method` says it is open — a blind `BACK` left the
form entirely), and **dismiss the app's own confirmation** (a leftover "order created" dialog covered
the next journey's first screen).

---

## 10. Optional: go wireless *(documented, not verified on this machine)*

```powershell
# while still connected over USB (the phone must be on the same Wi-Fi as the laptop)
adb tcpip 5555
adb shell ip -4 addr show wlan0 | findstr inet      # read the phone's IP, e.g. 192.168.1.5
adb connect 192.168.1.5:5555
adb devices                                         # now lists 192.168.1.5:5555

scrcpy -s 192.168.1.5:5555 -m 1024                  # mirror with no cable
adb disconnect 192.168.1.5:5555                     # back to USB-only
```

Android 11+ also offers **Developer options → Wireless debugging → Pair device with pairing
code** (`adb pair <ip>:<pairing-port>`), which re-pairs without touching the cable. Wireless is
slower and can drop when the phone sleeps — USB remains the reliable default for long sessions.

---

## 11. References

- scrcpy: <https://github.com/Genymobile/scrcpy> — `scrcpy --help` is the authoritative flag list
- Android platform-tools: <https://developer.android.com/tools/adb>
- Expo development builds: <https://docs.expo.dev/develop/development-builds/introduction/>
