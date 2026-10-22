# Device run — smoke

- started: 2026-10-22T10:38:19.863Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 7/8 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1012 | inventoryai://dashboard |
| expect "Overview" | pass | 2623 | seen after 2623ms |
| open inventoryai://inventory | pass | 1011 | inventoryai://inventory |
| expect "Inventory" | pass | 2777 | seen after 2777ms |
| expect stock rows on screen | pass | 2300 | 5 row(s), e.g. ", Cleancare Multi-Purpose Wipes 80 Series, Main Warehouse, 6 available · 6 on hand, Low" |
| open inventoryai://products | pass | 1009 | inventoryai://products |
| expect "Products" | pass | 2425 | seen after 2425ms |
| expect product rows on screen | FAIL | 17330 | expected product rows, but nothing matches, and the screen is in no state the harness knows; screen showed: Navigate up \| Products \| r, Scan a barcode \| r \| Scan a barcode \|  \| Search by name, SKU or barcode… \| All \| All \| Active |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T10-38-19-863Z-smoke
