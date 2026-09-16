import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Dismiss" />
        <SafeAreaView style={styles.sheet}>
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
