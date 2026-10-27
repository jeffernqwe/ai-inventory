# 3. Mirroring the phone to a laptop

Shows the phone screen in a laptop window, controlled by the laptop's mouse and keyboard. Optional —
the app runs whether or not you mirror it. Mirroring rides on `adb`, so if `adb` cannot see the phone,
scrcpy will not either.

## Step 1 — install (once ever)

Install `adb` and get the phone authorised first: [Guide 2, Steps 1–3](2-run-on-your-phone.md)
installs it, turns on USB debugging, and ends with `adb devices` printing `device`. Mirroring needs
nothing more of the phone than that.

Then scrcpy, in **PowerShell** or **Windows Terminal**, not WSL (WSL cannot see USB devices):

```powershell
scrcpy --version
winget install --id Genymobile.scrcpy -e --accept-source-agreements --accept-package-agreements
```

**Open a NEW terminal window afterwards** — an open window does not see the installer's updated
program list, which is the usual cause of "installed but not recognised".

## Step 2 — start mirroring

Use its own terminal window (the window you launch from becomes scrcpy's console, and closing it
stops the mirror).

```bash
scrcpy -s PV4DDMIZZLTCIVSK -m 1024 --window-title "Inventory AI"
```

| Part | Does |
|---|---|
| `-s PV4DDMIZZLTCIVSK` | Target this phone (`-d` means "the one on USB") |
| `-m 1024` | Shrink the long edge to 1024 px |
| `--window-title "Inventory AI"` | Name the window |

Extras: `--no-audio` (no audio stream), `--record=session.mp4` (save a video for bug reports),
`-w` (ask the phone to stay awake — on OPPO/Realme/Vivo this needs *"USB debugging (Security
settings)"* enabled, so prefer the *Stay awake* toggle from Step 2).

## Step 3 — prove it is working

A window appearing is not proof. A real run prints:

```text
INFO: ADB device found:
INFO:     -->   (usb)  PV4DDMIZZLTCIVSK   device  CPH1969
[server] INFO: Device: [OPPO] OPPO CPH1969 (Android 11)
INFO: Texture: 472x1024
```

`INFO: Texture: <width>x<height>` means frames are arriving. Double-check from another window:

```bash
adb shell ps -A | findstr app_process   # two shell-owned entries = scrcpy helper running
```

## Step 4 — driving the phone

| Phone | Laptop |
|---|---|
| Finger / tap / swipe | mouse / left-click / click-drag |
| Type text | type with a field focused |
| Back | right-click · `Alt+b` · `Alt+Backspace` |
| Home | middle-click · `Alt+h` |
| Recent apps | 4th mouse button · `Alt+s` |
| Notification panel | 5th mouse button · `Alt+n` |
| Screen off / on | `Alt+o` / `Alt+Shift+o` |
| Rotate | `Alt+r` |
| Fullscreen | `Alt+f` or `F11` |
| 1:1 pixels | `Alt+g` |
| Quit | `Alt+q` |

Drag an `.apk` onto the window to install it — a convenient alternative to typing
`adb install thefile.apk`. `scrcpy --help` lists every shortcut.

## Optional: wireless (documented, not tested here)

Phone and laptop on the same Wi-Fi:

```bash
adb tcpip 5555
adb shell ip -4 addr show wlan0 | findstr inet   # read the address, e.g. 192.168.1.5
adb connect 192.168.1.5:5555
adb devices
scrcpy -s 192.168.1.5:5555
```

Unplug and replug to return to the cable.

## If something goes wrong

| What you see | Cause | Do |
|---|---|---|
| `scrcpy` not recognised | Terminal predates the install | Open a new terminal |
| `adb devices` empty | Cable/port/USB mode | Another cable and port; USB mode *File transfer*; recheck Step 2 |
| Window opens then closes | No device, or authorisation | Read the last printed lines |
| Window is black | Screen off, or a secure screen | Wake the phone; some secure screens never mirror |
| `unauthorized` after working | Trust revoked, or `adb` restarted | Unlock and accept again |
| Window wrong size | `-m` value | `-m 1024`, full size, or `Alt+g` |
| Clicks land wrong | Orientation mismatch | `Alt+r` |
| Worked yesterday | Cable bumped, laptop slept | `adb kill-server`, replug, `adb devices` |

## Everyday routine

```bash
adb devices                                  # must say "device"
scrcpy -s PV4DDMIZZLTCIVSK -m 1024 --window-title "Inventory AI"   # own window

adb reverse tcp:8081 tcp:8081                # tunnels — see Guide 2
adb reverse tcp:4000 tcp:4000
adb reverse --list                           # must list both

cd C:/Users/jeffe/inventory-ai/server && npm start
cd C:/Users/jeffe/inventory-ai/mobile && npx expo start --dev-client
```

Deep reference: [docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md](../DEVELOPING_ON_A_PHYSICAL_DEVICE.md).

← [Guides index](README.md)
