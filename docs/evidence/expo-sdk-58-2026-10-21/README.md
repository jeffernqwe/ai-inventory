# Expo SDK 58 — Android acceptance on a real phone (2026-10-21)

This is the device-measured record of the first run of the **SDK 58** build. It exists because the
SDK upgrade changed `expo`, `react`, `react-native` and every Expo package at once, and a green
`tsc`, a green Jest suite and a successful EAS build say nothing about whether the app *runs*. Every
claim below was observed on the device named here; anything that was not observed is listed in
**Not verified** rather than implied.

Artifacts (screenshots, the printed label PDF, the one-off decoder used on it during the pass, and
`scan-target.html` — the page that displayed a real product barcode for the laptop-facing scan) are
in this folder. The commit-time CI fixtures live in `scripts/fixtures/`, not here.

## The build under test

| | |
|---|---|
| EAS build | `b1fecde3-fa6f-4235-829d-5bc35a72ea58` — `FINISHED`, `development` profile, Android |
| Built | 2026-10-21T12:39:34Z |
| Commit | `93f9130` — *chore(mobile): upgrade to Expo SDK 58 and React Native Firebase 27* |
| Versions | `expo` 58.0.16 · `react-native` 0.88.0 · `react` 19.3.0 · `@react-native-firebase/*` 27 |
| Device | OPPO **CPH1969**, Android **11** (API 30), `arm64-v8a` |
| Native levels | `minSdk 24`, `targetSdk 36` — read from the installed APK (`dumpsys package`); `compileSdk 37` from `react-native/gradle/libs.versions.toml` in the tested tree |
| Backend | local server, `node src/index.ts`, `http://localhost:4000` over `adb reverse tcp:4000` (the dev build resolves its API base to localhost) |
| Server code | same commit `93f9130` (includes AI-34 at `a0969f9`) |
| Tenant | `joffy inplay` (OWNER), the 50,626-product performance seed |

The APK was installed over the previous preview build with `adb install -r`, and the app was driven
through the real UI — taps and typing on the mirrored screen, not a mock or a harness. Metro served
the bundle; no red box appeared at any point.

## Sign-in

Firebase email/password sign-in completed and the exchange minted an Inventory AI session: dashboard
loaded with live counts (42,910 in stock / 7,716 low / 3,077 out of stock / 50,626 active) and the
sessions screen listed the device as `Android CPH1969`, signed in 20:48, last active 20:53 — i.e.
the AUTH-03 renewal wrote through.

Two detours worth recording, neither an SDK 58 defect:

- **The session ended once mid-pass** and the app returned to Login. Re-signing in restored
  everything; no token error was shown and nothing was lost.
- **A sign-in attempt with `perf-seed-ai@example.invalid` answered `Invalid email or password`.**
  That address is not a Firebase identity on this project (it names a database tenant from the
  performance seed), so the refusal is correct. It is recorded because the message appeared on
  screen during the pass and could otherwise be mistaken for a regression.

## What was exercised, and what it did

All times are the server's own `durationMs` for the request, read from the request log.

