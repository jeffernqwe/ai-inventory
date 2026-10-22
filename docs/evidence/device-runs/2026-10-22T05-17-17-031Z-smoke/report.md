# Device run — smoke

- started: 2026-10-22T05:17:17.031Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 17/17 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1010 | inventoryai://dashboard |
| expect "Overview" | pass | 3673 | seen after 3673ms |
| open inventoryai://inventory | pass | 1022 | inventoryai://inventory |
| expect "Inventory" | pass | 2753 | seen after 2753ms |
| open inventoryai://products | pass | 1008 | inventoryai://products |
| expect "Products" | pass | 2679 | seen after 2679ms |
| open inventoryai://purchase-orders | pass | 1009 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2831 | seen after 2831ms |
| open inventoryai://suppliers | pass | 1021 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2302 | seen after 2302ms |
| open inventoryai://restock | pass | 1011 | inventoryai://restock |
| expect "Restock" | pass | 2780 | seen after 2780ms |
| open inventoryai://ai | pass | 1021 | inventoryai://ai |
| expect "AI Assistant" | pass | 2285 | seen after 2285ms |
| open inventoryai://audit | pass | 1018 | inventoryai://audit |
| expect "Audit" | pass | 3335 | seen after 3335ms |
| screenshot "smoke-final" | pass | 759 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-17-17-031Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-17-17-031Z-smoke
