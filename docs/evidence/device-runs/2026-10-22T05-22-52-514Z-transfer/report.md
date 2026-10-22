# Device run — transfer

- started: 2026-10-22T05:22:52.514Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 21/21 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://transfer?productId={{product}} | pass | 1000 | inventoryai://transfer?productId=6ad84fc919af9d6a521274ae |
| expect "Transfer stock" | pass | 2645 | seen after 2645ms |
| tap "Choose the source…" | pass | 6061 | tapped Choose the source…, ▾ at 540,807 |
| tap "{{source}}" | pass | 3860 | tapped Shop Front at 540,1978 |
| tap "Choose the destination…" | pass | 15876 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "{{destination}}" | pass | 3762 | tapped Main Warehouse at 540,2132 |
| type into the focused field | pass | 43219 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 13968 | tapped Transfer stock at 540,2064 |
| check the movement arithmetic (-1, 1) | pass | 2528 | 33 → 32, 32 → 33 (-1, 1) |
| tap "OK" | pass | 4258 | tapped OK at 873,1385 |
| open inventoryai://transfer?productId={{product}} | pass | 1035 | inventoryai://transfer?productId=6ad84fc919af9d6a521274ae |
| expect "Transfer stock" | pass | 2263 | seen after 2263ms |
| tap "Choose the source…" | pass | 6075 | tapped Choose the source…, ▾ at 540,807 |
| tap "{{destination}}" | pass | 3857 | tapped Main Warehouse at 540,2132 |
| tap "Choose the destination…" | pass | 16019 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "{{source}}" | pass | 3845 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 41857 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 14488 | tapped Transfer stock at 540,2064 |
| check the movement arithmetic (-1, 1) | pass | 2335 | 33 → 32, 32 → 33 (-1, 1) |
| tap "OK" | pass | 4135 | tapped OK at 873,1385 |
| screenshot "transfer-done" | pass | 758 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-22-52-514Z-transfer\transfer-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-22-52-514Z-transfer