| Journey | Observation | Artifact |
|---|---|---|
| Inventory list | Search across name/SKU/barcode, Low and Out filters, per-location filter; applying Low stock re-queried and narrowed the list to at/under-minimum rows, whose badges agree with their stock records | `03-inventory-low-filter.png` |
| History | Header read *71,073 movements, newest first*; the pass's own Stock in row was first, `+5`, dated 20:52 | `06-history-after-stock-in.png` |
| Stock record | Product, location, unit, minimum, reserved, updated, available and on-hand all render; 0 → 5 after Stock In | `04-stock-record.png` |
| **Stock In** | `POST /api/inventory/stock-in` **201 / 627 ms**; alert *"0 → 5"*; history row `+5` at 20:52; audit row the same minute | `05`, `06`, `14` |
| **Transfer** | `POST /api/inventory/transfer` **201 / 1,084 ms**; both legs applied — Main Warehouse 416 → 413, Transit Hub 0 → 3; inventory list then showed Transit Hub at 3 | `07-transfer-done.png` |
| **Stock Out** | `POST /api/inventory/stock-out` **200 / 576 ms**; 5 → 3 | `08-stock-out-done.png` |
| **Adjust** | `POST /api/inventory/adjust` **200 / 856 ms**; 3 → 4; record refreshed to "Updated 20:58" | `09-adjust-done.png` |
| Products | List with Active/Archived, Low/Out, category and location filters; detail with EAN-13 preview and both label actions | `11-print-preview.png` |
| Categories | Active list (Deli, Butcher, Produce, Dairy…) with Edit / Archive per row | — |
| Locations | Active list with Edit / Archive per row | — |
| Suppliers | Search, Active/Archived, seeded rows with contact and email | — |
| Purchase orders | Search, status filter, open/received/canceled badges, `n of m received` | — |
| Restock | 7,716 products at or below minimum, most urgent first, each with availability vs minimum | — |
| Audit log | Shows the pass's own writes: *Stock in* at 20:52 and *Signed in* at 20:48 | `14-audit-log.png` |
| Users | Owner row with a `You` marker and role | — |
| Profile / Sessions | Owner, Active, email; three sessions with device name and last-active time | `15-sessions.png` |
| **AI Assistant** | A real turn answered *"You hold 12,540,196 units on hand across 50,626 active products. In stock: 42,910. Low: 7,716. Out: 3,076"* using `getInventorySummary`; `POST /api/ai/chat` **201 / 14.1 s** | `10-assistant-answer.png` |
| **AI failover, live** | The configured primary `nvidia/nemotron-3-super-120b-a12b:free` answered **HTTP 404**; the turn walked to `nvidia/nemotron-3-ultra-550b-a55b:free`, which answered — `failovers=1`, `calls=3`, `iterations=2`, and the answer was correct | server log |
| **Label print → PDF** | Android print preview rendered the label (name, barcode, page 1/1); *Save as PDF* produced `Document (2).pdf` (9,451 bytes) in Downloads | `11-print-preview.png`, `16-printed-label.pdf` |
| **The PDF's barcode decodes** | The content stream holds 30 filled bars; they decode to **`2000053337540`**, exactly the product's code, at 95 modules × 4.0 pt — the full pattern is present, not clipped | `decode-ean13-from-pdf.mjs` |
| Share PDF | Share sheet opened with a `*.pdf` payload and real targets (Drive, My Files, Gmail, Nearby Share) | `12-share-sheet.png` |
| **Scanner** | Camera permission gate → system prompt → preview; a real barcode in view decoded as EAN-13 `2000053344760` and the app answered *Product not found* for it with *Scan again* | `13-scan-not-found.png` |
| **Scanner, registered code** | The seeded product's `2000053337540` label displayed on the laptop and scanned by the phone: `GET /api/products/barcode` **200 / 326.6 ms**, then `GET /api/inventory` 471 ms later — the product's stock record opened, as reported on screen. The unregistered code above answered `404` at 13:06:14 the same session, so both outcomes are measured | server log |
| **Purchase order — create** | Supplier *Deluxe Industries 1004*, location *Shop Front*, one line *Classic Mug 10200 × 24*; `POST /api/purchase-orders` **201 / 950.9 ms**, *Draft PO-0001 created — issue it when you're ready to receive.* | `19-po-created.png` |
| **Purchase order — issue** | `POST /api/purchase-orders/:id/issue` **200 / 625.9 ms**; Draft → **Open**, *PO-0001 is now open for receiving.* | — |
| **Purchase order — receive** | `POST /api/purchase-orders/:id/receive` **200 / 1,290.4 ms**, *Received 24 unit(s) across 1 line. This order is now fully received.* Read back through the API: Shop Front stock **0 → 24**, inventory history `STOCK_IN 24 — reference PO-0001` at the receive timestamp, order `RECEIVED`, `Ordered 24 · Received 24 · Remaining 0` | `20-po-received.png`, `21-po-received-detail.png` |
| **Assistant quota copy** | A turn answered `429 AI_QUOTA_EXCEEDED` and the screen read *"The assistant has used today's request allowance. It resets at midnight UTC (8AM in Manila) — the rest of the app works as usual."* The refusal came from a **local pass-through proxy** in front of the real API that answers only `POST /api/ai/chat` with the server's own body — no allowance was spent, and every other request reached the real server | `18-quota-copy.png` |

The AI turn is the interesting corroboration: it did not merely render, it read the tenant through
the read-only tool and reported the same population the dashboard did minutes earlier (the
out-of-stock count moved 3,077 → 3,076 because this pass had just taken one product off zero).

## Device health checks

- **ISS-02 (RNFirebase Auth PII):** `adb logcat -d` contained **zero** occurrences of the signed-in
  email address or the Mongo user id across the whole buffer, on this build, after a full sign-in.
  This is the half the JavaScript guard says it cannot prove (`iss-02-rnfirebase-auth-pii-patch`
  proves the dependency is v27 and that no patch or `postinstall` survives, and that the published
  source has no user-object log; it cannot read a phone). The patch is gone because **RNFirebase 27
  removed the call upstream**, so what is clean here is the dependency itself, not a local patch.
- **Crashes / ANRs:** no `FATAL EXCEPTION` and no `ANR in com.inventoryai.app` on 2026-10-21. The
  only fatal lines in the buffer are from 2026-10-20, in unrelated processes.
