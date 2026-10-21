# Device run — smoke

- started: 2026-10-21T17:02:36.863Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 17/17 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1017 | inventoryai://dashboard |
| expect "Overview" | pass | 3667 | seen after 3667ms |
| open inventoryai://inventory | pass | 1003 | inventoryai://inventory |
| expect "Inventory" | pass | 2877 | seen after 2877ms |
| open inventoryai://products | pass | 1013 | inventoryai://products |
| expect "Products" | pass | 2732 | seen after 2732ms |
| open inventoryai://purchase-orders | pass | 1018 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2678 | seen after 2678ms |
| open inventoryai://suppliers | pass | 1012 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2426 | seen after 2426ms |
| open inventoryai://restock | pass | 1010 | inventoryai://restock |
| expect "Restock" | pass | 2838 | seen after 2838ms |
| open inventoryai://ai | pass | 1016 | inventoryai://ai |
| expect "AI Assistant" | pass | 2218 | seen after 2218ms |
| open inventoryai://audit | pass | 1009 | inventoryai://audit |
| expect "Audit" | pass | 3353 | seen after 3353ms |
| screenshot "smoke-final" | pass | 898 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T17-02-36-863Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T17-02-36-863Z-smoke
