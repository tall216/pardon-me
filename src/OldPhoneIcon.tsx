import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { View, StyleSheet, ViewStyle } from 'react-native';

interface IconProps {
  size?: number;
  /** Background tile color behind the phone. */
  tile?: string;
  /** Handset color. */
  color?: string;
  style?: ViewStyle;
}

/**
 * OldPhoneIcon — a candlestick-style antique telephone drawn in SVG.
 *
 * Used in two places:
 *   1. The app's "icon" area on the home screen (dark tile, pink handset).
 *   2. The small "armed" indicator chip.
 *
 * It is a pure vector so it also doubles as a blueprint for the real
 * launcher icon (adaptive icon foreground) produced in a dev build.
 */
export function OldPhoneIcon({ size = 96, tile = '#16161d', color = '#E91E63', style }: IconProps) {
  const pad = size * 0.16;
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.22, backgroundColor: tile }, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
        <G transform={`translate(${pad} ${pad})`} stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Base plinth */}
          <Path d="M18 78 L82 78" strokeWidth={6} />
          <Path d="M26 78 L30 86 L70 86 L74 78" strokeWidth={5} />
          {/* Two cradle posts */}
          <Path d="M30 78 L30 52" />
          <Path d="M70 78 L70 52" />
          {/* Cradle crossbar holding the handset */}
          <Path d="M24 52 L76 52" />
          {/* Handset (the ear/mouth pieces + the curved grip) */}
          <Path d="M20 40 q10 -14 24 -6 q6 4 12 0 q14 -8 24 6" />
          <Circle cx={20} cy={42} r={6} fill={color} stroke="none" />
          <Circle cx={80} cy={42} r={6} fill={color} stroke="none" />
          {/* Decorative bell hint on the base */}
          <Rect x={46} y={60} width={8} height={10} rx={2} fill={color} stroke="none" />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
