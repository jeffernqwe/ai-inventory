# Device run — smoke

- started: 2026-10-26T04:51:29.455Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: could not check (exit 2)
- steps: 22/24 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 991 | inventoryai://dashboard |
| expect "Overview" | pass | 2404 | seen after 2404ms |
| open inventoryai://inventory | pass | 992 | inventoryai://inventory |
| expect "Inventory" | pass | 2385 | seen after 2385ms |
| expect stock rows on screen | BLOCKED | 17052 | no stock rows to prove — the screen is showing its empty state ("Nothing to show"); this tenant has none, so data was never checked |
| open inventoryai://products | pass | 1008 | inventoryai://products |
| expect "Products" | pass | 2245 | seen after 2245ms |
| expect product rows on screen | BLOCKED | 17135 | no product rows to prove — the screen is showing its empty state ("No products found"); this tenant has none, so data was never checked |
| open inventoryai://purchase-orders | pass | 1011 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2120 | seen after 2120ms |
| expect Purchase Orders to load without an error | pass | 2546 | settled without an error state |
| open inventoryai://suppliers | pass | 999 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2201 | seen after 2201ms |
| expect Suppliers to load without an error | pass | 2182 | settled without an error state |
| open inventoryai://restock | pass | 996 | inventoryai://restock |
| expect "Restock" | pass | 2189 | seen after 2189ms |
| expect Restock to load without an error | pass | 2413 | settled without an error state |
| open inventoryai://ai | pass | 997 | inventoryai://ai |
| expect "AI Assistant" | pass | 2222 | seen after 2222ms |
| expect AI Assistant to load without an error | pass | 2409 | settled without an error state |
| open inventoryai://audit | pass | 1017 | inventoryai://audit |
| expect "Audit" | pass | 2160 | seen after 2160ms |
| expect Audit to load without an error | pass | 2182 | settled without an error state |
| screenshot "smoke-final" | pass | 677 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T04-51-29-455Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T04-51-29-455Z-smoke
