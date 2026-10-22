# Device run — smoke

- started: 2026-10-22T10:39:55.775Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 7/8 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1006 | inventoryai://dashboard |
| expect "Overview" | pass | 3472 | seen after 3472ms |
| open inventoryai://inventory | pass | 1013 | inventoryai://inventory |
| expect "Inventory" | pass | 2376 | seen after 2376ms |
| expect stock rows on screen | pass | 2309 | 5 row(s), e.g. ", Cleancare Multi-Purpose Wipes 80 Series, Main Warehouse, 6 available · 6 on hand, Low" |
| open inventoryai://products | pass | 1018 | inventoryai://products |
| expect "Products" | pass | 2439 | seen after 2439ms |
| expect product rows on screen | FAIL | 17287 | expected product rows, but nothing matches, and the screen is in no state the harness knows; screen showed: Navigate up \| Products \| r, Scan a barcode \| r \| Scan a barcode \|  \| Search by name, SKU or barcode… \| All \| All \| Active |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T10-39-55-775Z-smoke
