# Device run — smoke

- started: 2026-10-22T05:09:51.488Z
- device: CPH1969 · Android 11 (API 30) · PV4DDMIZZLTCIVSK
- overall: FAIL (exit 1)
- steps: 1/2 passed

| step | result | ms | what was seen |
|---|---|---|---|
| open inventoryai://dashboard | pass | 1012 | inventoryai://dashboard |
| expect "Overview" | FAIL | 18040 | expected "Overview" within 15000ms; screen showed: App Icon \| Inventory AI \| Development Build \| User \| DEVELOPMENT SERVERS \| INFO \| Start a local development server with: \| npx expo start \| Then, select the local server when it appears here. \| http:// |

evidence: C:\Users\jeffe\inventory-ai\docs\evidence\device-runs\2026-10-22T05-09-51-488Z-smoke
