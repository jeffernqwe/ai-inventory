# Phase 18E — Secondary Screens Design-System Modernization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** IMPLEMENTED / MERGED — this file is the **original implementation plan** as written on
2026-09-11, before approval. It was subsequently approved and delivered as Phase 18E — commit
`979968a`, "feat: modernize secondary screens on the design system (Phase 18E)" — and is recorded in
`docs/DEVELOPMENT_ROADMAP.md` §18E, `docs/DESIGN_SYSTEM.md` §7 and `CLAUDE.md` §7. The mobile app was
later migrated to TypeScript, so the `.js`/`.jsx` paths below are the filenames as they were at the
time, and the pinned `_layout` / `SignOutIcon` sha256 values below were lifted after this phase. Both
are historical, not current.

**Goal:** Bring the fifteen secondary screens (Users, Audit, History, Categories, Locations, Suppliers, Profile, scan, AI) onto the Phase 18A design-system primitives and tokens, changing presentation only — no logic, API, payload, RBAC, navigation, validation, or copy change.

**Architecture:** Pure adoption of already-shipped primitives (`Screen`, `ListScreen`, `ListRow`, `PressableCard`, `SearchField`, `SectionHeader`, `Card`, `Sheet`, `Icon`, `Button`/`IconButton`, `ListState`) plus removal of raw `fontSize`/`lineHeight`/`marginTop`/hex literals in favour of `lib/theme` tokens. Three shared components (`RefManage`, `UserForm`, `AiChat`) are the real UI for seven of the fifteen routes and are therefore necessarily in scope. Small additive changes to two primitives (`Chip`) may be required.

**Tech stack:** React Native 0.86.3 / Expo SDK 57 / expo-router, JavaScript (no TypeScript), no test runner — verification is `npx expo export` + emulator smoke.

**Spec:** `docs/DESIGN_SYSTEM.md` (theming, type scale, spacing, primitives, §6 accessibility checklist, §7 adoption status ending "18E (planned): the secondary screens"), plus the 18E scope notes at `docs/DEVELOPMENT_ROADMAP.md:1387` and `:1451`.

## Global Constraints

- Owner-held `mobile/app/(app)/_layout.js` and `mobile/components/SignOutIcon.jsx` were to stay
  **byte-identical** at their then-pinned sha256 (freeze lifted after this phase; both files are now
  `_layout.tsx` / `SignOutIcon.tsx`):
  - `_layout.js` = `75794d6815b488a7c91218feb3c3ed3c39987c7fd571cf5d420fbf6dd8c286cc` *(historical)*
  - `SignOutIcon.jsx` = `9469c475a077ec5c91d6ef7caee5e4aaa732f20e269f0de5176e6543d8a65519` *(historical)*
- No backend change: `server/**` untouched. No `docs/SYSTEM_SPECIFICATION.md`, no `README.md`.
- No `package.json` / `package-lock.json` / Expo config / app.json change. **No new dependency.**
- No new screen, no new entry point, no navigation change, no tab bar.
- Theme rule (`docs/DESIGN_SYSTEM.md` §1): never import `colors` from `lib/theme`; `createStyles(colors)` at module scope + `useMemo(() => createStyles(colors), [colors])`.
- Camera overlays on the live feed keep literal white (`DESIGN_SYSTEM.md:52-53`).
- `allowFontScaling` stays enabled app-wide — zero `allowFontScaling={false}`.
- No emoji as a UI glyph (18A rule): zero emoji in any touched file.
- Do not modify `.smoke/`, `mobile/.smoke/`, or `14b-*` evidence.

---

## 1. Scope ambiguity — owner decision required

Two different in-scope lists exist in the repository:

| Source | List |
|---|---|
| `docs/DEVELOPMENT_ROADMAP.md:1387` (18C note) | Users, Audit, History, Categories, Locations, Suppliers, Profile |
| `docs/DEVELOPMENT_ROADMAP.md:1451` (18D note) | Users, Audit, History, Categories, Locations, Suppliers, Profile, **scan, AI** |
| `CLAUDE.md` §7 (18D paragraph) | "Remaining screen redesigns are a later increment (18E secondary screens)." |

