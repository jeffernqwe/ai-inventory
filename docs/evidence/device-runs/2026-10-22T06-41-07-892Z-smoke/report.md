# Device run — smoke

- started: 2026-10-22T06:41:07.892Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 19/19 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1004 | inventoryai://dashboard |
| expect "Overview" | pass | 3396 | seen after 3396ms |
| open inventoryai://inventory | pass | 1016 | inventoryai://inventory |
| expect "Inventory" | pass | 2530 | seen after 2530ms |
| expect stock rows on screen | pass | 2271 | 6 row(s), e.g. ", Everyday Battery 10202, Shop Front, 33 available · 33 on hand, Low" |
| open inventoryai://products | pass | 1006 | inventoryai://products |
| expect "Products" | pass | 2424 | seen after 2424ms |
| expect product rows on screen | pass | 2306 | 5 row(s), e.g. "Search by name, SKU or barcode…" |
| open inventoryai://purchase-orders | pass | 1020 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2680 | seen after 2680ms |
| open inventoryai://suppliers | pass | 1020 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2394 | seen after 2394ms |
| open inventoryai://restock | pass | 1022 | inventoryai://restock |
| expect "Restock" | pass | 2669 | seen after 2669ms |
| open inventoryai://ai | pass | 1005 | inventoryai://ai |
| expect "AI Assistant" | pass | 2483 | seen after 2483ms |
| open inventoryai://audit | pass | 1006 | inventoryai://audit |
| expect "Audit" | pass | 3257 | seen after 3257ms |
| screenshot "smoke-final" | pass | 830 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-41-07-892Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-41-07-892Z-smoke
