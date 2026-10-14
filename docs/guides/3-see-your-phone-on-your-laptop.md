# 3. Mirroring the phone to a laptop

**What this guide gets you:** the phone's screen in a window on the laptop, controlled by the
laptop's mouse and keyboard — with the phone still lying on the desk next to you.

This is useful for three reasons: the screen is bigger, you can copy text out of the phone, and you
can record a session as a video for a bug report. It is **optional** — the app runs on the phone
whether or not you mirror it.

---

## What the pieces are

| Piece | In plain words |
|---|---|
| **adb** | The tool that lets the laptop give the phone instructions over the USB cable |
| **scrcpy** ("screen copy") | A free program that streams the phone's screen to a window and sends your mouse/keyboard clicks back to the phone |

Mirroring rides entirely on `adb`. **If `adb` cannot see the phone, scrcpy never will** — so the
order below matters.

---

## Step 1 — install the two tools (once ever)

Run these in **PowerShell** or **Windows Terminal**. **Not WSL** — WSL cannot see your USB device.

```powershell
# What do you already have?
adb version
scrcpy --version
```

Install whatever is missing — no administrator rights needed:

```powershell
winget install --id Google.PlatformTools -e
winget install --id Genymobile.scrcpy -e --accept-source-agreements --accept-package-agreements
```

Then check them:

```powershell
scrcpy --version      # -> scrcpy 4.1 <https://github.com/Genymobile/scrcpy>
adb version           # -> Android Debug Bridge version 1.0.41
```

> ### ⚠️ Then open a NEW terminal window before continuing
> The installer adds the tools to a list of where programs live, and **a window that is already
> open will not see that update.** This is by far the most common "I installed it and it still says
> *not recognised*" cause. If `scrcpy` is not found, close the window, open a fresh one, and try
> again before believing anything else.

On this machine both are already installed, so you can skip this step entirely.

## Step 2 — let the phone accept instructions (once per phone)

1. On the phone: **Settings → About device** → tap **Build number** seven times.
2. **Settings → System settings → Developer options** (on OPPO/ColorOS: often *Additional
   settings*) → turn on **USB debugging**.
3. Also turn on **Stay awake** so the phone does not lock mid-session.

Full detail, including what to do if the menu is hidden, is in
[Guide 2, step 2](2-run-on-your-phone.md).

## Step 3 — plug in and authorise (once per laptop)

Use a cable that carries **data** (charge-only cables are a real failure mode). When the phone asks
*"Allow USB debugging?"*, tick **Always allow from this computer** and tap **Allow**.

Then verify on the laptop:

```bash
adb devices
```

| What it prints | What it means | What to do |
|---|---|---|
| `PV4DDMIZZLTCIVSK   device` | Ready | Go to Step 4 |
| `...   unauthorized` | The prompt was never accepted | Unlock the phone, accept it; or *Revoke USB debugging authorizations* and replug |
| `...   offline` | A stale connection | `adb reconnect`, or `adb kill-server` and replug |
| *(nothing listed)* | The laptop cannot see the phone | Cable, USB port, USB mode, or USB debugging off |

Note the serial on the left (`PV4DDMIZZLTCIVSK` on this machine) — you will use it in the next step.

## Step 4 — start mirroring

Open a **fresh** terminal window. (Mirroring takes over the window it runs in, so keep your backend
and Metro windows separate — see the routine at the end.)

```bash
scrcpy -s PV4DDMIZZLTCIVSK -m 1024 --window-title "Inventory AI"
```

| Part of the command | What it does |
|---|---|
| `-s PV4DDMIZZLTCIVSK` | Target this specific phone (use `-d` to mean "the one on USB") |
| `-m 1024` | Shrink the long edge to 1024 pixels so the window fits comfortably on a laptop |
| `--window-title "Inventory AI"` | Name the window so you can tell it apart |

Useful extras:

| Add this | To get |
|---|---|
| `--no-audio` | No audio streaming (Android 11+ sends audio by default) |
| `--record=session.mp4` | Also save the session as a video — ideal for bug reports |
| `--window-title` | A named window |
| `-w` | Ask to keep the phone awake (see the note below) |

> **A note on `-w` for OPPO/Realme/Vivo phones.** It asks the phone to stay awake. On some of these
> phones that request is refused without the extra, manufacturer-specific setting *"USB debugging
> (Security settings)"* in Developer options. If `-w` appears to do nothing, that is why — and the
> normal *Stay awake* toggle from Step 2 is the simpler answer.

### Closing a window rather than starting one

The terminal you launched scrcpy from **is** scrcpy's console: it prints the log and closing it
stops the mirror. So it needs its own window. Here is the shape of a working session:

