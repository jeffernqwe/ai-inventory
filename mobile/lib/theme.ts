import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Design tokens for the mobile app.
 *
 * `palettes.light` / `palettes.dark` hold the two full semantic color palettes.
 * `colors` is a static alias for the LIGHT palette, kept only as a reference
 * value — do NOT import it into components. Phase 18A froze the two files that
 * render the native header chrome (mobile/app/(app)/_layout.js,
 * mobile/components/SignOutIcon.jsx) and gave them this alias so they would
 * keep working unchanged; importing it anywhere else is what made the native
 * header render as a white bar over a dark app. That freeze has since been
 * lifted and both files read `useTheme()`, so nothing imports `colors` today.
 * Read colors from `useTheme()` (lib/theme-context) so both themes resolve
 * correctly at render time.
 *
 * Shared scales (spacing, radius, type, shadows, duration) do not change with
 * the scheme and are imported directly.
 */

/** The full set of semantic color tokens every palette must define. */
export interface Palette {
  // Surfaces
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  placeholder: string;

  // Brand
  primary: string;
  primaryDark: string;
  primarySoft: string;
  link: string;

  // Status / semantics
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;

  // Chips for movement/stock states
  chipIn: string;
  chipInText: string;
  chipOut: string;
  chipOutText: string;
  chipAdjust: string;
  chipAdjustText: string;
  chipLow: string;
  chipLowText: string;
  chipNeutral: string;
  chipNeutralText: string;

  divider: string;
  overlay: string;
}

/** Colour scheme name; also the key set of {@link palettes}. */
export type SchemeName = 'light' | 'dark';

const LIGHT: Palette = {
  // Surfaces
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F7',
  surfaceElevated: '#FFFFFF',
  border: '#E3E7EE',
  borderStrong: '#CBD2DD',

  // Text
  text: '#101828',
  textSecondary: '#5B6472',
  // Darkened from #667085, which measured 4.40:1 on `surfaceMuted` — below the
  // 4.5:1 AA floor. #5F697E measures 5.51:1 / 4.87:1 / 5.10:1 (surface /
  // surfaceMuted / background) and stays clear of `textSecondary` (5.98:1).
  textMuted: '#5F697E',
  textOnPrimary: '#FFFFFF',
  // Raised from #8A94A6, which measured 3.06:1 on `surface` and 2.70:1 on
  // `surfaceMuted` — both below the 4.5:1 AA floor. #646E83 is the lightest
  // value in this hue family that clears AA on `surfaceMuted`, the harder case
  // (search fields and the AI composer use it): 5.12:1 / 4.53:1 / 4.73:1.
  // Because AA on `surfaceMuted` is the binding constraint for both tokens,
  // the muted ladder compresses to ~7% contrast separation here.
  placeholder: '#646E83',

  // Brand
  primary: '#2557D6',
  primaryDark: '#1E45A8',
  primarySoft: '#E8EEFC',
  link: '#2557D6',

  // Status / semantics
  success: '#15803D',
  successSoft: '#E6F4EA',
  danger: '#DC2626',
  dangerSoft: '#FCE9E9',
  warning: '#B45309',
  warningSoft: '#FBF0DE',
  info: '#2557D6',
  infoSoft: '#E8EEFC',

  // Chips for movement/stock states
  chipIn: '#DCF3E6',
  chipInText: '#137A3D',
  chipOut: '#FCE3E3',
  chipOutText: '#B42318',
  chipAdjust: '#FBEBD1',
  chipAdjustText: '#925E12',
  chipLow: '#FCEFC9',
  chipLowText: '#9A6A04',
  chipNeutral: '#ECEEF3',
  chipNeutralText: '#4A5568',

  divider: '#E8EBF0',
  overlay: 'rgba(16, 24, 40, 0.45)',
};

const DARK: Palette = {
  // Surfaces step UP from a deep neutral (never pure black).
  background: '#12141A',
  surface: '#1B1E26',
  surfaceMuted: '#242834',
  surfaceElevated: '#20242E',
  border: '#2A2F3B',
  borderStrong: '#3A4150',

  // Text
  text: '#F2F4F8',
  textSecondary: '#C2C9D6',
  textMuted: '#98A1B3',
  // Dark-theme fills are lifted, so "on primary" flips to a dark ink for AA.
  textOnPrimary: '#0B1220',
  // Lifted from #7A8494, which measured 4.41:1 on `surface` and 3.89:1 on
  // `surfaceMuted` — both below the 4.5:1 AA floor. #8A93A6 measures 5.40:1 /
  // 4.76:1, clearing AA on every surface a placeholder sits on (search fields
  // use `surfaceMuted`, the harder case) while staying dimmer than `textMuted`.
  placeholder: '#8A93A6',

  // Brand — primary lifted so text/links hold ~AA on dark surfaces; button
  // fills use the same lifted blue with dark ink (see textOnPrimary).
  primary: '#6E93F0',
  primaryDark: '#A7C0F9',
  primarySoft: 'rgba(110, 147, 240, 0.16)',
  link: '#6E93F0',

  // Status / semantics — lightened one step, soft backgrounds become dark tints.
  success: '#4ADE80',
  successSoft: 'rgba(74, 222, 128, 0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  info: '#93B4F8',
  infoSoft: 'rgba(147, 180, 248, 0.14)',

  chipIn: 'rgba(74, 222, 128, 0.16)',
  chipInText: '#4ADE80',
  chipOut: 'rgba(248, 113, 113, 0.16)',
  chipOutText: '#F87171',
  chipAdjust: 'rgba(251, 191, 36, 0.16)',
  chipAdjustText: '#FBBF24',
  chipLow: 'rgba(251, 191, 36, 0.16)',
  chipLowText: '#FBBF24',
  chipNeutral: 'rgba(148, 163, 184, 0.16)',
  chipNeutralText: '#C2C9D6',

  divider: '#262B36',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const palettes: Readonly<Record<SchemeName, Palette>> = { light: LIGHT, dark: DARK };

/** Light palette alias. Unimported since the header chrome moved to useTheme — do not add callers. */
export const colors: Palette = LIGHT;

export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  huge: number;
}

export interface Radius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  pill: number;
}

export const spacing: Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 32,
};

export const radius: Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

export interface TypeScale {
  h1: TextStyle;
  h2: TextStyle;
  h3: TextStyle;
  body: TextStyle;
  bodySmall: TextStyle;
  caption: TextStyle;
  label: TextStyle;
  button: TextStyle;
  stat: TextStyle;
  listTitle: TextStyle;
}

// Annotated with TextStyle rather than left inferred: `fontWeight: '800'` would
// otherwise widen to `string`, which is not assignable to RN's FontWeight union
// and would break every consumer that spreads a token into a Text style.
export const type: TypeScale = {
  h1: { fontSize: 26, fontWeight: '800', lineHeight: 32, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700', lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 21 },
  bodySmall: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  button: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  // Strong numeric/stat emphasis (dashboards, key quantities).
  stat: { fontSize: 24, fontWeight: '800', lineHeight: 30 },
  // Primary row title inside list cards.
  listTitle: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
};

export interface Shadows {
  card: ViewStyle;
}

export const shadows: Shadows = {
  card: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

export interface Duration {
  fast: number;
  standard: number;
}

export const duration: Duration = {
  fast: 150,
  standard: 250,
};

export const theme = { palettes, colors, spacing, radius, type, shadows, duration };
export default theme;
