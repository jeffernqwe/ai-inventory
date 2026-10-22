# Device run — smoke

- started: 2026-10-22T07:29:33.692Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 24/24 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1009 | inventoryai://dashboard |
| expect "Overview" | pass | 3177 | seen after 3177ms |
| open inventoryai://inventory | pass | 1012 | inventoryai://inventory |
| expect "Inventory" | pass | 2622 | seen after 2622ms |
| expect stock rows on screen | pass | 2300 | 6 row(s), e.g. ", Classic Cable 10004, Shop Front, 58 available · 58 on hand" |
| open inventoryai://products | pass | 1010 | inventoryai://products |
| expect "Products" | pass | 2467 | seen after 2467ms |
| expect product rows on screen | pass | 2275 | 2 row(s), e.g. "SKU ROLESKU-202 · Household · Barcode 2000053300018" |
| open inventoryai://purchase-orders | pass | 1011 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2607 | seen after 2607ms |
| expect Purchase Orders to load without an error | pass | 2302 | settled without an error state |
| open inventoryai://suppliers | pass | 1021 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2204 | seen after 2204ms |
| expect Suppliers to load without an error | pass | 2358 | settled without an error state |
| open inventoryai://restock | pass | 1015 | inventoryai://restock |
| expect "Restock" | pass | 2500 | seen after 2500ms |
| expect Restock to load without an error | pass | 2347 | settled without an error state |
| open inventoryai://ai | pass | 1024 | inventoryai://ai |
| expect "AI Assistant" | pass | 2407 | seen after 2407ms |
| expect AI Assistant to load without an error | pass | 2290 | settled without an error state |
| open inventoryai://audit | pass | 1010 | inventoryai://audit |
| expect "Audit" | pass | 3218 | seen after 3218ms |
| expect Audit to load without an error | pass | 2312 | settled without an error state |
| screenshot "smoke-final" | pass | 813 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T07-29-33-692Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T07-29-33-692Z-smoke
