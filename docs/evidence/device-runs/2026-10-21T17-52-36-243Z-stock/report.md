# Device run — stock

- started: 2026-10-21T17:52:36.243Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 3/4 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://stock-in?productId={{product}}&lock=1 | pass | 1011 | inventoryai://stock-in?productId=6ad84fc919af9d6a521274ae&lock=1 |
| expect "Add stock" | pass | 2204 | seen after 2204ms |
| tap "Choose a location…" | pass | 16292 | tapped Choose a location…, ▾ at 540,832 (re-tapped 3× while the picker loaded) |
| tap "{{source}}" | FAIL | 10622 | no control labelled "Shop Front"; screen showed: Navigate up \| Stock In \| Product \| Location * \| Choose a location…, ▾ \| Choose a location… \| ▾ \| Quantity * \| How many are you adding? \| Must be a whole number of 1 or more. |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-21T17-52-36-243Z-stock
