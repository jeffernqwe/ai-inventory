# Device run — transfer

- started: 2026-10-26T11:25:31.920Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 39/39 passed

| step | result | ms | what was seen |
|---|---|---|---|
| find the product with SKU SMOKE-1 through the products search | pass | 34273 | opened Smoke Widget (SKU SMOKE-1) through the products search in 34272ms |
| tap "Stock In" | pass | 27280 | tapped Stock In at 204,2091 after 1 scroll |
| tap "Choose a location…" | pass | 6085 | tapped Choose a location…, ▾ at 540,807 |
| tap "Smoke shelf" | pass | 3859 | tapped Smoke shelf at 540,1978 |
| type into the focused field | pass | 22582 | "Quantity" now reads 1, keyboard closed |
| tap "Add stock" | pass | 3825 | tapped Add stock at 540,1824 |
| check the movement arithmetic (1) | pass | 2305 | 0 → 1 (1) |
| tap "OK" | pass | 4171 | tapped OK at 873,1303 |
| open inventoryai://transfer | pass | 1015 | inventoryai://transfer |
| expect "From location" | pass | 2301 | seen after 2301ms |
| choose "Smoke Widget" from the "Product" picker | pass | 12626 | chose "Smoke Widget" |
| tap "Choose the source…" | pass | 6032 | tapped Choose the source…, ▾ at 540,807 |
| tap "Smoke shelf" | pass | 3860 | tapped Smoke shelf at 540,1978 |
| tap "Choose the destination…" | pass | 15773 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "Smoke" | pass | 3775 | tapped Smoke at 540,2132 |
| type into the focused field | pass | 42751 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 13828 | tapped Transfer stock at 540,2064 |
| check the movement arithmetic (-1, 1) | pass | 2214 | 1 → 0, 0 → 1 (-1, 1) |
| tap "OK" | pass | 4157 | tapped OK at 873,1356 |
| open inventoryai://transfer | pass | 1015 | inventoryai://transfer |
| expect "From location" | pass | 2279 | seen after 2279ms |
| choose "Smoke Widget" from the "Product" picker | pass | 12772 | chose "Smoke Widget" |
| tap "Choose the source…" | pass | 6397 | tapped Choose the source…, ▾ at 540,807 |
| tap "Smoke" | pass | 3862 | tapped Smoke at 540,2132 |
| tap "Choose the destination…" | pass | 16037 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "Smoke shelf" | pass | 3850 | tapped Smoke shelf at 540,1978 |
| type into the focused field | pass | 44164 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 13854 | tapped Transfer stock at 540,2064 |
| check the movement arithmetic (-1, 1) | pass | 2282 | 1 → 0, 0 → 1 (-1, 1) |
| tap "OK" | pass | 4671 | tapped OK at 873,1356 |
| find the product with SKU SMOKE-1 through the products search | pass | 36573 | opened Smoke Widget (SKU SMOKE-1) through the products search in 36573ms |
| tap "Stock Out" | pass | 28277 | tapped Stock Out at 540,2091 after 1 scroll |
| tap "Choose a location…" | pass | 6387 | tapped Choose a location…, ▾ at 540,807 |
| tap "Smoke shelf" | pass | 3777 | tapped Smoke shelf at 540,1978 |
| type into the focused field | pass | 32527 | "Quantity" now reads 1, keyboard closed |
| tap "Remove stock" | pass | 3792 | tapped Remove stock at 540,2064 |
| check the movement arithmetic (-1) | pass | 2455 | 1 → 0 (-1) |
| tap "OK" | pass | 4253 | tapped OK at 873,1303 |
| screenshot "transfer-done" | pass | 808 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T11-25-31-920Z-transfer\transfer-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T11-25-31-920Z-transfer
