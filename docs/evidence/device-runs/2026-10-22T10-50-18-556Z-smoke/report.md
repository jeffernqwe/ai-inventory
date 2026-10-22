# Device run — smoke

- started: 2026-10-22T10:50:18.556Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 24/24 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1007 | inventoryai://dashboard |
| expect "Overview" | pass | 2715 | seen after 2715ms |
| open inventoryai://inventory | pass | 1031 | inventoryai://inventory |
| expect "Inventory" | pass | 3145 | seen after 3145ms |
| expect stock rows on screen | pass | 2325 | 5 row(s), e.g. ", Cleancare Multi-Purpose Wipes 80 Series, Main Warehouse, 6 available · 6 on hand, Low" |
| open inventoryai://products | pass | 1014 | inventoryai://products |
| expect "Products" | pass | 2641 | seen after 2641ms |
| expect product rows on screen | pass | 2319 | 2 row(s), e.g. ", Cleancare Multi-Purpose Wipes 80 Series, Hardware · Barcode 2000053337540, Active" |
| open inventoryai://purchase-orders | pass | 1014 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2783 | seen after 2783ms |
| expect Purchase Orders to load without an error | pass | 2267 | settled without an error state |
| open inventoryai://suppliers | pass | 1012 | inventoryai://suppliers |
| expect "Suppliers" | pass | 3079 | seen after 3079ms |
| expect Suppliers to load without an error | pass | 2282 | settled without an error state |
| open inventoryai://restock | pass | 1013 | inventoryai://restock |
| expect "Restock" | pass | 3302 | seen after 3302ms |
| expect Restock to load without an error | pass | 2316 | settled without an error state |
| open inventoryai://ai | pass | 1003 | inventoryai://ai |
| expect "AI Assistant" | pass | 2427 | seen after 2427ms |
| expect AI Assistant to load without an error | pass | 2242 | settled without an error state |
| open inventoryai://audit | pass | 1020 | inventoryai://audit |
| expect "Audit" | pass | 3387 | seen after 3387ms |
| expect Audit to load without an error | pass | 2326 | settled without an error state |
| screenshot "smoke-final" | pass | 715 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T10-50-18-556Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T10-50-18-556Z-smoke
