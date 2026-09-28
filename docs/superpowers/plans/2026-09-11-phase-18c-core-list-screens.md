# Phase 18C Implementation Plan — Core Inventory / Product / Procurement Screens

> **Status:** APPROVED by owner (2026-09-11) with five decisions. Implementation sequence below.
>
> **Historical record.** This is the original implementation plan as approved on 2026-09-11. It was
> delivered as Phase 18C — commit `dac15c7`, "feat: modernize core list screens on the design system
> (Phase 18C)" — and is recorded in `docs/DEVELOPMENT_ROADMAP.md` §18C, `docs/DESIGN_SYSTEM.md` §7
> and `CLAUDE.md` §7. The mobile app was later migrated to TypeScript, so the `.js`/`.jsx` paths
> below are the filenames as they were at the time, and the 18A sha256 freeze on `_layout` and
> `SignOutIcon` was lifted after Phase 18E. Both are historical, not current.
>
> **For agentic workers:** execute the steps in order, one task at a time. Steps use `- [ ]` tracking.

**Goal:** Modernize the three core list surfaces (Products, Inventory, Purchase Orders) onto the
Phase 18A design system — consistent row anatomy, real search fields, accessible filters, readable
key numbers — with **zero** backend, API-contract, navigation, RBAC, or behavior change.

**Architecture:** Adopt the already-built `ListScreen` + `SearchField` + `ListRow` primitives on
three screens, plus two small *additive* primitive extensions that are verified blockers, not
preferences. No new components, no new dependencies, no new abstraction layer.

**Spec:** `docs/SYSTEM_SPECIFICATION.md` §44 (V1 mobile screens), §19 (low-stock logic);
`docs/DESIGN_SYSTEM.md` (tokens, primitives, accessibility rules).

**Tech stack:** React Native 0.86.3 / Expo SDK 57 / expo-router (JavaScript, no TypeScript,
no test runner — verification is `npx expo export` + emulator smoke).

## Global Constraints

- Do **not** modify: `mobile/app/(app)/_layout.js`, `mobile/components/SignOutIcon.jsx` (protected by
  the 18A sha256 freeze at the time; that freeze was lifted after Phase 18E), `server/**`,
  `mobile/lib/api.js`, `mobile/lib/permissions.js`,
  `mobile/package.json`, `mobile/package-lock.json`, `docs/SYSTEM_SPECIFICATION.md`, `README.md`,
  any form/detail/auth screen, navigation, or `components/Card.jsx`.
- No new dependencies. No backend change. No DB change.
- Preserve every API call, query param, debounce, filter, pagination, refresh, deep link, RBAC gate
  and empty/error/loading copy exactly.
- "Modernization" must not become behavioral redesign. If preserving behavior conflicts with a
  primitive, STOP and report instead of silently changing behavior.
- Do not commit or push until the owner approves the QA report.
- Do not delete/modify `.smoke/`, `mobile/.smoke/`, or `14b-*` evidence.

## Owner decisions (2026-09-11)

1. **No "New purchase order" button** on the PO list. No new entry points at all.
2. **Add optional `titleStyle` to `ListRow`** to preserve the PO number's `fontWeight: 800` +
   `tabular-nums` hierarchy. Optional, backward compatible, presentational only.
3. **Add optional `loadingLabel` to `ListScreen`**; keep each screen's existing loading copy
   ("Loading products…", etc.) instead of the generic "Loading…". Default stays generic.
4. **Minimum documentation reconciliation in the SAME commit**: record 18B as delivered, add the
   18C entry, fix stale "commit pending" references, correct the actual `ListScreen` adoption status,
   update the Phase 18 adoption notes. No doc-set rewrite. `SYSTEM_SPECIFICATION.md` untouched.
5. **Split confirmed**: 18C = three lists + shared primitive improvements + docs;
   18D = core detail screens; 18E = secondary screens. Do not pull 18D/18E work into 18C.

---

## Task 1: Shared primitives

**Files:**
- Modify: `mobile/components/ListScreen.jsx`
- Modify: `mobile/components/ListRow.jsx`

**Interfaces (produced for Tasks 2–4):**
- `ListScreen({ items, renderItem, keyExtractor, header, refreshing, onRefresh, onEndReached,
  loading, error, onRetry, emptyTitle, emptyMessage, emptyAction, loadingLabel, loadingMore,
  separator, contentStyle })` — `emptyAction?: node`, `loadingLabel?: string = 'Loading…'`.
- `ListRow({ leading, title, subtitle, right, footer, titleStyle, style })` — `footer?: node`,
  `titleStyle?: style`.

- [ ] **1.1 `ListScreen`: pass `padded={false}` to `Screen` in all three return branches.**
  Verified defect: `ListScreen` rendered `<Screen>` with defaults, so `Screen` applied
  `padding: spacing.lg` to its wrapper *and* the FlatList applied `contentContainerStyle.padding:
  spacing.lg` → a 32px inset instead of the 16px the current screens render. `ListScreen` had zero
  adopters since 18A, so this was never rendered.
