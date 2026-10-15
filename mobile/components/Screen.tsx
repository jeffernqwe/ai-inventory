import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';
import KeyboardScrollView from './KeyboardScrollView';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import { spacing } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    padded: { padding: spacing.lg },
  });

export interface ScreenProps {
  children?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboard?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
}

/**
 * Standard screen shell: safe-area background + optional scroll/keyboard
 * handling + pull-to-refresh. Screens stay free of layout boilerplate.
 */
export default function Screen({
  children,
  scroll = false,
  refreshing,
  onRefresh,
  keyboard = true,
  padded = true,
  contentStyle,
  style,
  edges,
}: ScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { height: keyboardHeight } = useKeyboardHeight();

  const refreshControl =
    refreshing !== undefined && onRefresh ? (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
    ) : undefined;

  let body;
  if (scroll) {
    body = (
      <KeyboardScrollView
        // The extra bottom room is what lets the LAST field on a long form be scrolled
        // above the keyboard: scrolling the focused field into view is only possible if
        // the content is longer than the space left, and a field with nothing below it has
        // nowhere to go. Added only while the keyboard is up, so no screen gains stray
        // space. `KeyboardScrollView` supplies the scrolling itself.
        contentContainerStyle={[
          padded && styles.padded,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight + spacing.lg },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardScrollView>
    );
  } else {
    body = <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>;
  }

  /**
   * THE FIX. The shell gives up exactly the keyboard's height at the bottom while it is up,
   * so anything anchored to the bottom of a screen — the AI chat's composer is the one that
   * exists today — is lifted above the keyboard instead of sitting underneath it.
   *
   * WHY THE HEIGHT IS MEASURED HERE AND NOT LEFT TO `KeyboardAvoidingView`. It was left to
   * that component first, on both platforms, and on the device that did nothing at all: with
   * the keyboard open on the AI chat screen the composer's full-width band was absent from
   * every row above the keyboard (measured 2026-10-14 on the OPPO: a colour scan of the
   * screenshot found the app's surface colour only at y 0..34, 64..172 and 204..264 while the
   * IME occupied everything below y≈1560, while the same scan with the keyboard closed found
   * the composer at y≈1996..2208). React Native reasons about the keyboard in its own frame
   * of reference and that arithmetic is not this project's to fix; the height it needs is
   * already measured correctly here — the same measurement the login screen and the bottom
   * sheet demonstrably respond to — so the shell applies it directly.
   *
   * This also keeps ONE mechanism instead of two: the value that lifts a footer composer is
   * the value the scroll-into-view maths below uses, so a screen can never be lifted by one
   * number while its fields are scrolled for another.
   */
  const wrapped = keyboard ? (
    <View style={[styles.flex, keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}>{body}</View>
  ) : (
    body
  );

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges ?? ['top', 'bottom']}>
      {wrapped}
    </SafeAreaView>
  );
}
