# Test fixtures

## `label-2000053337540.pdf`

A **real** label, printed on a phone — not synthesised. It is the PDF that *Save as PDF* wrote on the
OPPO CPH1969 (Android 11) from the Expo SDK 58 development build, on 2026-10-21, for the seeded
product *Cleancare Multi-Purpose Wipes 80 Series* (EAN-13 `2000053337540`).

Why a committed artifact instead of generating one in CI: the label is an inline SVG rasterised by the
**device's** print pipeline (Skia/PDF on Android). No JavaScript test can run that pipeline, so the
thing worth pinning is the output it produced. `scripts/verify-label-barcode.mjs --pdf=…` decodes the
bars out of the page's content stream, which is how a *clipped or distorted* print is caught without a
scanner or a printer.

The companion check, `--html`, decodes the label the app generates **now** and checks its geometry
against the page it prints on — both 11-module quiet zones, and a page big enough to hold the label
— so a regression in `mobile/lib/ean13.ts` (module width, quiet zone, run collapse, page sizing)
fails in CI even though these files never change. Both run in the mobile CI job, and the decoder's
own must-fail controls run before either.

## `label-2000053337540-both-quiet-zones.pdf`

**The same label, after the quiet-zone defect was fixed** — again a real print from the phone
(*Share PDF* → *Save to My Files*), pulled off the device later the same day. It exists because the
fix changed the document: its bars still decode to `2000053337540` at 95 modules × 4.0 pt, and its
label box is now 468 pt wide (117 modules) instead of 424 pt (106 modules), i.e. the trailing quiet
zone is inside the drawing. Two artifacts, one decoder: an artifact that decoded before the fix and
an artifact that decodes after it, so neither a broken print nor a broken fix can pass.
