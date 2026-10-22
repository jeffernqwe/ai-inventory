# Device run — smoke

- started: 2026-10-22T06:42:53.368Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 4/5 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1012 | inventoryai://dashboard |
| expect "Overview" | pass | 4318 | seen after 4318ms |
| open inventoryai://inventory | pass | 1003 | inventoryai://inventory |
| expect "Inventory" | pass | 5762 | seen after 5762ms |
| expect stock rows on screen | FAIL | 2241 | expected stock rows, but the screen is showing its error state ("Something went wrong") |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-42-53-368Z-smoke
