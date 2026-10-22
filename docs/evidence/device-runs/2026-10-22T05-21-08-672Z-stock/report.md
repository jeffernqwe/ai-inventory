# Device run — stock

- started: 2026-10-22T05:21:08.672Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 17/17 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://stock-in?productId={{product}}&lock=1 | pass | 1016 | inventoryai://stock-in?productId=6ad84fc919af9d6a521274ae&lock=1 |
| expect "Add stock" | pass | 2382 | seen after 2382ms |
| tap "Choose a location…" | pass | 6152 | tapped Choose a location…, ▾ at 540,832 |
| tap "{{source}}" | pass | 3871 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 23065 | "Quantity" now reads 5, keyboard closed |
| tap "Add stock" | pass | 3857 | tapped Add stock at 540,1849 |
| check the movement arithmetic (5) | pass | 2402 | 33 → 38 (5) |
| tap "OK" | pass | 4125 | tapped OK at 873,1303 |
| open inventoryai://stock-out?productId={{product}}&lock=1 | pass | 1011 | inventoryai://stock-out?productId=6ad84fc919af9d6a521274ae&lock=1 |
| expect "Remove stock" | pass | 2259 | seen after 2259ms |
| tap "Choose a location…" | pass | 6102 | tapped Choose a location…, ▾ at 540,832 |
| tap "{{source}}" | pass | 3678 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 32659 | "Quantity" now reads 5, keyboard closed |
| tap "Remove stock" | pass | 4070 | tapped Remove stock at 540,2064 |
| check the movement arithmetic (-5) | pass | 2358 | 38 → 33 (-5) |
| tap "OK" | pass | 4118 | tapped OK at 873,1303 |
| screenshot "stock-done" | pass | 710 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-21-08-672Z-stock\stock-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-21-08-672Z-stock
