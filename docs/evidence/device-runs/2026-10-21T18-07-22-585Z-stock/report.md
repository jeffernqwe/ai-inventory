# Device run — stock

- started: 2026-10-21T18:07:22.585Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 17/17 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://stock-in?productId={{product}}&lock=1 | pass | 1005 | inventoryai://stock-in?productId=6ad84fc919af9d6a521274ae&lock=1 |
| expect "Add stock" | pass | 2128 | seen after 2128ms |
| tap "Choose a location…" | pass | 6054 | tapped Choose a location…, ▾ at 540,832 |
| tap "{{source}}" | pass | 3813 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 23093 | "Quantity" now reads 5, keyboard closed |
| tap "Add stock" | pass | 4275 | tapped Add stock at 540,1849 |
| check the movement arithmetic (5) | pass | 2448 | 33 → 38 (5) |
| tap "OK" | pass | 4170 | tapped OK at 873,1303 |
| open inventoryai://stock-out?productId={{product}}&lock=1 | pass | 1002 | inventoryai://stock-out?productId=6ad84fc919af9d6a521274ae&lock=1 |
| expect "Remove stock" | pass | 2209 | seen after 2209ms |
| tap "Choose a location…" | pass | 6028 | tapped Choose a location…, ▾ at 540,832 |
| tap "{{source}}" | pass | 3691 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 31878 | "Quantity" now reads 5, keyboard closed |
| tap "Remove stock" | pass | 4571 | tapped Remove stock at 540,2064 |
| check the movement arithmetic (-5) | pass | 2369 | 38 → 33 (-5) |
| tap "OK" | pass | 3744 | tapped OK at 873,1303 |
| screenshot "stock-done" | pass | 613 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T18-07-22-585Z-stock\stock-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T18-07-22-585Z-stock
