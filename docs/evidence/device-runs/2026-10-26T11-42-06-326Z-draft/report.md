# Device run — draft

- started: 2026-10-26T11:42:06.326Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 3/4 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://purchase-orders/new | pass | 1012 | inventoryai://purchase-orders/new |
| expect "New Purchase Order" | pass | 2598 | seen after 2598ms |
| tap "Choose a supplier" | pass | 17515 | tapped Choose a supplier…, ▾ at 540,549 (re-tapped 3× while the picker loaded) |
| tap the first row under "Supplier" | FAIL | 2281 | no sheet opened for "Supplier" (a picker with an empty list is disabled); screen showed: Navigate up \| New Purchase Order \| Supplier * \| Choose a supplier…, ▾ \| Choose a supplier… \| ▾ \| Receiving location * \| Where stock will land…, ▾ \| Where stock will land… \| ▾ |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-26T11-42-06-326Z-draft