- **ISS-06 (generated Android levels):** `minSdk 24` / `targetSdk 36` measured from the installed
  APK; `compileSdk 37` read from RN 0.88's own `libs.versions.toml`. `app.json` declares
  `expo-build-properties` with `minSdkVersion: 24` and `kotlinVersion: 2.4.0`; nothing else overrides
  a level.

## A defect the new permanent check found, and the fix

The label check (`scripts/verify-label-barcode.mjs`, wired into CI) was extended from "does the
pattern decode" to "does the document's geometry hold", and it failed immediately on both counts:

- **No right-hand quiet zone.** The printed SVG was `11 + 95` modules wide — an 11-module quiet zone
  before the bars and none after them, so the bars ran to the edge of the image box. `QUIET_MODULES`
  documents 11 modules "either side", and the on-screen preview had always padded both, so the
  printed document contradicted both. Fixed by adding the trailing quiet zone.
- **A label wider than its page.** `barcodeLabelHtml` accepted `moduleWidth` but kept the page at
  595 pt: module 6 asked for **702 pt of label on a 595 pt page**, which is the F-1 clipping failure
  reachable by changing one argument. Fixed by growing the page to the label (never by scaling the
  bars down — a module below a scanner's resolution cannot be read either).

Both are guarded now: the CI check fails with the measured numbers if either is reverted. The fixed
label was then produced on this phone (*Share PDF* → *Save to My Files*), pulled off, and decoded:
its label box is **468 pt = 117 modules** against the original artifact's **424 pt = 106 modules**,
its digit line is re-centred by 22 pt, and its bars still decode to `2000053337540` at 95 modules ×
4.0 pt. It is committed as `scripts/fixtures/label-2000053337540-both-quiet-zones.pdf` and decoded on
every CI run beside the original.

## Checks that failed, and what was done

**`expo-sdk-pins` failed on the branch — and it was right.** The upgrade made
`expo-build-properties` a direct dependency (the app now declares its own Android levels), and the
package is in the SDK's pin table, so the guard compared it and found it missing from
`.github/dependabot.yml`'s ignore list. Fixed by adding the entry, with the reason written beside it.
Both suites then pass.

**One full-suite Jest run failed `po-form-create-navigation` with a 5 s test timeout** while the
machine was also running the emulator mirror and a build. Re-run alone: **passes in 3.0 s**. A clean
full run afterwards: **80 suites / 978 tests / 0 failures in 16.5 s**. Recorded as a load-sensitive
flake, not a code defect — but it is the second time a UI test has timed out only under contention,
so it is worth a follow-up rather than being forgotten.

## Observations, not defects

- On **Transfer**, typing a quantity above the source's availability (500 of 416) disables the submit
  button, and the explaining warning sits in the banner area at the top of a scrolled form — pressing
  the disabled button produces no visible response. The guard is correct; the feedback for someone
  who has scrolled past the banner is not.
- Metro prints `Could not parse Expo config: android.googleServicesFile` locally. Expected: both
  Firebase files are EAS **file** environment variables and are deliberately absent from the working
  tree, so the fallback path does not resolve on this machine. The build had them — Firebase sign-in
  worked.

## Not verified

- **iOS.** No macOS on this host; nothing in this record says anything about it.
- **Print → scan on paper.** The exported PDF's bars decode exactly (above), which rules out the
  clipped-geometry failure, but no sheet was printed and read back with the phone's camera. The
  scanner itself was proven against a real barcode.
- **A genuine end-of-allowance day.** The 429 *copy* is verified (above), but it was produced by a
  controlled refusal rather than by spending the shared 50-request free allowance.
- **A scan of paper.** The PDF and the fixed PDF both decode, and a real barcode in the room was
  read by the camera — but no sheet came off a printer and back into the scanner.

## What this record is not

It is **not a release acceptance**. The build was a `development` profile from EAS, the backend was a
local server over USB, and nothing was submitted to a store. iOS was not run at all. The branch is
unmerged and no release decision has been made; roadmap §27EH, *Where the branch stands*.

## Repeating it

1. `adb reverse tcp:4000 tcp:4000`, then start the server (`npm start` in `server/`).
2. Install the `development` APK, open it, sign in.
3. Walk the table above.
4. For the label: Product → *Print label* / *Share PDF* → save the PDF, pull it off the phone, then
   from the repository root:

   ```bash
   node scripts/verify-label-barcode.mjs --pdf=<the-pulled.pdf> --expect=2000053337540
   ```

   Exit 0 with `✔` is the pass; `2` means it could not look. `decode-ean13-from-pdf.mjs` in this
   folder is the one-off that measured the first artifact during the pass; the committed script is
   the same idea with the controls, the geometry checks and the two fixtures that CI runs.
