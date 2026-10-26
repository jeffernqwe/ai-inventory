# Device run — stock

- started: 2026-10-26T11:03:01.213Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 18/18 passed

| step | result | ms | what was seen |
|---|---|---|---|
| find the product with SKU SMOKE-1 through the products search | pass | 26603 | opened Smoke Widget (SKU SMOKE-1) through the products search in 26602ms |
| tap "Stock In" | pass | 27781 | tapped Stock In at 204,2091 after 1 scroll |
| expect "Add stock" | pass | 2580 | seen after 2580ms |
| tap "Choose a location…" | pass | 6010 | tapped Choose a location…, ▾ at 540,807 |
| tap "Smoke shelf" | pass | 3827 | tapped Smoke shelf at 540,1978 |
| type into the focused field | pass | 22849 | "Quantity" now reads 5, keyboard closed |
| tap "Add stock" | pass | 3846 | tapped Add stock at 540,1824 |
| check the movement arithmetic (5) | pass | 2130 | 0 → 5 (5) |
| tap "OK" | pass | 4275 | tapped OK at 873,1303 |
| tap "Stock Out" | pass | 13674 | tapped Stock Out at 540,2091 |
| expect "Remove stock" | pass | 2240 | seen after 2240ms |
| tap "Choose a location…" | pass | 6189 | tapped Choose a location…, ▾ at 540,807 |
| tap "Smoke shelf" | pass | 3708 | tapped Smoke shelf at 540,1978 |
| type into the focused field | pass | 32772 | "Quantity" now reads 5, keyboard closed |
| tap "Remove stock" | pass | 4120 | tapped Remove stock at 540,2064 |
| check the movement arithmetic (-5) | pass | 2308 | 5 → 0 (-5) |
| tap "OK" | pass | 4158 | tapped OK at 873,1303 |
| screenshot "stock-done" | pass | 786 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T11-03-01-213Z-stock\stock-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T11-03-01-213Z-stock
