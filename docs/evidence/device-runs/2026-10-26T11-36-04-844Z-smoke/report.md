# Device run — smoke

- started: 2026-10-26T11:36:04.844Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 24/24 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1021 | inventoryai://dashboard |
| expect "Overview" | pass | 2719 | seen after 2718ms |
| open inventoryai://inventory | pass | 1004 | inventoryai://inventory |
| expect "Inventory" | pass | 2283 | seen after 2283ms |
| expect stock rows on screen | pass | 2149 | 4 row(s), e.g. ", Smoke Widget, Smoke shelf, 0 available · 0 on hand, Low, Out" |
| open inventoryai://products | pass | 1011 | inventoryai://products |
| expect "Products" | pass | 2274 | seen after 2274ms |
| expect product rows on screen | pass | 2329 | 1 row(s), e.g. "SKU SMOKE-1" |
| open inventoryai://purchase-orders | pass | 1015 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 3000 | seen after 3000ms |
| expect Purchase Orders to load without an error | pass | 2595 | settled without an error state |
| open inventoryai://suppliers | pass | 1011 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2441 | seen after 2441ms |
| expect Suppliers to load without an error | pass | 2160 | settled without an error state |
| open inventoryai://restock | pass | 1013 | inventoryai://restock |
| expect "Restock" | pass | 2271 | seen after 2271ms |
| expect Restock to load without an error | pass | 2490 | settled without an error state |
| open inventoryai://ai | pass | 1001 | inventoryai://ai |
| expect "AI Assistant" | pass | 2166 | seen after 2166ms |
| expect AI Assistant to load without an error | pass | 2278 | settled without an error state |
| open inventoryai://audit | pass | 1024 | inventoryai://audit |
| expect "Audit" | pass | 2333 | seen after 2333ms |
| expect Audit to load without an error | pass | 2307 | settled without an error state |
| screenshot "smoke-final" | pass | 936 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T11-36-04-844Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T11-36-04-844Z-smoke
