# Mobile Design System

The mobile app's shared visual language: semantic color tokens for light **and** dark themes,
type/spacing/radius scales, reusable primitives, and the accessibility rules every screen follows.
Phase 18A established this foundation; screen-by-screen adoption of the newer primitives lands in
later Phase 18 increments.

---

## 1. How the theme works

- `mobile/lib/theme.js` defines **tokens only**:
  - `palettes = { light, dark }` — the two semantic color palettes.
  - `colors` — a static alias for the **light** palette, retained as a reference value only.
    Phase 18A froze the two files that draw the native header chrome and gave them this alias so
    they would keep working unchanged; that freeze has been lifted and both now read `useTheme()`.
    **Import it nowhere.** New code reads colors from `useTheme()`.
  - Shared scales: `spacing`, `radius`, `type`, `shadows`, `duration`. These are scheme-independent.
- `mobile/lib/theme-context.jsx` provides `ThemeProvider` (wrap the root layout) and `useTheme()`
  returning `{ colors, scheme, isDark, preference, setScheme, hydrated }`.
  - `scheme` = the OS scheme unless the user picked an explicit preference ('system' | 'light' |
    'dark'), persisted via `expo-secure-store`.
- `mobile/app.json` sets `userInterfaceStyle: "automatic"` so the OS knows the app supports both.

### Using it in a component

```jsx
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { radius, spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
    title: { ...type.h3, color: colors.text },
  });

export function MyCard({ children }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.card}>...</View>;
}
```

Rules that keep the theme honest:

1. **Never import `colors` from `lib/theme`** in a component — it is frozen to light at import time.
2. Put `createStyles` at module scope and call it inside the component with `useMemo` keyed on
   `colors`. Don't build style objects on every render.
3. Module-scope maps that close over colors (TONES, VARIANTS, helpers like `deltaTone`) become
   functions of `colors` and are memoized per component.
4. Camera overlays that sit on a live feed (scan viewfinder) keep literal white — the feed is not
   a themed surface.

## 2. Color tokens

Semantic, not literal: a component says `colors.danger`, never `#DC2626`.

| Token            | Light                          | Dark                            | Used for                                   |
| ---------------- | ------------------------------ | ------------------------------- | ------------------------------------------ |
| `background`     | `#F4F6FA`                      | `#12141A`                       | Screen background                          |
| `surface`        | `#FFFFFF`                      | `#1B1E26`                       | Cards, inputs, sheets                      |
| `surfaceMuted`   | `#EEF1F7`                      | `#242834`                       | Pressed/disabled, search fields            |
| `surfaceElevated`| `#FFFFFF`                      | `#20242E`                       | Elevated surfaces                          |
| `border`         | `#E3E7EE`                      | `#2A2F3B`                       | Card/soft borders                          |
| `borderStrong`   | `#CBD2DD`                      | `#3A4150`                       | Input borders, chips                       |
| `text`           | `#101828`                      | `#F2F4F8`                       | Primary text                               |
| `textSecondary`  | `#5B6472`                      | `#C2C9D6`                       | Secondary text                             |
| `textMuted`      | `#667085` (≥ AA on white)      | `#98A1B3`                       | Captions, placeholders-adjacent            |
| `textOnPrimary`  | `#FFFFFF`                      | `#0B1220`                       | Text/icons on filled primary buttons       |
| `placeholder`    | `#8A94A6` (below AA — see §7)  | `#8A93A6` (lifted for AA)       | Input placeholder text                     |
| `primary`        | `#2557D6`                      | `#6E93F0` (lifted for AA)       | Brand, links, primary buttons, focus ring  |
| `primarySoft`    | `#E8EEFC`                      | rgba(110,147,240,0.16)          | Tinted backgrounds for primary content     |
| `success`        | `#15803D`                      | `#4ADE80`                       | Positive states                            |
| `danger`         | `#DC2626`                      | `#F87171`                       | Errors, destructive actions                |
| `warning`        | `#B45309`                      | `#FBBF24`                       | Warnings                                   |
| `info`           | `#2557D6`                      | `#93B4F8`                       | Informational states (e.g. PO OPEN)        |
| `chip*`          | light tints + dark text        | dark tints + light text         | Stock-state chips (in/out/adjust/low)      |
| `divider`        | `#E8EBF0`                      | `#262B36`                       | Hairlines, separators                      |
| `overlay`        | rgba(16,24,40,0.45)            | rgba(0,0,0,0.6)                 | Modal backdrops                            |

Dark-theme filled controls use `textOnPrimary: #0B1220` (dark ink on a lifted fill) so contrast
holds AA in both directions.

## 3. Type scale

Font sizes are real `fontSize`/`lineHeight` pairs. **`allowFontScaling` is never disabled** — every
label follows the device font-size setting.

