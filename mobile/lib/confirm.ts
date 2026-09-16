import { Alert } from 'react-native';

/** Options accepted by {@link confirm}; both have behaviour-preserving defaults. */
export interface ConfirmOptions {
  confirmText?: string;
  destructive?: boolean;
}

/**
 * Cross-platform confirmation dialog. Wrap destructive actions (archive, stock
 * out, sign out…) so users confirm before irreversible changes. Resolves true
 * when the user confirms, false when they cancel.
 */
export function confirm(
  title: string,
  message: string,
  { confirmText = 'Confirm', destructive = false }: ConfirmOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/** Plain single-action alert. */
export function alert(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve(true) }], { cancelable: false });
  });
}
