# Device run — draft

- started: 2026-10-21T17:03:31.725Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 14/14 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://purchase-orders/new | pass | 1010 | inventoryai://purchase-orders/new |
| expect "New Purchase Order" | pass | 2534 | seen after 2534ms |
| tap "Choose a supplier" | pass | 4160 | tapped Choose a supplier…, ▾ at 540,549 |
| tap the first row under "Supplier" | pass | 3950 | tapped "Deluxe Industries 1004" |
| tap "Where stock will land" | pass | 3835 | tapped Where stock will land…, ▾ at 540,807 |
| tap the first row under "Receiving location" | pass | 3955 | tapped "Shop Front" |
| tap "Add line" | pass | 3910 | tapped Add line at 579,1872 |
| tap "Choose a product" | pass | 3789 | tapped Choose a product…, ▾ at 540,1995 |
| tap the first row under "Product 1" | pass | 14748 | tapped "Everyday Battery 10202" |
| type into the focused field | pass | 32759 | "Quantity ordered" now reads 1, keyboard closed |
| tap "Create draft order" | pass | 14895 | tapped Create draft order at 540,1932 |
| expect "Draft PO-" | pass | 2152 | seen after 2152ms |
| tap "OK" | pass | 4424 | tapped OK at 873,1303 |
| screenshot "draft-created" | pass | 750 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T17-03-31-725Z-draft\draft-created.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T17-03-31-725Z-draft
