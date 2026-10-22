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
| `2026-10-21T18-07-22-585Z-stock` | stock 5 in and 5 out, arithmetic read from the app | **17/17 pass** |
| `2026-10-21T18-09-45-957Z-transfer` | transfer 1 across and 1 back, both legs | **21/21 pass** |
| `2026-10-22T05-17-17-031Z-smoke` | the launcher recovery: the harness started the bundle itself | **17/17 pass** |
| `2026-10-22T05-21-08-672Z-stock` | the same stock pass **a day later** — same numbers | **17/17 pass** |
| `2026-10-22T05-22-52-514Z-transfer` | the same transfer pass **a day later** — same numbers | **21/21 pass** |
| `2026-10-21T16-45-04-846Z-label` | the **first** label run — kept as a defect record | **4/5, FAIL** |
| `2026-10-21T17-41-33-320Z-stock` | a picker's **label** was tapped instead of its control | **3/4, FAIL** |
| `2026-10-21T17-52-36-243Z-stock` | the app held a session the server no longer accepted | **3/4, FAIL** |
| `2026-10-22T05-09-51-488Z-smoke` | the **Expo dev launcher** was in front, not the app | **1/2, FAIL** |
| `2026-10-22T05-53-11-769Z-smoke` | renewal refused the expired token; **every data request was 401** while the screens rendered | **17/17, but not a pass in fact** |
| `2026-10-22T06-06-32-285Z-smoke` | the **same phone state** after the AUTH-03 fix: renewals 200, data served, **no sign-in** | **17/17 pass** |
| `2026-10-22T06-46-06-372Z-smoke` | the smoke journey **asserting data** (19 steps): 6 stock rows, 2 product rows named off the screen | **19/19 pass** |
| `2026-10-22T06-42-53-368Z-smoke` | the same journey with the **API deliberately stopped** — the must-trip control | **4/5, exit 1** |
| `2026-10-22T06-41-07-892Z-smoke` | the first data pass — kept because its products pattern matched the **search box** | **19/19, but one assertion was chrome** |

The label journey read `2000053300018` off the product screen, decoded the PDF the Share action
wrote as **the same code, 95 modules, 30 bars, 4 pt module**, and that PDF was produced by the
device's own Skia pipeline. The draft journey left a real draft order behind (`Draft PO-0002`) and
dismissed its own confirmation.

**The two stock journeys are net-zero on purpose.** `stock` moves 5 in and 5 out, `transfer` moves 1
across and 1 back, and both check the app's own `from → to` line (measured: `33 → 38` then `38 → 33`;
`33 → 32, 32 → 33`). A journey a person can run on every build must not quietly raise a product's
quantity each time, and asserting a **delta** rather than an absolute number is what lets the same
steps still mean something on the tenth run. The two runs above were executed **a day apart** and
reported the **same numbers**, which is that claim measured rather than assumed. They are write journeys, so they need
`--product=<id> --source=<location> [--destination=<location>] --allow-writes`.

**A smoke pass is not proof of a signed-in app — the 2026-10-22 runs are how that changed.**
`05-53-11` reports 17/17 while the server was refusing every data request with `401 SESSION_EXPIRED`,
because the journey asserted each screen's **headings**, and a heading renders over an empty list as
well as a full one. That run is kept as the evidence for the AUTH-03 fix (*"AUTH-03's recovery path
never ran"*): the phone held a live 14-day session, renewal was refused because the route sat behind
`requireAuth`, and the next run (`06-06-32`, with the fixed server and **no sign-in in between**)
renewed three times and served the dashboard.

**The journey now asserts data, and was made to fail on purpose to prove it.** Each `expectData` step
waits for a label only the server's data can produce — a stock row's `33 available · 33 on hand`
arithmetic, a product row's `SKU … · Barcode …` — and fails if the screen lands in its error state
first. Three runs, in this order, with no sign-in between any of them:

| run | what it shows | result |
|---|---|---|
| `06-46-06` | the assertion passing on real rows: `6 row(s), e.g. "… Shop Front, 33 available · 33 on hand …"`, `2 row(s), e.g. "SKU ROLESKU-202 · Household · Barcode 2000053300018"` | **19/19 pass** |
| `06-42-53` | the same journey with the API stopped: `expected stock rows, but the screen is showing its error state ("Something went wrong")` | **exit 1** — the control |
| `06-41-07` | the first attempt, whose products pattern matched `Search by name, SKU or barcode…` — the search box, not a row | **19/19, one assertion was chrome** — kept as a defect record |

The last row is why the patterns are **anchored**: a data check that can match the screen's own search
placeholder would restore the green report without restoring the evidence.

**An empty tenant blocks, it does not pass.** A screen showing `Nothing to show` yields **exit 2**
("nothing to prove"), so a disposable tenant with no stock is never recorded as data having loaded.

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
node scripts/device/run.mjs --journey=stock --product=<id> --source="Shop Front" --allow-writes
node scripts/device/run.mjs --journey=transfer --product=<id> --source="Shop Front" \
  --destination="Main Warehouse" --allow-writes
```

Exit codes follow the repository's convention: **0** every step passed, **1** a step failed (the app
did something wrong), **2** a step was blocked (no device, no session, no debuggable build, no
artifact) — never reported as a pass.
