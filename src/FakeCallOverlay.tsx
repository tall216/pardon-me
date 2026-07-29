import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  PixelRatio,
} from 'react-native';
import { OldPhoneIcon } from './OldPhoneIcon';

export interface FakeCallOverlayProps {
  callerName: string;
  /** Optional avatar photo URI. When absent we show the caller's initial. */
  photoUri?: string;
  onAnswer: () => void;
  onDecline: () => void;
}

/**
 * FakeCallOverlay — mimics a STOCK OEM Android incoming-call screen:
 *   * full-screen dark background
 *   * a faux status bar (signal / clock / battery) drawn in-app so it looks
 *     native even over the lock screen
 *   * "Incoming call" label, circular avatar with initial, caller name, "Mobile"
 *   * a secondary action row (Remind / Message / Audio)
 *   * big round green Answer and red Decline buttons
 *   * a swipe-to-answer hint at the bottom
 *
 * Answer / Decline call back to the parent, which stops the ringtone and
 * unmounts the overlay.
 */
export function FakeCallOverlay({ callerName, photoUri, onAnswer, onDecline }: FakeCallOverlayProps) {
  const [clock, setClock] = useState(currentClock());

  useEffect(() => {
    const id = setInterval(() => setClock(currentClock()), 10000);
    return () => clearInterval(id);
  }, []);

  const initial = (callerName.trim()[0] ?? '?').toUpperCase();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <SafeAreaView style={styles.safe}>
        {/* Faux OEM status bar */}
        <View style={styles.statusBar}>
          <Text style={styles.statusTime}>{clock}</Text>
          <View style={styles.statusRight}>
            <Signal />
            <Text style={styles.statusCarrier}> </Text>
            <Battery />
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.incoming}>Incoming call</Text>

          <View style={styles.avatarWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </View>

          <Text style={styles.name}>{callerName}</Text>
          <Text style={styles.subtitle}>Mobile</Text>

          {/* Secondary action row */}
          <View style={styles.secondaryRow}>
            <SecondaryAction label="Remind" glyph="⏰" />
            <SecondaryAction label="Message" glyph="💬" />
            <SecondaryAction label="Audio" glyph="🎧" />
          </View>
        </View>

        {/* Primary answer / decline */}
        <View style={styles.actions}>
          <TouchableOpacity accessibilityRole="button" style={[styles.roundBtn, styles.decline]} onPress={onDecline}>
            <Text style={styles.declineGlyph}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={[styles.roundBtn, styles.answer]} onPress={onAnswer}>
            <Text style={styles.answerGlyph}>📞</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.swipeHint}>Swipe up to answer · tap ✕ to decline</Text>
      </SafeAreaView>
    </View>
  );
}

function SecondaryAction({ label, glyph }: { label: string; glyph: string }) {
  return (
    <View style={styles.secondaryItem}>
      <View style={styles.secondaryCircle}>
        <Text style={styles.secondaryGlyph}>{glyph}</Text>
      </View>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </View>
  );
}

function Signal() {
  return (
    <View style={styles.signal}>
      <View style={[styles.bar, { height: 3 }]} />
      <View style={[styles.bar, { height: 5 }]} />
      <View style={[styles.bar, { height: 7 }]} />
      <View style={[styles.bar, { height: 9 }]} />
    </View>
  );
}

function Battery() {
  return (
    <View style={styles.battery}>
      <View style={styles.batteryShell}>
        <View style={styles.batteryFill} />
      </View>
      <View style={styles.batteryNub} />
    </View>
  );
}

function currentClock(): string {
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

const fontScale = PixelRatio.getFontScale();

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d12' },
  safe: { flex: 1 },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 4,
  },
  statusTime: { color: '#fff', fontSize: 14 * fontScale, fontWeight: '600' },
  statusRight: { flexDirection: 'row', alignItems: 'center' },
  statusCarrier: { color: '#fff', fontSize: 12 * fontScale, marginHorizontal: 6 },
  signal: { flexDirection: 'row', alignItems: 'flex-end', marginRight: 8 },
  bar: { width: 3, backgroundColor: '#fff', marginLeft: 2, borderRadius: 1 },
  battery: { flexDirection: 'row', alignItems: 'center' },
  batteryShell: {
    width: 22, height: 11, borderWidth: 1, borderColor: '#fff',
    borderRadius: 3, padding: 1.5, justifyContent: 'flex-start',
  },
  batteryFill: { width: '70%', height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  batteryNub: { width: 2, height: 5, backgroundColor: '#fff', borderTopRightRadius: 1, borderBottomRightRadius: 1, marginLeft: 1 },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  incoming: { color: '#9aa0aa', fontSize: 16 * fontScale, letterSpacing: 0.5, marginBottom: 28 },
  avatarWrap: { marginBottom: 22 },
  avatar: {
    width: 132, height: 132, borderRadius: 66, backgroundColor: '#2a2a33',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarInitial: { color: '#fff', fontSize: 54 * fontScale, fontWeight: '300' },
  name: { color: '#fff', fontSize: 30 * fontScale, fontWeight: '400', marginBottom: 6 },
  subtitle: { color: '#9aa0aa', fontSize: 16 * fontScale },

  secondaryRow: { flexDirection: 'row', marginTop: 40 },
  secondaryItem: { alignItems: 'center', marginHorizontal: 22 },
  secondaryCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  secondaryGlyph: { fontSize: 22 * fontScale, color: '#fff' },
  secondaryLabel: { color: '#c7ccd6', fontSize: 12 * fontScale },

  actions: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 56, marginBottom: 18,
  },
  roundBtn: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
  },
  answer: { backgroundColor: '#1faa4a' },
  decline: { backgroundColor: '#e23b3b' },
  answerGlyph: { fontSize: 30 * fontScale, transform: [{ rotate: '90deg' }] },
  declineGlyph: { fontSize: 30 * fontScale, color: '#fff' },

  swipeHint: { color: '#7d828c', fontSize: 13 * fontScale, textAlign: 'center', marginBottom: 28 },
});
