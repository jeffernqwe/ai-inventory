# Device run — stock

- started: 2026-10-21T17:41:33.320Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 3/4 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://stock-in?productId={{product}}&lock=1 | pass | 1014 | inventoryai://stock-in?productId=6ad84fc919af9d6a521274ae&lock=1 |
| expect "Add stock" | pass | 2384 | seen after 2384ms |
| tap "Choose a location…" | pass | 3913 | tapped Choose a location… at 520,807 |
| tap "{{source}}" | FAIL | 10838 | no control labelled "Shop Front"; screen showed: Navigate up \| Stock In \| Product * \| Choose a product…, ▾ \| Choose a product… \| ▾ \| Location * \| Choose a location…, ▾ \| Choose a location… \| ▾ |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T17-41-33-320Z-stock
