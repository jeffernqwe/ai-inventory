# Device run — smoke

- started: 2026-10-26T05:27:39.113Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 24/24 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1022 | inventoryai://dashboard |
| expect "Overview" | pass | 2691 | seen after 2691ms |
| open inventoryai://inventory | pass | 995 | inventoryai://inventory |
| expect "Inventory" | pass | 2275 | seen after 2275ms |
| expect stock rows on screen | pass | 2573 | 4 row(s), e.g. ", Smoke Widget, Smoke shelf, 0 available · 0 on hand, Low, Out" |
| open inventoryai://products | pass | 1008 | inventoryai://products |
| expect "Products" | pass | 2515 | seen after 2515ms |
| expect product rows on screen | pass | 2894 | 1 row(s), e.g. "SKU SMOKE-1" |
| open inventoryai://purchase-orders | pass | 1023 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2411 | seen after 2411ms |
| expect Purchase Orders to load without an error | pass | 2513 | settled without an error state |
| open inventoryai://suppliers | pass | 1002 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2206 | seen after 2206ms |
| expect Suppliers to load without an error | pass | 2239 | settled without an error state |
| open inventoryai://restock | pass | 997 | inventoryai://restock |
| expect "Restock" | pass | 2172 | seen after 2172ms |
| expect Restock to load without an error | pass | 2233 | settled without an error state |
| open inventoryai://ai | pass | 1034 | inventoryai://ai |
| expect "AI Assistant" | pass | 3783 | seen after 3783ms |
| expect AI Assistant to load without an error | pass | 2469 | settled without an error state |
| open inventoryai://audit | pass | 1009 | inventoryai://audit |
| expect "Audit" | pass | 2549 | seen after 2549ms |
| expect Audit to load without an error | pass | 2497 | settled without an error state |
| screenshot "smoke-final" | pass | 841 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T05-27-39-113Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T05-27-39-113Z-smoke
