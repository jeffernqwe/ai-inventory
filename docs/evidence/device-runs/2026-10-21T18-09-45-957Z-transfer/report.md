# Device run — transfer

- started: 2026-10-21T18:09:45.957Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: pass (exit 0)
- steps: 21/21 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://transfer?productId={{product}} | pass | 1016 | inventoryai://transfer?productId=6ad84fc919af9d6a521274ae |
| expect "Transfer stock" | pass | 2591 | seen after 2591ms |
| tap "Choose the source…" | pass | 6011 | tapped Choose the source…, ▾ at 540,807 |
| tap "{{source}}" | pass | 3852 | tapped Shop Front at 540,1978 |
| tap "Choose the destination…" | pass | 15961 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "{{destination}}" | pass | 3773 | tapped Main Warehouse at 540,2132 |
| type into the focused field | pass | 43171 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 14734 | tapped Transfer stock at 540,2064 |
| check the movement arithmetic (-1, 1) | pass | 2221 | 33 → 32, 32 → 33 (-1, 1) |
| tap "OK" | pass | 4286 | tapped OK at 873,1385 |
| open inventoryai://transfer?productId={{product}} | pass | 1010 | inventoryai://transfer?productId=6ad84fc919af9d6a521274ae |
| expect "Transfer stock" | pass | 2524 | seen after 2524ms |
| tap "Choose the source…" | pass | 6050 | tapped Choose the source…, ▾ at 540,807 |
| tap "{{destination}}" | pass | 3798 | tapped Main Warehouse at 540,2132 |
| tap "Choose the destination…" | pass | 16075 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "{{source}}" | pass | 3768 | tapped Shop Front at 540,1978 |
| type into the focused field | pass | 43014 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 13662 | tapped Transfer stock at 540,2064 |
| check the movement arithmetic (-1, 1) | pass | 2237 | 33 → 32, 32 → 33 (-1, 1) |
| tap "OK" | pass | 3968 | tapped OK at 873,1385 |
| screenshot "transfer-done" | pass | 637 | C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T18-09-45-957Z-transfer\transfer-done.png |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T18-09-45-957Z-transfer