| Token        | fontSize | weight | lineHeight | Used for                             |
| ------------ | -------- | ------ | ---------- | ------------------------------------ |
| `h1`         | 26       | 800    | 32         | Screen titles (auth)                 |
| `h2`         | 20       | 700    | 26         | Section/page titles                  |
| `h3`         | 16       | 700    | 22         | Card titles, sheet headers           |
| `body`       | 15       | 400    | 21         | Default body / inputs                |
| `bodySmall`  | 13       | 400    | 18         | Secondary body                       |
| `caption`    | 12       | 400    | 16         | Timestamps, fine print               |
| `label`      | 13       | 600    | 18         | Field labels, stat-card labels       |
| `button`     | 15       | 700    | 20         | Button labels                        |
| `stat`       | 24       | 800    | 30         | **Key numbers** (dashboard, quantities) |
| `listTitle`  | 15       | 600    | 21         | Primary title inside list rows       |

Readability rules:

- Important quantities, stock/PO status, prices, and primary actions are **never** rendered at
  `caption`/`bodySmall` alone — they use `body`+ or a dedicated token (`stat`, `listTitle`, button).
- Avoid fixed-height text containers and aggressive `numberOfLines` on important business info.
- Status must be readable through text/icon **and** color, never color alone (see Badge dots).

## 4. Spacing & radius

`spacing`: `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · huge 32`
`radius`: `sm 6 · md 10 · lg 14 · xl 20 · pill 999`

## 5. Primitives

All in `mobile/components/` unless noted. Every interactive primitive enforces the **44px minimum
touch target** (48px preferred) and an accessible label.

| Primitive        | Purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `Button`         | `variant` primary/secondary/danger/ghost; `size` md(46)/lg(52); optional `icon` |
| `ButtonRow`      | Horizontal button group with consistent gap                   |
| `IconButton`     | Icon-only action, 44px target, `accessibilityLabel`           |
| `Card` / `PressableCard` | Surface container / tappable card                      |
| `Badge`          | Status pill; `tone` + optional `dot`; text 12/700              |
| `StatusBadge` / `TypeBadge` / `PoStatusBadge` | Entity/PO status wrappers            |
| `Chip`           | Pressable filter chip (selected state)                        |
| `Input`          | Labelled field; focus ring; error/helper text                 |
| `SelectField`    | Read-only picker opening a bottom `Sheet`                     |
| `SearchField`    | Search input with icon, 44px target                           |
| `Screen`         | Safe-area shell: scroll/keyboard/pull-to-refresh              |
| `ListState`      | `CenterLoader` / `LoadingBlock` / `EmptyState` / `ErrorState` |
| `SectionHeader`  | Title/subtitle + trailing action                              |
| `ListRow`        | Leading icon + title/subtitle + trailing element              |
| `StatCard`       | Key-number card (large `stat` value)                          |
| `Sheet`          | Bottom-sheet modal (title + labelled close)                   |
| `ListScreen`     | Paged-list shell composing Screen + FlatList + states        |
| `AccessDenied`   | RBAC-denied screen                                            |
| `icons.js`       | Semantic icon map over `@expo/vector-icons`                   |

### Icons

`@expo/vector-icons` (Ionicons + MaterialCommunityIcons) behind a semantic map in `components/icons.js`:

```jsx
import { Icon } from '../components/icons';
<Icon name="search" size={18} color={colors.textMuted} />
```

Screens never reference raw glyph names; icon swap = one edit in `icons.js`.

## 6. Accessibility checklist

- [ ] Every interactive control is ≥ 44px (46/48 preferred) with spacing between adjacent controls.
- [ ] Icon-only controls have an `accessibilityLabel` (and visible text where practical).
- [ ] Status/state is conveyed by text/icon + color, never color alone.
- [ ] Body/content text is comfortable to read — no 12–13px as the primary voice for important info.
- [ ] No fixed-height text containers that break at larger font sizes.
- [ ] Contrast holds AA in both light and dark (dark fills are lifted, ink flips to dark).
- [ ] `allowFontScaling` stays enabled app-wide.

### 6.1 Text scaling and reflow

React Native honours the OS font scale by default. **Keep it that way** — the platform setting is
an accessibility requirement, not a preference.

Banned, everywhere:

- `allowFontScaling={false}`. The only defensible exception is text that is *positioned by
  measurement* rather than by layout (e.g. drawn onto a fixed-size canvas), where scaling would
  desynchronise the text from its container. Nothing in this app currently qualifies.
- A global `Text.defaultProps` cap, or a blanket `maxFontSizeMultiplier` on every `Text`.
- Solving a scaling problem by shrinking a font size. Fix the layout instead.
- A per-component `maxFontSizeMultiplier`. A bounded multiplier is only justified for text whose
  container genuinely cannot grow — a single-line control that would otherwise push its siblings
  off-screen. Prefer `flexWrap`/`flexShrink` and multi-line layouts first.

Techniques that keep layouts whole at 160%:

- Let text wrap: no `numberOfLines` on labels, values, hints, or body copy. `ListRow`'s title and
  subtitle keep `numberOfLines={2}` deliberately — a list row must not grow unbounded — and the
  second line exists precisely so long names/emails survive at large scale.
