# Device run — smoke

- started: 2026-10-22T10:23:26.286Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 7/8 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1005 | inventoryai://dashboard |
| expect "Overview" | pass | 4849 | seen after 4848ms |
| open inventoryai://inventory | pass | 1002 | inventoryai://inventory |
| expect "Inventory" | pass | 3781 | seen after 3781ms |
| expect stock rows on screen | pass | 2246 | 5 row(s), e.g. ", Cleancare Multi-Purpose Wipes 80 Series, Main Warehouse, 6 available · 6 on hand, Low" |
| open inventoryai://products | pass | 1009 | inventoryai://products |
| expect "Products" | pass | 3005 | seen after 3005ms |
| expect product rows on screen | FAIL | 17281 | expected product rows, but nothing matches, and the screen is in no state the harness knows; screen showed: Navigate up \| Products \| r, Scan a barcode \| r \| Scan a barcode \|  \| Search by name, SKU or barcode… \| All \| All \| Active |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T10-23-26-286Z-smoke
