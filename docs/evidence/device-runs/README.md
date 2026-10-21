# Device runs — the automated acceptance harness's evidence

These directories are the output of `node scripts/device/run.mjs`, the repeatable device pass that
replaced hand-written `adb input tap` coordinates. Each run writes `report.md` (what ran, what each
step saw, and the exit code in words), `report.json` (the same as data) and its screenshots.

**Run: OPPO CPH1969 · Android 11 (API 30) · serial `PV4DDMIZZLTCIVSK`**, 2026-10-21, Expo SDK 58
development build over the USB tunnels (`adb reverse tcp:4000` + `tcp:8081`) against the local
server, signed in as `role-owner@example.invalid` (the four-role fixture tenant, §27CT — a
disposable dataset, which is why a write journey is allowed to run here).

| directory | journey | result |
|---|---|---|
| `2026-10-21T17-02-36-863Z-smoke` | every main screen opens and names itself | **17/17 pass** |
| `2026-10-21T17-03-08-653Z-label` | print → the PDF the app wrote → decode its barcode | **7/7 pass** |
| `2026-10-21T17-03-31-725Z-draft` | create a draft purchase order from the phone | **14/14 pass** |
| `2026-10-21T16-45-04-846Z-label` | the **first** label run — kept as a defect record | **4/5, FAIL** |

The label journey read `2000053300018` off the product screen, decoded the PDF the Share action
wrote as **the same code, 95 modules, 30 bars, 4 pt module**, and that PDF was produced by the
device's own Skia pipeline. The draft journey left a real draft order behind (`Draft PO-0002`) and
dismissed its own confirmation.

**The kept failure is the useful one.** `16-45-04` reported *"contains no decodable EAN-13"* on a
label that was completely correct: the harness read the PDF with `adb shell cat`, whose
pseudo-terminal rewrites every LF as CRLF, so 11,225 bytes arrived as 11,472 and the extra bytes
landed inside a Flate-compressed content stream. `scripts/device/adb.mjs` now reads binaries with
`exec-out`, and `server/test/device-harness.test.mjs` fails if it ever goes back. A harness whose
first instinct is to blame the app is worse than none, so the evidence of it blaming the app is
kept.

**What these runs do NOT prove.** iOS (no macOS on this host — Phase 30B stays open), physical paper
(no printer; the PDF decode rules out clipped or distorted bars but it is not a scan of paper), and a
camera reading a barcode in the room, which stays a manual item — though that too has now been done
by hand on real packaging: the owner entered the barcode of a *Clearance Multi-Purpose Wipes* pack,
scanned the pack with the app, and the app opened the record for that product.

**Re-running** needs the phone connected, the development build installed and the tunnels up — see
[DEVELOPING_ON_A_PHYSICAL_DEVICE.md](../../DEVELOPING_ON_A_PHYSICAL_DEVICE.md):

```bash
node scripts/device/run.mjs --list
node scripts/device/run.mjs --all --product=<product id>   # read-only: smoke + label
node scripts/device/run.mjs --journey=draft --allow-writes # writes to the tenant
```

Exit codes follow the repository's convention: **0** every step passed, **1** a step failed (the app
did something wrong), **2** a step was blocked (no device, no session, no debuggable build, no
artifact) — never reported as a pass.
