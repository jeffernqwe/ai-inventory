# Phase 18F — Forms & Auth Design-System Modernization

**Status:** APPROVED — implementation in progress. Decisions D1/D2 approved, D3 declined.

**Goal:** Bring the create/edit forms (product, purchase order, stock movement) and the auth
screens (login, register, boot redirect) onto the Phase 18A design-system primitives and tokens,
changing presentation only — no logic, API, payload, RBAC, navigation, validation, or copy change.

**Why this is next:** 18A built the theme system, 18B the dashboard, 18C the core lists, 18D the
record details, 18E the secondary screens. These forms and auth screens were explicitly deferred
and the deferral is recorded in three places — `CLAUDE.md` §7, `docs/DESIGN_SYSTEM.md` §7, and
`docs/DEVELOPMENT_ROADMAP.md` (18E *Explicitly Out of Scope*). They are the last surface family
still using hand-rolled shells, so the app currently changes visual grammar when a user taps
"New product" from an 18C list.

**Important framing:** these screens are *already themed* — they read `useTheme()` and use
`Input`/`Button`/`SelectField`/`Banner`. 18F is **not** a dark-mode fix. It is shell/container/
glyph/token adoption plus the 160% reflow pass.

**Tech stack:** React Native 0.86.3 / Expo SDK 57 / expo-router, JavaScript (no TypeScript), no
test runner — verification is `npx expo export` + emulator smoke.

**Spec:** `docs/DESIGN_SYSTEM.md` (theming §1, tokens §2, type §3, spacing/radius §4, primitives §5,
accessibility §6, adoption status §7), and the 18E scope notes at
`docs/DEVELOPMENT_ROADMAP.md` (18E *Explicitly Out of Scope*).

---

## Owner decisions

| ID | Decision | Outcome |
|---|---|---|
| **D1** | dark `placeholder` contrast (`#7A8494` = 3.89:1 on `surfaceMuted`, 4.41:1 on `surface`) | **APPROVED — fix in `lib/theme.js`.** Value chosen by measurement, not by copying the plan's candidate. Centralized in the theme system; no per-screen colors. |
| **D2** | `components/AccessDenied.jsx` renders a 🔒 emoji | **APPROVED — replace with `<Icon name="lock" />`**, preserving behavior, copy, accessibility semantics, and layout intent. No new icon implementation. |
| **D3** | create a post-fix hash-record file | **DECLINED.** No new hash-record file. Existing hash documentation stays unchanged. |

---

## Global Constraints

- Owner-held `mobile/app/(app)/_layout.js` and `mobile/components/SignOutIcon.jsx` are **untouched**.
  The 18A byte-identical freeze is **NOT reintroduced**. No 18F screen needs a new route, title, or
  header action — verified: `products/new`, `products/[id]/edit`, `stock-in`, `stock-out`, `adjust`
  declare titles in `(app)/_layout.js`; `purchase-orders/new` and `purchase-orders/[id]/edit`
  self-declare `<Stack.Screen options>` in-file; `login`/`register`/`index` render under
  `headerShown: false`.
- No backend change: `server/**` untouched. No API contract, model, RBAC, validation, or audit change.
- No `package.json` / Expo config / `app.json` change. **No new dependency.**
- No new screen, no new entry point, no navigation or route-path change.
- Theme rule (`docs/DESIGN_SYSTEM.md` §1): never import `colors` from `lib/theme`;
  `createStyles(colors)` at module scope + `useMemo(() => createStyles(colors), [colors])`.
- `allowFontScaling` stays enabled app-wide — zero `allowFontScaling={false}`, zero
  `maxFontSizeMultiplier`.
- No literal hex colors and no emoji UI glyphs in any touched file.
- Preserve every `Input`/`SelectField` prop, every hook's ordering (hooks above all early returns),
  and all existing copy.
- Do not modify `.smoke/`, `mobile/.smoke/`, `docs/superpowers/plans/2026-09-11-phase-18e-*.md`,
  or any `14b-*` evidence.

---

## 1. Exact files IN scope — **20 files**

### Components (4)
1. `mobile/components/ProductForm.jsx`
2. `mobile/components/MovementForm.jsx`
3. `mobile/components/PoForm.jsx`
4. `mobile/components/AuthLayout.jsx`

### Routes (10)
5. `mobile/app/login.js`
6. `mobile/app/register.js`
7. `mobile/app/index.js`
8. `mobile/app/(app)/products/new.js`
9. `mobile/app/(app)/products/[id]/edit.js`
10. `mobile/app/(app)/stock-in.js`
11. `mobile/app/(app)/stock-out.js`
12. `mobile/app/(app)/adjust.js`
13. `mobile/app/(app)/purchase-orders/new.js`
14. `mobile/app/(app)/purchase-orders/[id]/edit.js`

