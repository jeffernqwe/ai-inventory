# Device run — label

- started: 2026-10-21T17:03:08.653Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 7/7 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://products/{{product}} | pass | 1002 | inventoryai://products/6ad84fc919af9d6a521274ae |
| expect "Barcode label" | pass | 2574 | seen after 2574ms |
| read the barcode off the screen | pass | 2313 | screen shows 2000053300018 |
| tap "Share PDF" | pass | 4003 | tapped Share PDF at 767,2175 |
| decode the printed PDF | pass | 152 | 5d266b43-ff00-4615-ba3f-2a0f4f8a7a3e.pdf: 2000053300018, 95 modules, 30 bars, 4pt module |
| press BACK | pass | 1528 | pressed BACK |
| screenshot "label-done" | pass | 750 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T17-03-08-653Z-label\label-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T17-03-08-653Z-label
