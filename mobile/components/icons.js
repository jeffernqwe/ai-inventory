import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useTheme } from '../lib/theme-context';

const FAMILIES = {
  ion: Ionicons,
  mci: MaterialCommunityIcons,
};

/**
 * Semantic icon map. Screens never reference a glyph by its raw vector name —
 * they use these stable semantic keys, so swapping an icon set later is a
 * single edit here instead of a sweep through every screen.
 */
const ICONS = {
  // Actions
  add: { family: 'ion', name: 'add' },
  remove: { family: 'ion', name: 'remove' },
  search: { family: 'ion', name: 'search' },
  close: { family: 'ion', name: 'close' },
  check: { family: 'ion', name: 'checkmark' },
  chevronDown: { family: 'ion', name: 'chevron-down' },
  chevronRight: { family: 'ion', name: 'chevron-forward' },
  chevronLeft: { family: 'ion', name: 'chevron-back' },
  edit: { family: 'ion', name: 'pencil' },
  trash: { family: 'ion', name: 'trash-outline' },
  refresh: { family: 'ion', name: 'refresh' },
  signOut: { family: 'ion', name: 'log-out-outline' },
  camera: { family: 'ion', name: 'camera-outline' },
  scan: { family: 'mci', name: 'barcode-scan' },
  barcode: { family: 'mci', name: 'barcode' },
  print: { family: 'ion', name: 'print-outline' },
  share: { family: 'ion', name: 'share-outline' },
  // Movement
  stockIn: { family: 'ion', name: 'arrow-down-circle-outline' },
  stockOut: { family: 'ion', name: 'arrow-up-circle-outline' },
  adjust: { family: 'ion', name: 'swap-vertical' },
  // Theme
  sunny: { family: 'ion', name: 'sunny-outline' },
  moon: { family: 'ion', name: 'moon-outline' },
  // Status
  checkCircle: { family: 'ion', name: 'checkmark-circle' },
  checkCircleOutline: { family: 'ion', name: 'checkmark-circle-outline' },
  info: { family: 'ion', name: 'information-circle-outline' },
  alert: { family: 'ion', name: 'alert-circle-outline' },
  warning: { family: 'ion', name: 'warning-outline' },
  // Entities / navigation
  cube: { family: 'ion', name: 'cube-outline' },
  people: { family: 'ion', name: 'people-outline' },
  person: { family: 'ion', name: 'person-outline' },
  document: { family: 'ion', name: 'document-text-outline' },
  time: { family: 'ion', name: 'time-outline' },
  lock: { family: 'ion', name: 'lock-closed-outline' },
  receipt: { family: 'mci', name: 'file-document-outline' },
  layers: { family: 'ion', name: 'layers-outline' },
  location: { family: 'ion', name: 'location-outline' },
  pricetags: { family: 'ion', name: 'pricetags-outline' },
  settings: { family: 'ion', name: 'settings-outline' },
  sparkles: { family: 'ion', name: 'sparkles-outline' },
  storefront: { family: 'ion', name: 'storefront-outline' },
};

/**
 * Renders a vector icon from the semantic map. Defaults its color to the
 * active theme's primary text color; camera overlays and other surfaces that
 * must stay fixed pass an explicit `color`.
 */
export function Icon({ name, size = 20, color, ...props }) {
  const { colors } = useTheme();
  const def = ICONS[name];
  if (!def) {
    return null;
  }
  const Family = FAMILIES[def.family];
  return <Family name={def.name} size={size} color={color ?? colors.text} {...props} />;
}

export const iconNames = Object.keys(ICONS);
export default Icon;
