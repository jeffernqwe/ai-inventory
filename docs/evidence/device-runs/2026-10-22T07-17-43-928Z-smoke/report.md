# Device run — smoke

- started: 2026-10-22T07:17:43.928Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 10/11 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 994 | inventoryai://dashboard |
| expect "Overview" | pass | 3329 | seen after 3329ms |
| open inventoryai://inventory | pass | 991 | inventoryai://inventory |
| expect "Inventory" | pass | 2678 | seen after 2678ms |
| expect stock rows on screen | pass | 2207 | 6 row(s), e.g. ", Classic Cable 10004, Shop Front, 58 available · 58 on hand" |
| open inventoryai://products | pass | 1011 | inventoryai://products |
| expect "Products" | pass | 2663 | seen after 2663ms |
| expect product rows on screen | pass | 2231 | 2 row(s), e.g. "SKU ROLESKU-202 · Household · Barcode 2000053300018" |
| open inventoryai://purchase-orders | pass | 1006 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2089 | seen after 2089ms |
| expect Purchase Orders to load without an error | FAIL | 2115 | Purchase Orders did not load: the screen is showing its error state ("Something went wrong") |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T07-17-43-928Z-smoke