| Window | Running |
|---|---|
| 1 | the backend (`npm start`) |
| 2 | Metro (`npx expo start --dev-client`) |
| 3 | **this one** — scrcpy (or the plain terminal you typed `adb` commands in) |

## Step 5 — prove it is really working

**A window appearing is not proof.** On success the console prints lines like these (real output
from this machine):

```text
INFO: ADB device found:
INFO:     -->   (usb)  PV4DDMIZZLTCIVSK   device  CPH1969
scrcpy-server: 1 file pushed
[server] INFO: Device: [OPPO] OPPO CPH1969 (Android 11)
INFO: Renderer: direct3d11
INFO: Texture: 472x1024
```

`INFO: Texture: <width>x<height>` is the line that matters — it means video frames are actually
arriving, that size being the phone's own screen scaled down. If you see it, mirroring is real.
You can double-check from another window:

```bash
adb shell ps -A | findstr app_process   # two shell-owned entries = the scrcpy helper is running
```

## Step 6 — driving the phone from the laptop

| Your phone action | On the laptop |
|---|---|
| Your finger | move the mouse |
| Tap | left-click |
| Swipe / scroll | click and drag |
| Type text | just type, with a text field focused |
| **Back** | right-click · `Alt+b` · `Alt+Backspace` |
| **Home** | middle-click · `Alt+h` |
| Recent apps | 4th mouse button · `Alt+s` |
| Notification panel | 5th mouse button · `Alt+n` |
| Turn the screen off / on (mirroring continues) | `Alt+o` / `Alt+Shift+o` |
| Rotate the phone | `Alt+r` |
| Fullscreen the window | `Alt+f` or `F11` |
| Exact 1:1 pixel window | `Alt+g` |
| Quit | `Alt+q` |

(`Alt` here is the left Alt or the left Windows key. This is the short list — `scrcpy --help`
prints every shortcut.)

**Install an app by dragging:** drop an `.apk` file onto the mirroring window and it is installed on
the phone. That is a convenient way to install a development build without typing an `adb install`
command.

---

## Optional: going wireless *(documented, but not tested on this machine)*

Once mirroring works over the cable, you can cut it — the phone must be on the same Wi-Fi as the
laptop:

```bash
adb tcpip 5555
adb shell ip -4 addr show wlan0 | findstr inet   # read the phone's address, e.g. 192.168.1.5
adb connect 192.168.1.5:5555
adb devices                                      # now also lists 192.168.1.5:5555
```

Then use `scrcpy -s 192.168.1.5:5555`. To go back to the cable, unplug and replug.

**Honesty note:** this variant is written from the tool's own documentation, not from a successful
run on this machine — treat it as a suggestion, and prefer the cable if anything is unclear.

---

## If something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| `scrcpy` is not recognised | The terminal predates the install | **Open a new terminal window** |
| `adb devices` is empty | Cable/port/USB mode | Try a different cable and port; switch USB mode to *File transfer*; recheck Step 2 |
| The window opens, then closes instantly | Usually no device or an authorisation problem | Read the last lines printed in the window |
| The window is black | Screen off, or the phone is showing a secure screen | Wake the phone; note that some secure screens never appear in a mirror |
| `unauthorized` after working earlier | The phone trust was revoked, or `adb` restarted | Unlock the phone and accept the prompt again |
| The window is too small / too large | The `-m` value | `-m 1024` is a good default; drop it for the full size, or press `Alt+g` for 1:1 |
| Clicks go to the wrong place | The phone is in a different orientation from the window | Press `Alt+r` to rotate |
| It worked yesterday, not today | Cable was bumped, laptop slept | `adb kill-server`, replug, `adb devices` |

---

## The everyday routine, all together

```bash
# 1. plug the phone in
adb devices                    # must say "device"

# 2. mirror it (its own terminal window)
scrcpy -s PV4DDMIZZLTCIVSK -m 1024 --window-title "Inventory AI"

# 3. the tunnels — required, and the step most often missed
adb reverse tcp:8081 tcp:8081
adb reverse tcp:4000 tcp:4000
adb reverse --list             # must list both

# 4. backend
cd C:/Users/jeffe/inventory-ai/server && npm start

# 5. Metro
cd C:/Users/jeffe/inventory-ai/mobile && npx expo start --dev-client
```

Full context for steps 3–5 is in [Guide 2](2-run-on-your-phone.md).

**The deep reference** for everything in this guide is
[docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md](../DEVELOPING_ON_A_PHYSICAL_DEVICE.md) — verified on a
real OPPO CPH1969, with the full troubleshooting table and the signed-in walkthrough.
