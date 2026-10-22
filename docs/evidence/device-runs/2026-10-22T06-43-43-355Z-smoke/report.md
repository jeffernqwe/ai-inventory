# Device run — smoke

- started: 2026-10-22T06:43:43.355Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 19/19 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 997 | inventoryai://dashboard |
| expect "Overview" | pass | 3416 | seen after 3416ms |
| open inventoryai://inventory | pass | 1015 | inventoryai://inventory |
| expect "Inventory" | pass | 2627 | seen after 2627ms |
| expect stock rows on screen | pass | 2304 | 6 row(s), e.g. ", Everyday Battery 10202, Shop Front, 33 available · 33 on hand, Low" |
| open inventoryai://products | pass | 1008 | inventoryai://products |
| expect "Products" | pass | 2505 | seen after 2505ms |
| expect product rows on screen | pass | 2290 | 5 row(s), e.g. "Search by name, SKU or barcode…" |
| open inventoryai://purchase-orders | pass | 1002 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2620 | seen after 2619ms |
| open inventoryai://suppliers | pass | 1012 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2374 | seen after 2374ms |
| open inventoryai://restock | pass | 1013 | inventoryai://restock |
| expect "Restock" | pass | 2820 | seen after 2820ms |
| open inventoryai://ai | pass | 1008 | inventoryai://ai |
| expect "AI Assistant" | pass | 2538 | seen after 2538ms |
| open inventoryai://audit | pass | 1007 | inventoryai://audit |
| expect "Audit" | pass | 3195 | seen after 3195ms |
| screenshot "smoke-final" | pass | 845 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-43-43-355Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-43-43-355Z-smoke
