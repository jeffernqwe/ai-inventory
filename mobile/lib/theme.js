/**
 * Design tokens for the mobile app — a single light palette + type/spacing
 * scale so every screen stays consistent without a design-system dependency.
 */
export const colors = {
  // Surfaces
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F7',
  border: '#E3E7EE',
  borderStrong: '#CBD2DD',

  // Text
  text: '#101828',
  textSecondary: '#5B6472',
  textMuted: '#8A94A6',
  textOnPrimary: '#FFFFFF',
  placeholder: '#9AA3B2',

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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

export const type = {
  h1: { fontSize: 26, fontWeight: '800', lineHeight: 32, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700', lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 21 },
  bodySmall: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  button: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
};

export const shadows = {
  card: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

export const theme = { colors, spacing, radius, type, shadows };
export default theme;
