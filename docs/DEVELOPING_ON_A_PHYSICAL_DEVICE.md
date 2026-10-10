# Developing on a Physical Android Device (Windows)

How to mirror and control your **real** Android phone from your Windows laptop and run
Inventory AI on it — no emulator. This is a developer-workflow guide, not an architectural
record; it changes no product behaviour.

Steps 1–6 and the troubleshooting table were executed and verified on this machine
(2026-10-10) against an **OPPO CPH1969 running Android 11 (SDK 30)**, with scrcpy 4.1 and
adb 37.0.1. Two things are **upstream-documented rather than verified here**, and are marked
as such below: pressing `a` in the Metro terminal (step 6d — the deep link is the verified
route) and the wireless setup (step 9).

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
| `--tcpip=PHONE_IP` | Switch to a wireless connection (step 9) |

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
   mechanically: `adb shell uiautomator dump /sdcard/w.xml` then `adb exec-out cat /sdcard/w.xml`.
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

## 7. Troubleshooting

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

---

## 8. The routine — do this every time

```powershell
# 1. plug the phone in, then:
adb devices                                  # must say "device"

# 2. mirror it
scrcpy -s PV4DDMIZZLTCIVSK -m 1024 --window-title "Inventory AI"

# 3. terminal 1 — backend
cd C:\Users\jeffe\inventory-ai\server; npm start

# 4. terminal 2 — Metro, then press "a" to open the dev client on the phone
cd C:\Users\jeffe\inventory-ai\mobile; npx expo start --dev-client
```

Three windows: the phone mirror, the backend log, the Metro log. Edit code → the phone reloads;
if you change `.env`, restart Metro with `--clear`.

---

## 9. Optional: go wireless *(documented, not verified on this machine)*

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

## 10. References

- scrcpy: <https://github.com/Genymobile/scrcpy> — `scrcpy --help` is the authoritative flag list
- Android platform-tools: <https://developer.android.com/tools/adb>
- Expo development builds: <https://docs.expo.dev/develop/development-builds/introduction/>
