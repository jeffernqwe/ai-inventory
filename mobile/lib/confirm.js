import { Alert } from 'react-native';

/**
 * Cross-platform confirmation dialog. Wrap destructive actions (archive, stock
 * out, sign out…) so users confirm before irreversible changes. Resolves true
 * when the user confirms, false when they cancel.
 */
export function confirm(title, message, { confirmText = 'Confirm', destructive = false } = {}) {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/** Plain single-action alert. */
export function alert(title, message) {
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve(true) }], { cancelable: false });
  });
}
