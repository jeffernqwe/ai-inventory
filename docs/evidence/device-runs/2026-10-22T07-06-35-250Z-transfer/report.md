# Device run — transfer

- started: 2026-10-22T07:06:35.250Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 21/21 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://transfer?productId=6ad84fc919af9d6a521273e8 | pass | 1023 | inventoryai://transfer?productId=6ad84fc919af9d6a521273e8 |
| expect "Transfer stock" | pass | 2448 | seen after 2448ms |
| tap "Choose the source…" | pass | 6197 | tapped Choose the source…, ▾ at 540,807 |
| tap "Shop Front" | pass | 3801 | tapped Shop Front at 540,1978 |
| tap "Choose the destination…" | pass | 15827 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "Main Warehouse" | pass | 3802 | tapped Main Warehouse at 540,2132 |
| type into the focused field | pass | 41607 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 13905 | tapped Transfer stock at 540,2064 |
| check the movement arithmetic (-1, 1) | pass | 2181 | 58 → 57, 58 → 59 (-1, 1) |
| tap "OK" | pass | 4345 | tapped OK at 873,1356 |
| open inventoryai://transfer?productId=6ad84fc919af9d6a521273e8 | pass | 1024 | inventoryai://transfer?productId=6ad84fc919af9d6a521273e8 |
| expect "Transfer stock" | pass | 2257 | seen after 2257ms |
| tap "Choose the source…" | pass | 5999 | tapped Choose the source…, ▾ at 540,807 |
| tap "Main Warehouse" | pass | 3829 | tapped Main Warehouse at 540,2132 |
| tap "Choose the destination…" | pass | 15646 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "Shop Front" | pass | 3719 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 42980 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 14555 | tapped Transfer stock at 540,2064 |
| check the movement arithmetic (-1, 1) | pass | 2260 | 59 → 58, 57 → 58 (-1, 1) |
| tap "OK" | pass | 4256 | tapped OK at 873,1356 |
| screenshot "transfer-done" | pass | 768 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T07-06-35-250Z-transfer\transfer-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T07-06-35-250Z-transfer