- [ ] **1.2 `ListScreen`: add `emptyAction` forwarded to `EmptyState`'s existing `action` prop**
  (products' empty state needs its "Add product" CTA).
- [ ] **1.3 `ListScreen`: add `loadingLabel = 'Loading…'` forwarded to `LoadingBlock`.**
- [ ] **1.4 `ListRow`: add optional `footer` node** rendered beneath the subtitle
  (`marginTop: spacing.xs`). Verified blocker: `subtitle` is `type.bodySmall` (13px) and there is no
  other slot, but the inventory quantity line and the PO received-progress line render at
  `type.body` (15px) today — `DESIGN_SYSTEM.md` §3 forbids important quantities at `bodySmall` alone.
- [ ] **1.5 `ListRow`: add optional `titleStyle`** merged after the base title style.
- [ ] **1.6 Update both doc comments** to describe the new optional props and the actual adoption
  status (no longer "not yet adopted").

## Task 2: Products list — `mobile/app/(app)/products/index.js` (first migration)

- [ ] Adopt `ListScreen` (with `loadingLabel="Loading products…"`, `emptyAction` = the gated
  "Add product" button).
- [ ] Search `Input` → `SearchField` (same placeholder; restore vertical spacing explicitly since
  `Input`'s wrapper carried `marginBottom: spacing.lg`).
- [ ] `filterRow` gains `flexWrap: 'wrap'` (today it cannot wrap → overflow risk at 160%).
- [ ] The `"＋ New"` `Pressable` pill (~33px tall, below the 44px minimum) → `Button size="md"
  icon="add" title="New product"`, kept in the **same position** (the filter row) and gated on the
  existing `manage = canManageProducts(user)`.
- [ ] Scan button `"📷  Scan a barcode"` → `Button icon="scan"`.
- [ ] Row → `ListRow` with `leading` icon, `title` name, `subtitle` = joined SKU/category/barcode,
  `right` = `StatusBadge`.
- [ ] Preserve: `useDebounced(q, 300)`, `queryParams()` shape (`status` omitted when `'ALL'`,
  `lowStock`/`outOfStock` flags, `categoryId`, `locationId`), `usePagedList` + `params`, `reload`
  identity, `onSessionError: signOut`, `useRefetchOnFocus`, `emptyMessage()`, navigation to
  `/scan`, `/products/new`, `/products/${id}`, and STAFF's hidden create affordance.
- [ ] **Focused verification before Task 3** (see Task 5 steps).

## Task 3: Inventory list — `mobile/app/(app)/inventory.js`

- [ ] Adopt `ListScreen` (`loadingLabel="Loading inventory…"`).
- [ ] Search → `SearchField`; scan + purchase-order buttons → `Button icon="scan"` /
  `icon="receipt"`.
- [ ] Row → `ListRow`: `leading` `cube` icon, `title` name, `subtitle` `location · Archived`,
  `footer` `"N available · M on hand"` at `type.body` + `tabular-nums` (the new slot — this is the
  readability fix), `right` = Low/Out `Badge`s stacked vertically so a long name and two badges
  cannot fight for one line at 160%.
- [ ] Preserve: the `?status=low|out` → `low`/`out` initial-state mapping, `queryParams()` flags,
  `useActiveRef(token, locationsApi)` options, `emptyMessage()`, `useRefetchOnFocus`, navigation.
- [ ] **Do NOT add an `AccessDenied` gate** — inventory is viewable by every role today.

## Task 4: Purchase Orders list — `mobile/app/(app)/purchase-orders/index.js`

- [ ] Adopt `ListScreen` (`loadingLabel="Loading purchase orders…"`).
- [ ] Search → `SearchField` keeping the `PO-0001` placeholder and character auto-capitalization.
- [ ] Row → `ListRow`: `leading` `receipt` icon, `title` `item.number` **with
  `titleStyle={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}`** (decision 2 — hierarchy
  preserved), `subtitle` supplier · location (+ expected date), `footer` `"N of M received"` with the
  existing `· complete` / `· canceled` suffixes, `right` = `PoStatusBadge`.
- [ ] **Do NOT add a "New purchase order" button** (decision 1).
- [ ] Preserve: the `canViewPurchaseOrders` `AccessDenied` gate + message, `STATUS_OPTIONS` values
  and order, `filters()` shape, `item.totals` `?? 0` fallbacks, `emptyMessage()`, STAFF view-only,
  navigation to `/purchase-orders/${id}`.

## Task 5: Documentation (minimum reconciliation) + QA

- [ ] `docs/DEVELOPMENT_ROADMAP.md`: add a §18C section; record 18B as delivered; correct the stale
  "commit pending" lines for Phases 17 / 18A.
- [ ] `docs/DESIGN_SYSTEM.md`: update §7 adoption status (line ~138 "adoption in 18B" and line ~167
  "18B+ (planned)") to the actual 18B + 18C state.
- [ ] `CLAUDE.md`: phase list records 18B delivered and names 18C.
- [ ] Static verification: theme-import grep (only the two protected files), emoji grep (zero),
  `allowFontScaling` grep (zero), protected-file sha256 match, `git status`/`git diff --stat`
  scope check (no lockfile, no server).
- [ ] `npx expo export --platform android` and `--platform ios` — both green.
- [ ] Emulator smoke: light, dark, 130%, 160%, search, pagination, pull-to-refresh, deep links,
  navigation, RBAC (OWNER vs STAFF), session expiry. **Restore font scale to 1.0 afterwards.**
- [ ] Report PASS/FAIL and STOP for owner review. No commit until approved.

## Commit boundary (only after owner approves the QA report)

`mobile/components/ListScreen.jsx`, `mobile/components/ListRow.jsx`,
`mobile/app/(app)/products/index.js`, `mobile/app/(app)/inventory.js`,
`mobile/app/(app)/purchase-orders/index.js`, `docs/DEVELOPMENT_ROADMAP.md`,
`docs/DESIGN_SYSTEM.md`, `CLAUDE.md`.

Message: `feat: modernize core list screens on the design system (Phase 18C)`. No push.
