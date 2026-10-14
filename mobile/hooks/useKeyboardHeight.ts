import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export interface KeyboardGeometry {
  /** How much of the screen the keyboard covers, or 0 when it is closed. */
  height: number;
  /**
   * The keyboard's top edge in SCREEN coordinates. This is the number a scroll target
   * needs: `endCoordinates.screenY` is measured by the platform itself, whereas deriving
   * a top edge from a height would silently assume the keyboard reaches the very bottom
   * of the screen, which it does not (a gesture navigation bar sits below it).
   */
  top: number;
}

const CLOSED: KeyboardGeometry = { height: 0, top: 0 };

/**
 * The on-screen keyboard's geometry: how tall it is and where its top edge is.
 *
 * WHY THIS EXISTS. Two shells need to know how much room the keyboard is taking:
 * `Screen` (which must keep the focused field and any bottom composer visible) and
 * `Sheet` (a bottom sheet that must be lifted, not covered). Measuring it once here
 * keeps them in agreement and keeps the reasoning in one place.
 *
 * WHY IT IS MEASURED AND NOT HARD-CODED. `KeyboardAvoidingView`'s own Android behaviour
 * is unusable in this build: on Android its `behavior` was `undefined`, which React
 * Native treats as "do nothing", on the assumption that the Android window resizes
 * itself for the keyboard. It does not here, and that is a platform measurement, not a
 * guess — measured on the device 2026-10-14 (OPPO CPH1969, development build, Expo SDK 57
 * / React Native 0.86.3, edge-to-edge), the app's window frame stayed `[0,0][1080,2340]`
 * with the keyboard open while the platform reported the IME occupying
 * `[0,1443][1080,2340]`. The window is not resized, the keyboard simply overlays the app,
 * and it does not scroll the focused input into view either: with the keyboard open the
 * Adjust Stock form's fields sat at exactly the coordinates they had before it opened, so
 * the field that had just been tapped (Reference, y 1650) and its submit button (y 1823)
 * were both underneath the keyboard, out of the tree entirely. The same shell left the AI
 * chat's composer and its Send button covered, which is why sending a message required
 * dismissing the keyboard first.
 *
 * So the avoidance has to happen in JavaScript, and it has two halves: the keyboard's
 * height (used to pad a container) and its top edge (used to decide where a focused field
 * has to be scrolled to).
 */
export default function useKeyboardHeight(): KeyboardGeometry {
  const [geometry, setGeometry] = useState<KeyboardGeometry>(CLOSED);

  useEffect(() => {
    // Only a CHANGE is a state update. `keyboardDidChangeFrame` fires for every animation
    // step of a keyboard that is already open, and the geometry it reports is usually the
    // same value again; re-rendering on each of those would re-render every screen that
    // uses this hook for nothing. The guard is what keeps the hook from being a source of
    // churn on the screens it exists to help.
    const apply = (next: KeyboardGeometry) =>
      setGeometry((prev) => (prev.height === next.height && prev.top === next.top ? prev : next));

    const geometryOf = (event: { endCoordinates?: { height?: number; screenY?: number } } | null) => ({
      height: event?.endCoordinates?.height ?? 0,
      top: event?.endCoordinates?.screenY ?? CLOSED.top,
    });

    const visible = Keyboard.addListener('keyboardDidShow', (event) => apply(geometryOf(event)));
    const hidden = Keyboard.addListener('keyboardDidHide', () => apply(CLOSED));
    // A keyboard can change size without ever hiding — switching between a keyboard and an
    // emoji panel, or an orientation change — and a stale geometry would leave a permanent
    // gap at the bottom of every screen.
    const resized = Keyboard.addListener('keyboardDidChangeFrame', (event) => apply(geometryOf(event)));

    return () => {
      visible.remove();
      hidden.remove();
      resized.remove();
    };
  }, []);

  return geometry;
}

/**
 * Whether the application has to move a focused field into view itself.
 *
 * Android only, and deliberately so: iOS's scroll views already scroll the focused input
 * above the keyboard natively, so a second JavaScript scroll there would fight the
 * platform's own and can overshoot. This is not verifiable from this host (no macOS), so
 * the platform that can be measured is the platform that is changed.
 */
export const NEEDS_MANUAL_KEYBOARD_SCROLL = Platform.OS === 'android';
