import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { ScrollView } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps } from 'react-native';

import useKeyboardHeight, { NEEDS_MANUAL_KEYBOARD_SCROLL } from '../hooks/useKeyboardHeight';
import { scrollOffsetForField } from '../lib/keyboardScroll';

/** Anything this shell can measure. A `TextInput` host instance satisfies it. */
export interface MeasurableField {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

/**
 * A `ScrollView` ref, typed for measuring.
 *
 * The intersection is needed because React Native's own `ScrollView` type does not declare
 * `measureInWindow` even though the host component has it; without this the measurement below
 * is a type error rather than a runtime one.
 */
type MeasurableScrollView = ComponentRef<typeof ScrollView> & NonNullable<MeasurableField>;

type RegisterField = (field: MeasurableField | null) => void;

const KeyboardScrollContext = createContext<RegisterField | null>(null);

/**
 * The focused input tells the nearest keyboard-aware scroll view that it needs to be seen.
 *
 * Null outside one — a screen that does not scroll, or a bottom sheet whose own scroll view
 * provides its own — and there the answer is simply "nothing to do". That is why every
 * caller must treat the result as optional.
 */
export function useKeyboardScroll(): RegisterField | null {
  return useContext(KeyboardScrollContext);
}

/** Breathing room kept between the focused field and the edge it is scrolled above. */
const FIELD_MARGIN = 24;

/**
 * The keyboard's show animation has to finish before the field is measured: measuring
 * mid-animation reads a position the member is not looking at yet, and on a form whose own
 * layout is still settling (a validation message appearing, the shell gaining its padding)
 * it reads a stale one.
 */
const SETTLE_MS = 250;

export interface KeyboardScrollViewProps extends ScrollViewProps {
  children?: ReactNode;
}

/**
 * A `ScrollView` that brings the focused input above the keyboard.
 *
 * WHY A COMPONENT AND NOT A PROP ON EVERY FORM. The behaviour has to be identical on every
 * screen with a field near the bottom of a form, and the alternative — each screen wiring up
 * its own ref, measurement and scroll — is the shape that drifts. Fields opt in simply by
 * being rendered inside one: `Input` reports its focus here through context, so a new field
 * added to an existing form inherits the behaviour with no extra code.
 *
 * WHY IT HAS TO EXIST AT ALL. Padding alone was not enough — and that was measured, not
 * assumed. With the container padded by the keyboard's height, the focused field stayed
 * exactly where it was and stayed hidden: on Android the platform neither resizes the window
 * for the keyboard nor scrolls the focused input into view (device measurement 2026-10-14,
 * see `hooks/useKeyboardHeight`). Shrinking a container does not move a field that is laid
 * out from the top; something has to scroll it. This is that something.
 *
 * The bottom padding of the CONTENT is not this component's job — the shell that owns the
 * content adds it, because it is what gives the last field on a form somewhere to scroll to.
 */
export default function KeyboardScrollView({
  children,
  onScroll,
  scrollEventThrottle,
  ...rest
}: KeyboardScrollViewProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const field = useRef<MeasurableField | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const { height, top } = useKeyboardHeight();

  const register = useCallback<RegisterField>((next) => {
    field.current = next;
    setFocusTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    if (!NEEDS_MANUAL_KEYBOARD_SCROLL || height === 0) return;
    const focused = field.current;
    if (!focused?.measureInWindow) return;

    const timer = setTimeout(() => {
      const scroll = scrollRef.current as MeasurableScrollView | null;
      if (!scroll?.measureInWindow) return;
      // The scroll view's OWN bottom edge is measured as well, because this shell shortens
      // itself by the keyboard's height and so can end above the keyboard's top edge. A field
      // below its scroll view is clipped and invisible even though the keyboard is not the
      // thing covering it, and scrolling to the keyboard's edge would leave it there.
      scroll.measureInWindow((_viewX, viewY, _viewWidth, viewHeight) => {
        const visibleBottom = viewHeight > 0 ? Math.min(top, viewY + viewHeight) : top;
        focused.measureInWindow?.((_x, y, _width, fieldHeight) => {
          const target = scrollOffsetForField({
            fieldTop: y,
            fieldHeight,
            visibleBottom,
            currentOffset: offset.current,
            margin: FIELD_MARGIN,
          });
          // Only ever further down the content: a field that is already visible must not jump.
          if (target > offset.current) scroll.scrollTo({ y: target, animated: true });
        });
      });
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [height, top, focusTick]);

  return (
    <KeyboardScrollContext.Provider value={register}>
      <ScrollView
        ref={scrollRef}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offset.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardScrollContext.Provider>
  );
}
