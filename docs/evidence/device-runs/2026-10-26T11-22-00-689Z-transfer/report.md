# Device run — transfer

- started: 2026-10-26T11:22:00.689Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 10/11 passed

| step | result | ms | what was seen |
|---|---|---|---|
| find the product with SKU SMOKE-1 through the products search | pass | 33879 | opened Smoke Widget (SKU SMOKE-1) through the products search in 33877ms |
| open inventoryai://transfer | pass | 1009 | inventoryai://transfer |
| expect "From location" | pass | 2186 | seen after 2186ms |
| choose "Smoke Widget" from the "Product" picker | pass | 12680 | chose "Smoke Widget" |
| tap "Choose the source…" | pass | 6017 | tapped Choose the source…, ▾ at 540,807 |
| tap "Smoke shelf" | pass | 4574 | tapped Smoke shelf at 540,1978 |
| tap "Choose the destination…" | pass | 16097 | tapped Choose the destination…, ▾ at 540,1371 |
| tap "Smoke" | pass | 3842 | tapped Smoke at 540,2132 |
| type into the focused field | pass | 41942 | "Quantity" now reads 1, keyboard closed |
| tap "Transfer stock" | pass | 14242 | tapped Transfer stock at 540,2136 |
| check the movement arithmetic (-1, 1) | FAIL | 26143 | expected 2 movement(s), saw 0; screen showed: Navigate up \| Transfer Stock \| Smoke Widget, ▾ \| Smoke Widget \| ▾ \| From location * \| Smoke shelf, ▾ \| Smoke shelf \| ▾ \| AVAILABLE TO TRANSFER |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T11-22-00-689Z-transfer
