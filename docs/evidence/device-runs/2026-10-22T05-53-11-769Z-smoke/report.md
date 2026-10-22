# Device run — smoke

- started: 2026-10-22T05:53:11.769Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 17/17 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1009 | inventoryai://dashboard |
| expect "Overview" | pass | 3888 | seen after 3888ms |
| open inventoryai://inventory | pass | 1002 | inventoryai://inventory |
| expect "Inventory" | pass | 2636 | seen after 2636ms |
| open inventoryai://products | pass | 1017 | inventoryai://products |
| expect "Products" | pass | 2672 | seen after 2672ms |
| open inventoryai://purchase-orders | pass | 1007 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2706 | seen after 2706ms |
| open inventoryai://suppliers | pass | 1032 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2930 | seen after 2930ms |
| open inventoryai://restock | pass | 1019 | inventoryai://restock |
| expect "Restock" | pass | 2849 | seen after 2849ms |
| open inventoryai://ai | pass | 1022 | inventoryai://ai |
| expect "AI Assistant" | pass | 2881 | seen after 2881ms |
| open inventoryai://audit | pass | 1036 | inventoryai://audit |
| expect "Audit" | pass | 2839 | seen after 2839ms |
| screenshot "smoke-final" | pass | 1218 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-53-11-769Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-53-11-769Z-smoke
