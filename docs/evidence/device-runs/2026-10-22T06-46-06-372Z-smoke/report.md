# Device run — smoke

- started: 2026-10-22T06:46:06.372Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 19/19 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1025 | inventoryai://dashboard |
| expect "Overview" | pass | 3356 | seen after 3356ms |
| open inventoryai://inventory | pass | 1008 | inventoryai://inventory |
| expect "Inventory" | pass | 2495 | seen after 2494ms |
| expect stock rows on screen | pass | 2330 | 6 row(s), e.g. ", Everyday Battery 10202, Shop Front, 33 available · 33 on hand, Low" |
| open inventoryai://products | pass | 1004 | inventoryai://products |
| expect "Products" | pass | 2592 | seen after 2592ms |
| expect product rows on screen | pass | 2282 | 2 row(s), e.g. "SKU ROLESKU-202 · Household · Barcode 2000053300018" |
| open inventoryai://purchase-orders | pass | 1010 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2623 | seen after 2622ms |
| open inventoryai://suppliers | pass | 1003 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2506 | seen after 2506ms |
| open inventoryai://restock | pass | 1011 | inventoryai://restock |
| expect "Restock" | pass | 2635 | seen after 2635ms |
| open inventoryai://ai | pass | 1015 | inventoryai://ai |
| expect "AI Assistant" | pass | 2551 | seen after 2551ms |
| open inventoryai://audit | pass | 1015 | inventoryai://audit |
| expect "Audit" | pass | 3341 | seen after 3341ms |
| screenshot "smoke-final" | pass | 806 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-46-06-372Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-46-06-372Z-smoke
