import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MODULE_COUNT, QUIET_MODULES, ean13Runs } from '../lib/ean13';
import { type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * On-screen EAN-13 barcode preview (Phase 12D). Draws the bars with plain
 * <View>s from the same module math the print label uses (lib/ean13), so the
 * on-device preview always matches what prints. Shows the human-readable digits
 * beneath. Quiet zones are white padding on both sides so the code stays
 * scannable if a label is photographed/printed from the preview.
 */
export default function Ean13Barcode({ code, moduleWidth = 2, barHeight = 54, showDigits = true }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const runs = ean13Runs(code);
  const contentWidth = MODULE_COUNT * moduleWidth;
  const quiet = QUIET_MODULES * moduleWidth;

  return (
    <View style={styles.wrap}>
      <View style={styles.inner}>
        <View style={[styles.bars, { height: barHeight }]}>
          <View style={{ width: quiet, height: barHeight }} />
          <View style={{ flexDirection: 'row', width: contentWidth, height: barHeight }}>
            {runs.map((run, i) => (
              <View
                key={i}
                style={{
                  width: run.len * moduleWidth,
                  height: barHeight,
                  backgroundColor: run.on ? '#000' : 'transparent',
                }}
              />
            ))}
          </View>
          <View style={{ width: quiet, height: barHeight }} />
        </View>
        {showDigits ? (
          <Text style={[styles.digits, { letterSpacing: Math.max(moduleWidth - 1, 0) }]}>{code}</Text>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    wrap: { alignItems: 'center' },
    inner: { alignItems: 'center' },
    bars: { flexDirection: 'row', backgroundColor: '#fff' },
    digits: {
      ...type.caption,
      color: colors.text,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      marginTop: 6,
      textAlign: 'center',
    },
  });
