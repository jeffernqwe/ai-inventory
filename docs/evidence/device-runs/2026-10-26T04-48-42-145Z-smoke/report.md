# Device run — smoke

- started: 2026-10-26T04:48:42.145Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 6/8 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 998 | inventoryai://dashboard |
| expect "Overview" | pass | 2350 | seen after 2350ms |
| open inventoryai://inventory | pass | 1010 | inventoryai://inventory |
| expect "Inventory" | pass | 2210 | seen after 2210ms |
| expect stock rows on screen | BLOCKED | 16901 | no stock rows to prove — the screen is showing its empty state ("Nothing to show"); this tenant has none, so data was never checked |
| open inventoryai://products | pass | 1001 | inventoryai://products |
| expect "Products" | pass | 2114 | seen after 2114ms |
| expect product rows on screen | FAIL | 16524 | expected product rows, but nothing matches, and the screen is in no state the harness knows; screen showed: Navigate up \| Products \| r, Scan a barcode \| r \| Scan a barcode \|  \| Search by name, SKU or barcode… \| All \| All \| Active |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T04-48-42-145Z-smoke
