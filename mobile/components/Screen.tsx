import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';
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

  const refreshControl =
    refreshing !== undefined && onRefresh ? (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
    ) : undefined;

  let body;
  if (scroll) {
    body = (
      <ScrollView
        contentContainerStyle={[padded && styles.padded, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  } else {
    body = <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>;
  }

  const wrapped = keyboard ? (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges ?? ['top', 'bottom']}>
      {wrapped}
    </SafeAreaView>
  );
}
