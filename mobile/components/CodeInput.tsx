import { useMemo, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useKeyboardScroll } from './KeyboardScrollView';
import { radius, spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * A six-box one-time-code field.
 *
 * WHY BOXES RATHER THAN ONE TEXT FIELD. A code the person did not choose, read off another app, is
 * the one input where the shape of the value is the instruction: six boxes say "six digits" before
 * anybody reads the label, and each digit lands somewhere visible instead of scrolling inside a
 * field that is wider than the code. It is the same control the platform's own sign-in sheets use,
 * so it needs no explaining.
 *
 * WHY THERE IS STILL EXACTLY ONE TextInput — and it is INVISIBLE. The boxes are decoration; the
 * text field is the control, laid transparently over them. That single choice is what makes the
 * three behaviours people actually judge this control by work without special cases:
 *
 *   * AUTO-ADVANCE is not a focus dance. The caret is simply "after the last digit", so the box
 *     that lights up is the next one to be filled, by construction. Six fields that each have to
 *     move focus would need a `setTimeout` per keystroke to survive Android's own focus races.
 *   * PASTE works because the platform pastes into a text field. The whole six-digit string arrives
 *     in ONE `onChangeText`, is filtered and capped, and every box fills. A per-box design has to
 *     detect a multi-character insert and redistribute it, and loses the tail if it is slow.
 *   * BACKSPACE works because a shorter string arrives. There is no "which box was focused" state
 *     to get wrong, and holding backspace clears the value the way it does anywhere else.
 *
 * It also keeps the field a REAL editable text field, which is what Android's autofill chip and
 * iOS's Mail suggestion need (`one-time-code` / `oneTimeCode` are declared below). Splitting the
 * input into six of them is the usual way that suggestion stops appearing.
 *
 * WHAT THIS COMPONENT DOES NOT DECIDE. It never validates, never submits, never counts attempts and
 * never talks to the server: it filters to digits, caps the length, and hands the caller the value
 * it would have received anyway. The screen keeps its own submit control, so a mistyped sixth digit
 * is not a request the person did not ask for.
 */

const DEFAULT_LENGTH = 6;

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { marginBottom: spacing.lg },
    label: {
      ...type.label,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    req: { color: colors.danger },
    // The overlay and the boxes share this frame, so the invisible field can never sit anywhere
    // but on top of the row it is drawing.
    frame: { position: 'relative' },
    row: { flexDirection: 'row', gap: spacing.sm },
    box: {
      flexGrow: 1,
      flexBasis: 0,
      maxWidth: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    // The box the next digit will land in. A 2px ring plus the soft brand tint reads as "here"
    // without the field looking like an error or a button.
    boxActive: {
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    boxError: { borderColor: colors.danger },
    boxErrorActive: { borderWidth: 2, borderColor: colors.danger },
    boxDisabled: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
    digit: {
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '700',
      color: colors.text,
    },
    digitDisabled: { color: colors.textMuted },
    // The caret is drawn, not inherited: the real one lives in a transparent field.
    caret: {
      width: 2,
      height: 22,
      borderRadius: 1,
      backgroundColor: colors.primary,
    },
    // Fully transparent rather than `display: 'none'`: it must stay focusable, pasteable and
    // reachable by the platform's autofill. Sized explicitly rather than spread from
    // `StyleSheet.absoluteFillObject`, which RN 0.88's generated types no longer expose — a missing
    // spread would leave the field in the layout flow, pushing the boxes around while invisible.
    overlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      opacity: 0,
      padding: 0,
      margin: 0,
      color: 'transparent',
    },
    error: { ...type.caption, color: colors.danger, marginTop: 6 },
    helper: { ...type.caption, color: colors.textMuted, marginTop: 6 },
  });

export interface CodeInputProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Digits shown. Six everywhere it is used today; a prop so the model is not hardcoded. */
  length?: number;
  label?: ReactNode;
  required?: boolean;
  error?: string | null;
  helper?: ReactNode;
  editable?: boolean;
  autoFocus?: boolean;
  /** Fired by the keyboard's own action key, exactly like a normal field's. */
  onSubmitEditing?: () => void;
  /** Read by screen readers in place of the six decorative boxes. */
  accessibilityLabel?: string;
  /** Applied to the underlying text field, so a test can drive it. */
  testID?: string;
}

/** Digits only, never longer than the field: the one normalisation every entry path shares. */
function normalize(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, length);
}

export default function CodeInput({
  value,
  onChangeText,
  length = DEFAULT_LENGTH,
  label,
  required,
  error,
  helper,
  editable = true,
  autoFocus,
  onSubmitEditing,
  accessibilityLabel,
  testID,
}: CodeInputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const reportFocusToScrollView = useKeyboardScroll();
  const [focused, setFocused] = useState(false);

  const digits = normalize(value ?? '', length);
  // Where the next digit lands. A full code keeps the ring on the last box rather than dropping it,
  // so a wrong code still shows which field holds the answer being corrected.
  const activeIndex = Math.min(digits.length, length - 1);

  /**
   * Any tap inside the row focuses the field, so the person does not have to find the exact pixels
   * of an invisible input. `onPressIn` rather than `onPress` keeps the keyboard up on a
   * double-tap.
   */
  function focus() {
    if (!editable) return;
    inputRef.current?.focus();
  }

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        onPress={focus}
        // The boxes are a picture of the value; the field below is what a screen reader should
        // read and what it can edit. Marking the picture decorative is what stops TalkBack
        // announcing six empty labels before the real field.
        accessible={false}
        testID={testID ? `${testID}-frame` : 'code-input-frame'}
      >
        <View style={styles.frame}>
          <View
            style={styles.row}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {Array.from({ length }).map((_, index) => {
              const digit = digits[index] ?? '';
              const isActive = index === activeIndex;
              return (
                <View
                  key={index}
                  testID={`code-box-${index}`}
                  style={[
                    styles.box,
                    isActive && editable ? styles.boxActive : null,
                    error ? styles.boxError : null,
                    error && isActive && editable ? styles.boxErrorActive : null,
                    !editable ? styles.boxDisabled : null,
                  ]}
                >
                  {digit ? (
                    <Text style={[styles.digit, !editable ? styles.digitDisabled : null]}>
                      {digit}
                    </Text>
                  ) : isActive && editable && focused ? (
                    <View style={styles.caret} testID={`code-caret-${index}`} />
                  ) : null}
                </View>
              );
            })}
          </View>

          {/**
           * ONE field over the whole row, carrying the value the boxes draw.
           *
           * Its length is capped by `normalize`, not by `maxLength`: `maxLength` truncates the RAW
           * string, so a paste of "+1 (481) 902" would become "+1 (48" and lose the last three
           * digits before they were ever filtered. Filtering first, then capping, is what makes a
           * messy paste survive.
           */}
          <TextInput
            ref={inputRef}
            testID={testID ?? 'code-input'}
            style={styles.overlay}
            value={digits}
            onChangeText={(text: string) => onChangeText(normalize(text, length))}
            keyboardType="number-pad"
            editable={editable}
            autoFocus={autoFocus}
            autoCapitalize="none"
            autoCorrect={false}
            caretHidden
            // The one field nobody types from memory: Android offers it as an autofill chip,
            // iOS from Mail above the keyboard — but only when the field says what it holds.
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="go"
            onSubmitEditing={onSubmitEditing}
            accessibilityLabel={accessibilityLabel ?? (typeof label === 'string' ? label : 'Code')}
            onFocus={() => {
              setFocused(true);
              reportFocusToScrollView?.(inputRef.current);
            }}
            onBlur={() => setFocused(false)}
          />
        </View>
      </Pressable>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}
