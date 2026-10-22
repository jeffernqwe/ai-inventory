# Device run — stock

- started: 2026-10-22T07:04:45.117Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 17/17 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://stock-in?productId=6ad84fc919af9d6a521273e8&lock=1 | pass | 1004 | inventoryai://stock-in?productId=6ad84fc919af9d6a521273e8&lock=1 |
| expect "Add stock" | pass | 2153 | seen after 2153ms |
| tap "Choose a location…" | pass | 5819 | tapped Choose a location…, ▾ at 540,832 |
| tap "Shop Front" | pass | 3655 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 21402 | "Quantity" now reads 5, keyboard closed |
| tap "Add stock" | pass | 3821 | tapped Add stock at 540,1849 |
| check the movement arithmetic (5) | pass | 2409 | 58 → 63 (5) |
| tap "OK" | pass | 4219 | tapped OK at 873,1303 |
| open inventoryai://stock-out?productId=6ad84fc919af9d6a521273e8&lock=1 | pass | 1001 | inventoryai://stock-out?productId=6ad84fc919af9d6a521273e8&lock=1 |
| expect "Remove stock" | pass | 2242 | seen after 2242ms |
| tap "Choose a location…" | pass | 6110 | tapped Choose a location…, ▾ at 540,832 |
| tap "Shop Front" | pass | 3845 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 32029 | "Quantity" now reads 5, keyboard closed |
| tap "Remove stock" | pass | 4222 | tapped Remove stock at 540,2064 |
| check the movement arithmetic (-5) | pass | 2435 | 63 → 58 (-5) |
| tap "OK" | pass | 4232 | tapped OK at 873,1303 |
| screenshot "stock-done" | pass | 655 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T07-04-45-117Z-stock\stock-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T07-04-45-117Z-stock