- Never pin a `lineHeight` that is smaller than the scaled font would need. The `type` tokens carry
  proportional line heights; overriding one with a literal re-introduces clipping.
- `flexWrap: 'wrap'` on any row of labels, badges, or chips; `flexShrink: 1` on the flexible side of
  a label/value row; `textAlign: 'right'` only where the right column can still shrink.
- Use `minHeight` (not `height`) on controls so they grow with their content.
- A label/value pair that must not truncate goes label-above-value (see `profile.js` `DetailRow`),
  not a fixed-width right column.
- A centred `Text` inside a column container needs `alignSelf: 'stretch'`; with only
  `textAlign: 'center'` the parent's `alignItems: 'center'` shrink-wraps the layout box to the
  *unwrapped* width and clips the line.

Verified at 100% and 160% on all Phase 18E screens (1080×1920 @ 420dpi).

### 6.2 Selected state

A toggle-style control (`Chip`) exposes selection semantically, so screen readers announce it
rather than relying on fill colour:

```jsx
<Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} … />
```

### 6.3 Dark mode

Colours come from tokens only — never a literal, and never `colors` imported from `lib/theme`
(§1). Two consequences worth stating because they are easy to get wrong:

- Ink on a filled primary surface uses `colors.textOnPrimary`, which flips with the theme. A
  hardcoded `#FFF` timestamp on a user bubble disappears in dark mode, where the primary fill is a
  *light* blue.
- Surfaces that are genuinely theme-independent keep an explicit literal and a comment saying so.
  The barcode scanner's live camera overlay is the one case: its reticle and hint text sit on the
  camera feed, so `#FFFFFF` / `rgba(255,255,255,0.85)` are deliberate, and the viewport behind the
  preview is pinned to `#000` rather than `colors.text`.

## 7. Adoption status

- **18A**: theme tokens + Provider + 41-file behavior-neutral conversion; primitives built and
  polished; `SelectField` on `Sheet`. Screens render identically in light.
- **18B**: dashboard rebuilt on `StatCard`/`SectionHeader`/`ListRow` with a clearer navigation
  hierarchy; same data, same destinations.
- **18C**: the three core list screens (products, inventory, purchase orders) adopt
  `ListScreen`/`ListRow`/`SearchField`/`PressableCard`/`Icon` on one shared row grammar; `ListRow`
  gains `footer`/`titleStyle`, `ListScreen` gains `emptyAction`/`loadingLabel`, `PressableCard`
  forwards props, `SearchField` gains `autoCapitalize`. Behavior unchanged.
- **18D**: the four record-detail screens (product, stock record, purchase order, receive) adopt
  `SectionHeader`/`StatCard`/`ListRow`: key quantities lead each screen at the `stat` token, row
  grammars match the lists, and definition rows keep their label/value form. No `mobile/components/`
  change was needed. Behavior unchanged — no logic, API, navigation, or permission edits, and the
  claim-first receive is presentation-only.
- **18E**: the secondary screens — users (index/new/detail), audit, history, categories, locations,
  suppliers, profile, change-password, edit-name, scan, and the AI hub/new/chat — adopt the same
  primitives. `RefManage`, `UserForm` and `AiChat` were modernised in place; `Chip` gains its
  semantic selected state and 44px floor, and `ListScreen` gains an additive `errorTitle` and
  `footer`. Forms/auth screens are deferred to 18F. Behavior unchanged.
- **18F**: the forms and auth screens — `ProductForm`, `MovementForm`, `PoForm`, `AuthLayout`, and the
  routes `login`, `register`, `app/index`, `products/new`, `products/[id]/edit`, `stock-in`,
  `stock-out`, `adjust`, `purchase-orders/new`, `purchase-orders/[id]/edit` — adopt the same
  primitives. The three form components now own their own `Screen` (scroll + keyboard avoidance +
  safe-area padding) and every route renders them bare, so no route nests a second `Screen`; the
  PO item block uses `Card` + `SectionHeader`, and `MovementForm`'s availability line becomes a
  `StatCard`. `AuthLayout` gained a centred, reflowing brand block. `AccessDenied`'s 🔒 emoji
  becomes the semantic `Icon name="lock"`. `lib/theme.js`'s dark `placeholder` was lifted to
  `#8A93A6` (§2, §7). Behavior unchanged: RBAC gates, validation order, payload shapes, and
  loading/empty/error copy are preserved.

### Known issues (reported, not fixed)

- **Light `placeholder` is below AA.** `#8A94A6` measures 3.06:1 on `surface` (`#FFFFFF`) and
  2.70:1 on `surfaceMuted` (`#EEF1F7`) — both under the 4.5:1 floor. 18F's owner decision (D1)
  covered the **dark** token only, because that is the one 18E reported; the light value was never
  flagged. It needs an owner decision to change, since it alters every input placeholder in the
  light theme that has shipped since 18A. Every field also carries a real label, so placeholders
  are supplemental.
- **Light `textMuted` on `surfaceMuted` is 4.40:1** (`#667085` on `#EEF1F7`) — marginally under AA
  for normal text. Same class of finding; reported, not changed.
