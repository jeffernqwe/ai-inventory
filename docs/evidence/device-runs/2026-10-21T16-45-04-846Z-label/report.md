# Device run — label

- started: 2026-10-21T16:45:04.846Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 4/5 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://products/{{product}} | pass | 1025 | inventoryai://products/6ad84fc919af9d6a521274ae |
| expect "Barcode label" | pass | 2340 | seen after 2340ms |
| read the barcode off the screen | pass | 2458 | screen shows 2000053300018 |
| tap "Share PDF" | pass | 4013 | tapped Share PDF at 767,2175 |
| decode the printed PDF | FAIL | 152 | 6303fba5-b9e8-45cc-b107-fed3d597aaf9.pdf contains no decodable EAN-13 (clipped or damaged) |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T16-45-04-846Z-label