### Approved D1/D2 additions (2)
15. `mobile/lib/theme.js` — dark `placeholder` token value only
16. `mobile/components/AccessDenied.jsx` — 🔒 emoji → `<Icon name="lock" />`

### Documentation (3)
17. `CLAUDE.md` — §7 Phase 18 paragraph (18F implemented)
18. `docs/DESIGN_SYSTEM.md` — §2 token table (`placeholder` dark) + §7 adoption status
19. `docs/DEVELOPMENT_ROADMAP.md` — new Phase 18F section

### Plan document (1)
20. `docs/superpowers/plans/2026-09-11-phase-18f-forms-and-auth.md` — this file

**Total: 16 source files + 3 documentation files + 1 plan document = 20 files.**

---

## 2. Exact files OUT of scope

- `mobile/app/(app)/_layout.js`, `mobile/components/SignOutIcon.jsx` — untouched.
- All of `server/**`.
- `lib/theme-context.jsx`, `lib/auth.jsx`, `lib/api.js`, `lib/client.js`, `lib/permissions.js`,
  `lib/confirm.js`, `lib/format.js`, `mobile/hooks/**`.
- Every primitive except `AccessDenied.jsx` (D2): `Screen`, `Card`, `StatCard`, `SectionHeader`,
  `ListRow`, `Button`, `Chip`, `Input`, `SelectField`, `Sheet`, `SearchField`, `ListState`,
  `Banner`, `icons.js`.
- `mobile/app/(app)/purchase-orders/index.js` (18C list) — **the known 160% search-placeholder clip
  is NOT owned by 18F** (18F owns the PO *forms*, not the list). It stays a documented issue and is
  re-checked only to confirm it was not accidentally changed.
- `mobile/app/(app)/ai/index.js` hooks-after-early-return — known issue, later phase.
- `scan.js` camera-overlay literals; all 18B/18C/18D/18E screens; `register.js`'s tenant-creation
  semantics.
- No new dependency, no `app.json` change, no new route.

---

## 3. Business logic that must remain FROZEN

Presentation-only edits. Every hunk is diff-read against this list.

**`ProductForm.jsx`** — `fieldMap`, `toNumber`, `toWhole`; the exact payload key set and
`|| undefined` coalescing; the `isEdit` branch choosing `productsApi.update` vs `create`;
`router.back()`; every validation message string.

**`MovementForm.jsx`** — the `CONFIG` map values (`quantityLabel`, `placeholder`, `submit`,
`allowZero`, `showAvailable`, `availLabel`, `title`); `useCurrentRow` (fetch, `active` guard,
`find` on `location.id`, error→`null`); `productOptions`/`locationOptions` `unshift` fallbacks;
the `availState` derivation; `qtyOk`, `warnOver`, `warnNoChange`, `canSubmit`; the locked-product
gate and its `CenterLoader` early return; the payload shape (`reason`/`reference`
trimmed-or-undefined); the `alert(cfg.title, …)` string using `formatNumber`; `router.back()`.

**`PoForm.jsx` — highest care.** `CODE_MESSAGES` is the server error-code contract and must stay
**byte-identical** (no code added, renamed, or reworded); the exported `poErrorMessage`; `DATE_RE`,
`isGoodDate`, `toDateInput` (UTC parts — no day shift); `intValue`/`numValue`; the `nextKey`
sequence; `PO_ITEMS_MAX`/`PO_NOTES_MAX`; `lineOptions`' snapshot fallback for archived products;
**`validate()` — rule order, field paths (`items[i].productId`), and every message**; payload
assembly; the `alert` copy for create vs edit.

**`login.js` / `register.js`** — `fieldMap`; the `Redirect` guards on `status === 'signedIn'`;
`signIn`/`signUp` calls and arguments; register's confirm-match pre-check and its
"Passwords do not match" message; the footer `<Link href>` targets; all loading/error copy.

**Route wrappers** — the exact `AccessDenied` message strings, the exact `Stack.Screen` titles,
and the RBAC predicate per route.

**Hook order** — every hook stays above every early return in `login.js`, `register.js`,
`MovementForm.jsx`, `PoForm.jsx`.

---

## 4. Design-system patterns to APPLY

