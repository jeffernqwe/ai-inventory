# Device run — smoke

- started: 2026-10-22T10:42:16.406Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 24/24 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1011 | inventoryai://dashboard |
| expect "Overview" | pass | 2832 | seen after 2832ms |
| open inventoryai://inventory | pass | 999 | inventoryai://inventory |
| expect "Inventory" | pass | 2622 | seen after 2622ms |
| expect stock rows on screen | pass | 2270 | 5 row(s), e.g. ", Cleancare Multi-Purpose Wipes 80 Series, Main Warehouse, 6 available · 6 on hand, Low" |
| open inventoryai://products | pass | 1020 | inventoryai://products |
| expect "Products" | pass | 2623 | seen after 2623ms |
| expect product rows on screen | pass | 2254 | 2 row(s), e.g. ", Cleancare Multi-Purpose Wipes 80 Series, Hardware · Barcode 2000053337540, Active" |
| open inventoryai://purchase-orders | pass | 1004 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2877 | seen after 2877ms |
| expect Purchase Orders to load without an error | pass | 2335 | settled without an error state |
| open inventoryai://suppliers | pass | 1012 | inventoryai://suppliers |
| expect "Suppliers" | pass | 3044 | seen after 3044ms |
| expect Suppliers to load without an error | pass | 2214 | settled without an error state |
| open inventoryai://restock | pass | 1012 | inventoryai://restock |
| expect "Restock" | pass | 3335 | seen after 3335ms |
| expect Restock to load without an error | pass | 2362 | settled without an error state |
| open inventoryai://ai | pass | 1024 | inventoryai://ai |
| expect "AI Assistant" | pass | 2458 | seen after 2458ms |
| expect AI Assistant to load without an error | pass | 2138 | settled without an error state |
| open inventoryai://audit | pass | 997 | inventoryai://audit |
| expect "Audit" | pass | 3440 | seen after 3440ms |
| expect Audit to load without an error | pass | 2332 | settled without an error state |
| screenshot "smoke-final" | pass | 797 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T10-42-16-406Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T10-42-16-406Z-smoke