**Recommendation: use the 18D list (nine areas, all fifteen route files).** It is the later and strictly larger list, it is the list that leaves nothing behind, and excluding scan/AI would strand two concrete defects: the dark-mode camera shell (`scan.js:382`) and the invisible dark-mode timestamp (`AiChat.jsx:273`). Both files also carry the worst font-scaling pins in the app.

---

## 2. Exact files IN scope (18 files + 3 docs)

### Route screens (15)
| File | Lines | Area |
|---|---|---|
| `mobile/app/(app)/users/index.js` | 164 | Users |
| `mobile/app/(app)/users/new.js` | 25 | Users |
| `mobile/app/(app)/users/[id].js` | 56 | Users |
| `mobile/app/(app)/audit.js` | 217 | Audit |
| `mobile/app/(app)/history.js` | 176 | History |
| `mobile/app/(app)/categories.js` | 17 | Categories (wrapper) |
| `mobile/app/(app)/locations.js` | 17 | Locations (wrapper) |
| `mobile/app/(app)/suppliers.js` | 22 | Suppliers (wrapper) |
| `mobile/app/(app)/profile.js` | 110 | Profile |
| `mobile/app/(app)/change-password.js` | 130 | Profile |
| `mobile/app/(app)/edit-name.js` | 92 | Profile |
| `mobile/app/(app)/scan.js` | 461 | Scan |
| `mobile/app/(app)/ai/index.js` | 109 | AI |
| `mobile/app/(app)/ai/new.js` | 15 | AI |
| `mobile/app/(app)/ai/[id].js` | 20 | AI |

`categories.js` / `locations.js` / `suppliers.js` are 17–22-line prop bundles over `RefManage`; modernizing them is modernizing `RefManage` (below). They are listed because they are the routes.

### Backing components (3 — unavoidable)
| File | Lines | Why in scope |
|---|---|---|
| `mobile/components/RefManage.jsx` | 345 | The actual UI for Categories, Locations, Suppliers |
| `mobile/components/UserForm.jsx` | 211 | The actual UI for users/new and users/[id] |
| `mobile/components/AiChat.jsx` | 323 | The actual UI for ai/new and ai/[id] |

**Note:** 18D's rule "no edit to any `mobile/components/` file" was *18D's own* constraint. 18E cannot honour it — these three files are the screens. This is called out explicitly rather than silently.

### Possible additive primitive edits (2, each optional and app-wide)
- `mobile/components/Chip.jsx` — add `minHeight: 44` and `accessibilityState={{ selected }}`. Affects every chip in the app (audit, history, users, RefManage). **Additive only; no prop changes.**
- `mobile/components/ListScreen.jsx` — only if a wrapped filter header needs `contentStyle` escape. `header` already exists; likely **no change needed**.

Explicitly **not** changed: `Button`, `Badge`, `Card`, `Input`, `ListRow`, `Screen`, `Sheet`, `SectionHeader`, `SearchField`, `StatCard`, `SelectField`, `ListState`, `icons.js`.

### Docs (3)
- `docs/DEVELOPMENT_ROADMAP.md` — author the 18E section (none exists yet); annotate the 18C/18D "…are 18E" notes as delivered.
- `docs/DESIGN_SYSTEM.md` §7 — move the secondary screens from "planned" to adopted.
- `CLAUDE.md` §7 — add 18E to the Phase 18 paragraph and the phase list.

---

## 3. Exact files OUT of scope

**Owner-held (frozen, sha256-pinned):** `mobile/app/(app)/_layout.js`, `mobile/components/SignOutIcon.jsx`.

**Form and auth screens — in NEITHER the 18C nor the 18D list. Recommend deferring to a later increment (e.g. 18F):**

