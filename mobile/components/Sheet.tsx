import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import { radius, spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';
import IconButton from './IconButton';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    backdropTouch: { flex: 1 },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      maxHeight: '75%',
    },
    // While the keyboard is up the sheet must be allowed to give up height: it is capped
    // at 75% of the screen, which is taller than the room left above a keyboard, and a
    // React Native flex child does NOT shrink by default. With this the sheet fits the
    // space that is left and its own scroll view scrolls the focused field into it —
    // without it the sheet kept its height and the bottom of the form stayed buried.
    sheetAvoidingKeyboard: { flexShrink: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    title: { ...type.h3, color: colors.text },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
  });

export interface SheetProps {
  visible?: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}

/**
 * Bottom sheet modal used by pickers and manage screens. Transparent slide-up
 * sheet over a dismiss-on-tap backdrop. `title` is required for accessibility;
 * the close control is a labelled IconButton (44px target).
 */
function Sheet({ visible, onClose, title, children, footer, closeLabel = 'Done' }: SheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { height: keyboardHeight } = useKeyboardHeight();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* A sheet is anchored to the bottom of the screen and so is the keyboard, and in
          this build the Android window does NOT resize for the keyboard (measured on the
          device 2026-10-14 — see hooks/useKeyboardHeight). So the sheet is lifted by the
          keyboard's own height instead of waiting for a resize that never comes. Before
          this, the create-a-category form's lowest field and its Create button were under
          the keyboard, and the sheet could not be scrolled to reach them. */}
      <View style={[styles.backdrop, keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Dismiss" />
        <SafeAreaView style={[styles.sheet, keyboardHeight > 0 && styles.sheetAvoidingKeyboard]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <IconButton icon="close" label={closeLabel} onPress={onClose} accessibilityLabel={closeLabel} />
          </View>
          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default Sheet;
