/**
 * How far a scroll view has to move so that the focused field sits above the keyboard.
 *
 * WHY THIS IS A SEPARATE, PURE FUNCTION. It is the whole decision — "is the field already
 * visible, and if not, by how much" — and it is the only part of the keyboard fix that can
 * be checked without a device. Keeping it out of the component means the arithmetic
 * (including the two ways it can be wrong: scrolling when nothing is covered, and leaving
 * a field a few pixels under the keyboard) is pinned by tests, while the component keeps
 * only the measuring.
 *
 * THE TERMS. `fieldTop`/`fieldHeight` describe the focused input in SCREEN coordinates,
 * as the platform measures it; `visibleBottom` is the lowest screen row the member can
 * actually see — the keyboard's top edge, or the scroll view's own bottom edge when that
 * is higher (a scroll view can be clipped by its container before the keyboard even
 * starts, and a field outside its scroll view is invisible even though it is "above" the
 * keyboard). `margin` is the breathing room kept between the field and that edge, so a
 * field never ends up flush against the keyboard with its error text cut off.
 *
 * RETURNS the offset to scroll TO — the caller compares it with the offset it already has
 * and moves only when this is greater, which is what stops a field that is already visible
 * from jumping to the top of the screen. The result is never negative: there is no content
 * above the start of the scroll view to reveal.
 */
export interface KeyboardScrollTarget {
  fieldTop: number;
  fieldHeight: number;
  visibleBottom: number;
  currentOffset: number;
  margin: number;
}

export function scrollOffsetForField({
  fieldTop,
  fieldHeight,
  visibleBottom,
  currentOffset,
  margin,
}: KeyboardScrollTarget): number {
  const overlap = fieldTop + fieldHeight + margin - visibleBottom;
  if (overlap <= 0) return currentOffset;
  return currentOffset + overlap;
}