| Route | Backing component |
|---|---|
| `mobile/app/(app)/stock-in.js` | `mobile/components/MovementForm.jsx` |
| `mobile/app/(app)/stock-out.js` | `mobile/components/MovementForm.jsx` |
| `mobile/app/(app)/adjust.js` | `mobile/components/MovementForm.jsx` |
| `mobile/app/(app)/products/new.js` | `mobile/components/ProductForm.jsx` |
| `mobile/app/(app)/products/[id]/edit.js` | `mobile/components/ProductForm.jsx` |
| `mobile/app/(app)/purchase-orders/new.js` | `mobile/components/PoForm.jsx` |
| `mobile/app/(app)/purchase-orders/[id]/edit.js` | `mobile/components/PoForm.jsx` |
| `mobile/app/(app)/login.js`, `register.js` | `mobile/components/AuthLayout.jsx` |
| `mobile/app/(app)/app/index.js` | — |

**Already delivered, must not be re-touched:** `dashboard.js` (18B); `products/index.js`, `inventory/index.js`, `purchase-orders/index.js` (18C); `products/[id].js`, `inventory/[id].js`, `purchase-orders/[id]/index.js`, `purchase-orders/[id]/receive.js` (18D).

**Everything else:** `server/**`, `docs/SYSTEM_SPECIFICATION.md`, `README.md`, `package.json`, `package-lock.json`, `app.json`, `eas.json`.

---

## 4. Business logic that must remain FROZEN

Byte-identical unless listed in §5. The load-bearing items found during inspection:

**`users/index.js`** — `useDebounced(q, 300)`; `filters` maps `''`→`undefined`; `usePagedList(fetcher, { params: filters(), onSessionError: signOut })` (limit 20); `useRefetchOnFocus(list.reload)`; `emptyMessage()` precedence (query → ACTIVE → DISABLED → default); guard chain `!manage` → loading → error → data, both state branches requiring `items.length === 0`; `onEndReachedThreshold={0.4}`.

**`users/[id].js`** — `load()` early-return `if (!token || !id) return;`; `setError(null)` → `setLoading(true)` → `usersApi.get` → `setTarget`; catch sets `setError` + `setTarget(null)` + `isSessionError → signOut`; finally `setLoading(false)`. **`<UserForm initial={target} key={target.id} />` — the `key` remount is load-bearing.** Guard order: `!canManageUsers` → `loading && !target` → `error && !target` → `target` → `null`.

**`components/UserForm.jsx`** — `fieldMap` (only `ApiError` + `Array.isArray(err.fields)`); `blockReason` precedence self → OWNER → ADMIN-for-ADMIN; `isEdit` read-only early return; `assignableRoles(actor)`; `nothingChanged = isEdit && role === initial.role && status === initial.status` driving `disabled`; validation order exactly `!name.trim()` → `!email.trim()` → `!password` → `password.length < 8` → `confirmPassword !== password` (key `confirm`) → `!role`; disable-confirm only when transitioning *into* DISABLED; **edit sends only changed keys** (`if (role !== initial.role)`, `if (status !== initial.status)`), create sends `{name,email,password,role}`; `router.back()` on success; error routing `fields` first, else `formError`.

**`components/RefManage.jsx`** — `useDebounced(q, 300)`; `statusFilter === 'ALL'` → `undefined`; `openCreate`/`openEdit`/`closeForm` (close is a no-op while `saving`); `save()` payload build including the **create-skips-blanks / update-forwards-`''`** asymmetry (`:110-116`); `toggleArchive` restore path vs archive-confirm path; `Alert.alert` fallbacks; footer `list.items.length >= 20` → `{total} total`.

**`audit.js`** — `useDebounced(q, 300)`; `filters()` `entityType || undefined` / `q || undefined`; `useRefetchOnFocus(list.reload)`; `emptyMessage()` with typographic quotes U+201C/U+201D; the three `ACTION_LABELS`/`ENTITY_LABELS`/`ENTITY_FILTERS` maps; `Actor 'System'` fallback; `JSON.stringify(item.metadata)`.