Reused as-is (files not edited): `Screen`, `Card`/`PressableCard`, `StatCard`, `SectionHeader`,
`ListRow`, `Button`/`ButtonRow`, `Input`, `SelectField`, `Sheet`, `Banner`, `ListState`,
`Icon`/`icons.js`, `Chip`.

| Need | Primitive / token | Replaces |
|---|---|---|
| Form screen shell | `Screen scroll contentStyle={styles.content}` | raw `ScrollView`, bare `<View>`, `styles.flex`+`styles.content` |
| Grouped fields / PO line | `Card` | `lineCard`, `lockedCard`, AuthLayout's hand-rolled card |
| Key quantity (available / on-hand) | `StatCard` (`stat` token) | `availLine` row at `type.body`/`type.h3` |
| Section heading ("Items") | `SectionHeader` | `styles.sectionTitle` |
| Add / remove line actions | `Button icon="add"` / `icon="remove"` | literal `＋` in the title string |
| Static non-color styles | module-scope `StyleSheet.create` | inline style objects |
| All spacing/radius/type | `spacing.*`, `radius.*`, `type.*` | `16`, `48`, `borderRadius: 10`, `fontSize: 22` |

Template precedent: `app/(app)/change-password.js` (converted in 18E) —
`<Stack.Screen options>` + `<Screen scroll contentStyle>` + `<Card>` of `<Input>`s + `<Banner>` +
`<Button full>`.

---

## 5. RBAC that must remain UNCHANGED

| Route | Predicate | Roles allowed |
|---|---|---|
| `login.js`, `register.js`, `index.js` | — | unauthenticated by design |
| `stock-in.js` | `canStockIn` | OWNER, ADMIN, MANAGER, **STAFF** |
| `stock-out.js` | `canStockOut` | OWNER, ADMIN, MANAGER, **STAFF** |
| `adjust.js` | `canAdjustStock` | OWNER, ADMIN, MANAGER — **not STAFF** |
| `products/new.js`, `products/[id]/edit.js` | `canManageProducts` | OWNER, ADMIN, MANAGER — **not STAFF** |
| `purchase-orders/new.js`, `purchase-orders/[id]/edit.js` | `canManagePurchaseOrders` | OWNER, ADMIN, MANAGER — **not STAFF** |

`lib/permissions.js` is not edited. Gates stay in place, hooks stay above them, `AccessDenied`
message strings stay byte-identical, and no client-side authorization is added.

---

## 6. Accessibility requirements

- `allowFontScaling` stays enabled; no `maxFontSizeMultiplier`; no font shrunk to make a layout fit.
- 100% and 160% verified on all 7 routes + 3 components, both themes, 1080×1920 @ 420dpi.
- Risk points: `MovementForm`'s label/value row and locked-product metadata; `PoForm`'s line cards,
  "Items" heading, and notes field; `AuthLayout`'s brand block and 5-field register card; the
  login/register footer line (a `<Text>` with an inline `<Link>`).
- No fixed-height text containers; no `lineHeight` literal smaller than the scaled font needs.
- Touch targets ≥44dp (buttons are 46/52).
- Keyboard: `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"` must survive the shell
  swap; the last field/line stays reachable above the keyboard on Android and iOS.
- Every per-field prop preserved: `keyboardType`, `autoCapitalize`, `secureTextEntry`, `maxLength`,
  `returnKeyType`, `onSubmitEditing`, `autoFocus`.

---

## 7. Emulator QA scenarios

7 routes × {light, dark} × {100%, 160%}; plus loading, empty, error, navigation/deep-link, keyboard,
`SelectField` open/search/select/dismiss, and RBAC (STAFF denied on adjust/products/PO-new with the
exact strings; OWNER/ADMIN/MANAGER allowed).

**Data safety:** the five mutating forms are filled and validated but **never submitted**. Their
error paths are exercised freely (no write). Their success path renders no new UI (an `alert()` +
`router.back()`), so nothing is lost. Login is submitted (idempotent, read-only). No product, PO,
inventory, receiving, supplier, or user record is created, edited, archived, or deleted.

---

## 8. Static / build checks

- `npx expo export` — Android, then iOS — both green.
- `grep` sweep on touched files: no `allowFontScaling`, no `maxFontSizeMultiplier`, no hex color
  literals, no `colors` import from `lib/theme`, no emoji.
- Re-check the known PO-**list** 160% search-placeholder clip is unchanged.

---

## 9. Commit boundary

Exactly one commit, only if all verification passes:

```
feat: modernize forms and auth screens on the design system (Phase 18F)
```

**No push.** Expected changed set: the 16 source files + 3 docs + this plan doc.
