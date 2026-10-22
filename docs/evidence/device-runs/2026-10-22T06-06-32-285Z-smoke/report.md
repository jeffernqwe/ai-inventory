# Device run — smoke

- started: 2026-10-22T06:06:32.285Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 17/17 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1021 | inventoryai://dashboard |
| expect "Overview" | pass | 3431 | seen after 3431ms |
| open inventoryai://inventory | pass | 1003 | inventoryai://inventory |
| expect "Inventory" | pass | 2471 | seen after 2471ms |
| open inventoryai://products | pass | 1008 | inventoryai://products |
| expect "Products" | pass | 2831 | seen after 2831ms |
| open inventoryai://purchase-orders | pass | 1011 | inventoryai://purchase-orders |
| expect "Purchase Orders" | pass | 2642 | seen after 2642ms |
| open inventoryai://suppliers | pass | 1018 | inventoryai://suppliers |
| expect "Suppliers" | pass | 2338 | seen after 2338ms |
| open inventoryai://restock | pass | 1028 | inventoryai://restock |
| expect "Restock" | pass | 2715 | seen after 2715ms |
| open inventoryai://ai | pass | 1023 | inventoryai://ai |
| expect "AI Assistant" | pass | 2371 | seen after 2371ms |
| open inventoryai://audit | pass | 1011 | inventoryai://audit |
| expect "Audit" | pass | 3303 | seen after 3303ms |
| screenshot "smoke-final" | pass | 809 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-06-32-285Z-smoke\smoke-final.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T06-06-32-285Z-smoke