**`history.js`** — `str()` param unwrapping; the four deep-link params (currently produced by no caller — **keep them**); `useActiveRef` × 2 (products, locations); `queryParams` omitting `ALL`/empty; **no** `useRefetchOnFocus`; **no** debounce; `deltaText` — `STOCK_IN` `+n`, `STOCK_OUT` `−n`, else raw difference; **the minus is U+2212, byte-significant**; `deltaTone`.

**`profile.js` / `change-password.js` / `edit-name.js`** — `onSignOut` → `confirm('Sign out', …, { confirmText: 'Sign Out', destructive: true })`; `refresh()` = GET `/api/auth/me`; `router.replace(defaultHomePath(user))`; `changePassword(token, {currentPassword, newPassword})` — **`confirmPassword` is deliberately never sent**, validation order required → `else if (newPassword.length < 8)` → unconditional `confirmPassword !== newPassword`, field key `confirm`; `updateMe(token, {name: trimmed})` → `await refresh()` → `router.back()` (**order load-bearing**); `edit-name.js` has **no** `isSessionError` branch — preserve the asymmetry; `fieldMap` duplicated byte-identically in both files; `if (value == null || value === '') return null;` guard.

**`scan.js`** — state machine `view ∈ scanning|looking|found|notFound|error`; `RESCAN_IGNORE_MS = 1500`; `BARCODE_TYPES` order; `lookup()` synthesizing `new ApiError(401, 'AUTH_REQUIRED', …)` on a null token; catch order `isSessionError → signOut` → 404 → error; the `// eslint-disable-next-line react-hooks/exhaustive-deps` at `:136`; `rescan()` deliberately **not** clearing `lastScanned.current`; `loadStock` early-return before `setStockLoading(true)` and error-swallowing; `router.push({ pathname: '/stock-in'|'/stock-out', params: { productId, productName, sku, barcode, lock: '1' } })`; `router.push(\`/products/${product.id}\`)`; zero RBAC checks in-file (gating is at dashboard.js:263, inventory.js:65, products/index.js:74).

**`components/AiChat.jsx`** — `MAX_MESSAGE_CHARS = 4000`; `SUGGESTIONS`; `sendErrorMessage` code order `AI_NOT_CONFIGURED` → `AI_UNAVAILABLE` → `AI_RATE_LIMITED` → `isNetwork` → `fields[field==='message']`; `toRows`; `loadThread` pagination loop (`limit: 100`, `all.length >= res.total`); optimistic append with `pending-${Date.now()}` key and **the server `userMessage` deliberately ignored** — do not add it without removing the pending row; `if (!convId) setConvId(res?.conversation?.id ?? null)`; `throw new Error('The assistant returned no answer.')`; both early returns placed after all hooks; `loading` initialised `Boolean(conversationId)`.

**`ai/index.js`** — `usePagedList(fetcher, { onSessionError: signOut })`, `useRefetchOnFocus`, guard chain, `onEndReachedThreshold={0.4}`, `RefreshControl` colors, `item.title || 'New chat'`.

**`ai/new.js`, `ai/[id].js`** — `str()` unwrapping; `<Screen padded={false}>`; no guards. A missing `id` silently behaves as new chat — **preserve**.

---

## 5. Design-system patterns to APPLY

| Current (hand-rolled) | Replace with | Where |
|---|---|---|
| raw `View style={{flex:1, backgroundColor: colors.background}}` | `Screen` | `users/new.js:16`, `UserForm.jsx:16/67/147` |
| raw `ScrollView` shell (loses SafeArea bottom + KAV) | `Screen scroll` | `change-password.js:129`, `edit-name.js:91` |
| raw `View style={styles.flex}` (no themed background) | `Screen padded={false}` | `audit.js:151`, `history.js:132`, `RefManage.jsx:211`, `users/index.js:108` |
| 3 hand-rolled `FlatList` branches | `ListScreen` | `users/index.js`, `audit.js`, `history.js`, `RefManage.jsx` |
| hand-rolled card row (`styles.row` = Card's exact recipe) | `Card` / `PressableCard` + `ListRow` | `users/index.js:29-53`, `audit.js:69-97`, `history.js:40-68`, `RefManage.jsx:178-208` |
| raw `Input name="q"` | `SearchField` | `users/index.js:83`, `audit.js:125`, `RefManage.jsx:157` |
| hand-rolled `Modal` + backdrop + sheet | `Sheet` | `RefManage.jsx:261-301` |
| hand-rolled section headings | `SectionHeader` | `profile.js` |
| hand-rolled `DetailRow` | `ListRow` | `profile.js:16-28` |
| raw `Pressable` + `Text` CTA | `Button` (icon `add`) | `users/index.js:90-92`, `RefManage.jsx:170-172` |
| `＋` U+FF0B / `🤖` / `📷` / `🔍` / `⚠` / `✓` | `Icon` | `users/index.js:91`, `RefManage.jsx:171`, `ai/index.js:48`, `AiChat.jsx:91`, `scan.js:156/225/239` |
| raw `fontSize` / `lineHeight` / `marginTop: 2\|4\|6` | `type.*` / `spacing.*` | `profile.js:100`, `history.js:170/172-174`, `users/index.js:149`, `RefManage.jsx:317`, `AiChat.jsx:269/271/272/278/280/298`, `scan.js:408/416/424/438` |
| `type.caption` (12px) on a business quantity | `type.body` | `scan.js:455` (`stockQty`) — matches the 18D reference |

### Defects to fix (presentation-only, in-scope)
1. **`scan.js:382` `cameraShell backgroundColor: colors.text`** → resolves to `#F2F4F8` in dark mode. Use a token that is dark in both themes (e.g. `colors.overlay` underlay or an explicit dark shell), **keeping the live-feed literals at `:393/:405/:407/:408` untouched**.
2. **`AiChat.jsx:273` `timeUser: { color: 'rgba(255,255,255,0.75)' }`** — invisible on the light dark-mode `colors.primary` bubble. Use `colors.textOnPrimary` with opacity.
3. **`history.js:174` `lineHeight: 16`** on a 12px caption with `numberOfLines={2}` — clips at large font scale.
4. **`scan.js:408` `lineHeight: 19`** on overlay `bodySmall` — the element that visibly breaks at 160%.
5. **Missing themed background** in `audit.js` / `history.js` / `users/[id].js` (the last paints dark text on the light `#F4F6FA` stack backdrop via `CenterLoader`/`ErrorState`) — fixed by adopting `Screen`.
6. **`users/index.js:141` and `RefManage.jsx:309` `filterRow` has no `flexWrap`** — chips + CTA overflow at large font scale and push the CTA off-screen.
7. **`profile.js` `DetailRow` has no `flexWrap`** and `numberOfLines={1}` on Email / Name / Member-since.
8. **Touch targets below 44px:** `users/index.js:162` `editBtn minHeight: 38`, `RefManage.jsx:330` `smallBtn minHeight: 38`, `users/index.js:147` + `RefManage.jsx:311` `addBtn` ≈34px, `Chip` ≈31px.
9. **`Chip` has no `accessibilityState={{ selected }}`** — selection is colour-only. Material for `UserForm.jsx:169-170` (account status).
10. Dead style `profile.js:103 Details: {}`; dead style `ai/index.js:105 row: {}`; magic `marginTop: spacing.xs + 2` at `ai/index.js:107`.

---

## 6. Navigation that must remain UNCHANGED

`users/index.js:49` → `/users/[id]`; `:90` → `/users/new`; `UserForm.jsx:83/135` → `router.back()`; `ai/index.js:23` → `` `/ai/${item.id}` ``; `:48/:78` → `/ai/new`; `scan.js` → `/stock-in`, `/stock-out`, `/products/${id}` with the exact param bag; `profile.js` → `router.replace(defaultHomePath(user))`; `AccessDenied` internally replaces to `defaultHomePath(user)`. `audit.js` / `history.js` / `AiChat.jsx` / `ai/new.js` / `ai/[id].js` / the three RefManage routes perform no navigation and gain none. **No new `Stack.Screen` entry; `_layout.js` untouched.**

## 7. RBAC that must remain UNCHANGED

Single keys only: `manage` = `canManageUsers` (`users/index.js:61`, `new.js:17`, `[id].js:45`, `UserForm.jsx:64/88`); `canModifyUser` for per-row edit; `canViewAudit` (`audit.js:103`); `canManageFn(user)` inside `RefManage` (categories/locations/suppliers); `canUseAi` (`ai/index.js:37`). Every `AccessDenied` message string stays byte-identical.

**Two intentional patterns to preserve, not "fix":**
- `audit.js:119` calls `usePagedList` **before** the `!view` guard renders `AccessDenied` — the request still fires and its 403 is invisible. Do not hoist the hook.
- `users/[id].js` and `scan.js` likewise fetch/render without an in-file permission gate; the server stays authoritative.

**One latent crash to flag (owner call):** `ai/index.js:37-39` returns before the hooks at `:41-44`, so the hook count changes if `user` transitions (sign-out, role refresh) → React "Rendered fewer hooks than expected". A provably render-identical fix is to move the `!canUseAi` guard **below** the hooks. Recommended, but it is a behaviour-adjacent change, so it is **excluded pending explicit approval.**

## 8. Accessibility requirements

Fix the four sub-44px controls (§5.8) and `Chip`. Add `accessibilityState={{ selected }}` to `Chip`. Ensure every icon-only control has `accessibilityLabel` (the only new icon-only control would be a `Button` with `icon`, which supplies its own label). Status stays text/icon **+** colour — never colour alone. No `allowFontScaling={false}`. Verify AA contrast in both themes, with particular attention to `colors.overlay` scrims in `scan.js` (white-on-45%-scrim is ≈3:1 — the lever is scrim strength, not a token swap). No 12–13px type as the primary voice for important info; no fixed-height text containers. `accessibilityLiveRegion` on `AiChat`'s `ThinkingRow` is optional and adds an announcement — treat as a behaviour-adjacent nicety, excluded unless approved.

## 9. Dark / light mode requirements

All styles resolve through `useTheme()` + memoized `createStyles`; zero raw hex in touched files (the one existing exception, `AiChat.jsx:273`, is fixed). The three missing-background screens gain a themed `Screen`. **Known limitation that 18E cannot fix:** the native header and stack backdrop come from owner-held `_layout.js`, which imports the light `colors` alias (`_layout.js:6`, `lib/theme.js:115`), so headers stay light in dark mode on *every* screen. Screens *could* override header options locally, but that would make 18E screens inconsistent with 18A–18D and is a visual-only change to frozen chrome — **out of scope; documented instead.**

## 10. Font-scaling requirements

Remove every hard-coded `lineHeight` on scaled text; replace raw `fontSize` with `type.*`; replace raw `marginTop: 2/4/6` with `spacing.*`; add `flexWrap` to the two `filterRow`s and to `profile.js`'s `DetailRow`; keep `numberOfLines` only where truncation is intentional and business-safe (widen the identity fields). Verify at **100% / 130% / 160%**, then **restore font scale to 1.0**.

## 11. Emulator QA scenarios

Per area, in light and dark at 160% unless noted:
1. **Users** — OWNER sees list + New User; search + Active/Disabled chips; row Edit → form; create a user (validation errors first); edit role/status; disable-confirm dialog; ADMIN sees no ADMIN options; MANAGER/STAFF get AccessDenied; self-row shows "You" and no Edit.
2. **Audit** — OWNER/ADMIN list, search debounce, entity chips, pagination at the bottom, empty and error states; MANAGER reaches it → AccessDenied (and no visible error).
3. **History** — type chips, both `SelectField` pickers, count line, deep-link params still accepted, pagination, pull-to-refresh.
4. **Categories / Locations / Suppliers** — create / edit / archive / restore through the new `Sheet`; **supplier form with the keyboard open** (the Sheet is `maxHeight: 75%` and needs an internal scroll — this is the highest-risk regression in the phase); the create-skips-blanks vs update-clears asymmetry; manager vs staff.
5. **Profile** — detail rows at 160%, Edit name, Change password (validation order + success), Sign out dialog.
6. **Scan** — camera permission, live-feed overlay legibility in **dark** mode, a found product, a not-found barcode, stock-in/out navigation with the full param bag, rescan cooldown.
7. **AI** — hub list, New chat, send a message, thinking row, reply, a thread reopen from `/ai/[id]`, each of the error banners if reachable.

## 12. Static checks

- Theme-import grep: only the two owner-held files may import `colors` from `lib/theme`.
- Emoji grep over touched files: **zero**.
- `allowFontScaling` grep: **zero**.
- Raw hex grep over touched files: only the four frozen `scan.js` live-feed literals.
- `type.caption`-on-quantity grep: none remaining.
- Protected-file sha256 re-check against the two pinned hashes.
- `git status` / `git diff --stat` scope check — only files listed in §2.
- `npx eslint .` in `mobile/` (if configured) and `server/` lint untouched.

## 13. Build / export checks

`npx expo export --platform android` and `--platform ios`, both **exit 0**. Server suite is untouched and need not re-run, but `server` lint/test may be run read-only as a canary.

## 14. Risks and ambiguities

1. **Scope list discrepancy** (§1) — owner decision.
2. **`mobile/components/` must be edited** — contradicts 18D's own note; unavoidable.
3. **`Sheet` adoption in `RefManage`** — `Sheet` caps at `maxHeight: '75%'`, has no internal `ScrollView`, and adds a close `IconButton`. With up to five inputs plus two buttons the supplier form can clip. Plan: adopt `Sheet` **with a scrollable body**, and QA with the keyboard open. If it regresses, fall back to keeping the raw `Modal` and only re-skinning it.
4. **`ai/index.js` conditional hooks** (§7) — excluded pending approval.
5. **Dark-mode headers** (§9) — cannot be fixed in 18E.
6. **Form/auth screens** (§3) — proposed for a later increment; 18E leaves them unmodernized.
7. **No test runner** — verification is export + emulator, so regression confidence rests on the frozen-behaviour list in §4.
8. `scan.js` is 461 lines with a camera surface; it is the single largest and riskiest file and is sequenced **last**.

## 15. Commit boundary (not to be executed yet)

One commit at the end, after approval and after QA:
`feat: modernize secondary screens on the design system (Phase 18E)`
**No push.** Files: the 18 in §2 plus the 3 docs. Excluded: everything in §3.

---

## Task decomposition (for execution after approval)

- **T1** `Chip` — 44px + `accessibilityState` (app-wide, additive).
- **T2** Shared list shell: `users/index.js` → `Screen`/`ListScreen`/`SearchField`/`ListRow`/`PressableCard`/`Button`.
- **T3** `audit.js` → same grammar; keep the unconditional `usePagedList`.
- **T4** `history.js` → same grammar; remove `lineHeight: 16`; keep U+2212.
- **T5** `RefManage.jsx` + the three wrappers → `Screen`/`ListScreen`/`SearchField`/`ListRow`/`Sheet`.
- **T6** `UserForm.jsx`, `users/new.js`, `users/[id].js` → `Screen`/`Card`/`ListRow`.
- **T7** Profile trio → `Screen`, `SectionHeader`, `ListRow`, `flexWrap`.
- **T8** `AiChat.jsx` + AI trio → `Screen`, `Icon`, composer, `timeUser` fix.
- **T9** `scan.js` → primitives + `cameraShell` dark fix + `stockQty` type.
- **T10** Docs (roadmap 18E section, DESIGN_SYSTEM §7, CLAUDE.md) + full verification battery.
