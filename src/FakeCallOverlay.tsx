import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  PixelRatio,
} from 'react-native';
import { OldPhoneIcon } from './OldPhoneIcon';
import * as NavigationBar from 'expo-navigation-bar';
import type { CallState } from './fakeCall';

export interface FakeCallOverlayProps {
  callerName: string;
  photoUri?: string;
  callState?: CallState;
  onAnswer: () => void;
  onDecline: () => void;
}

export function FakeCallOverlay({ callerName, photoUri, callState = 'RINGING', onAnswer, onDecline }: FakeCallOverlayProps) {
  const [clock, setClock] = useState(currentClock());
  const [callSeconds, setCallSeconds] = useState(0);

  /**
   * Go fully immersive while the call is on screen.
   *
   * Without this the system status bar and the navigation bar stay drawn over
   * our UI as grey strips, which instantly breaks the illusion — a real
   * incoming call owns the whole display. We hide both and restore the
   * navigation bar when the overlay unmounts.
   */
  useEffect(() => {
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
    NavigationBar.setBackgroundColorAsync('#000000').catch(() => {});
    return () => {
      NavigationBar.setVisibilityAsync('visible').catch(() => {});
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(currentClock()), 1000);
    return () => clearInterval(id);
  }, []);

  // In-call duration timer while ACTIVE
  useEffect(() => {
    if (callState !== 'ACTIVE') { setCallSeconds(0); return; }
    const id = setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  const initial = (callerName.trim()[0] ?? '?').toUpperCase();
  const isActive = callState === 'ACTIVE';
  const isEnded = callState === 'ENDED';

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <View style={styles.safe}>
        <View style={styles.statusBar}>
          <Text style={styles.statusTime}>{clock}</Text>
          <View style={styles.statusRight}>
            <Text style={styles.carrier}>Verizon</Text>
            <Wifi />
            <Signal />
            <Battery />
            <Text style={styles.batteryPct}>87%</Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.incoming}>
            {isEnded ? 'Call ended' : isActive ? formatDuration(callSeconds) : 'Incoming call'}
          </Text>
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

          {isActive ? (
            <View style={styles.secondaryRow}>
              <SecondaryAction label="Mute" glyph="🎙️" />
              <SecondaryAction label="Keypad" glyph="🔢" />
              <SecondaryAction label="Speaker" glyph="🔊" />
            </View>
          ) : !isEnded ? (
            <View style={styles.secondaryRow}>
              <SecondaryAction label="Remind" glyph="⏰" />
              <SecondaryAction label="Message" glyph="💬" />
              <SecondaryAction label="Audio" glyph="🎧" />
            </View>
          ) : null}
        </View>

        {isActive ? (
          <>
            <View style={[styles.actions, styles.actionsCentered]}>
              <TouchableOpacity style={[styles.roundBtn, styles.decline]} onPress={onDecline}>
                <Text style={styles.declineGlyph}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.swipeHint}>Tap ✕ to end call</Text>
          </>
        ) : isEnded ? (
          <View style={[styles.actions, styles.actionsCentered]} />
        ) : (
          <>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.roundBtn, styles.decline]} onPress={onDecline}>
                <Text style={styles.declineGlyph}>✕</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roundBtn, styles.answer]} onPress={onAnswer}>
                <Text style={styles.answerGlyph}>📞</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.swipeHint}>Swipe up to answer · tap ✕ to decline</Text>
          </>
        )}
      </View>
    </View>
  );
}

function formatDuration(total: number): string {
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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

function Wifi() {
  return (
    <View style={styles.wifi}>
      <View style={styles.wifiArcOuter} />
      <View style={styles.wifiArcInner} />
      <View style={styles.wifiDot} />
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
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 9999,
    elevation: 9999,
  },
  safe: { flex: 1 },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    // Sits where a real status bar sits now that we're edge-to-edge.
    paddingTop: 14,
    paddingBottom: 4,
    height: 44,
  },
  statusTime: { color: '#fff', fontSize: 14 * fontScale, fontWeight: '600' },
  statusRight: { flexDirection: 'row', alignItems: 'center' },
  carrier: { color: '#fff', fontSize: 12 * fontScale, marginRight: 7, opacity: 0.9 },
  batteryPct: { color: '#fff', fontSize: 12 * fontScale, marginLeft: 4, opacity: 0.9 },
  wifi: {
    width: 15, height: 11, alignItems: 'center', justifyContent: 'flex-end',
    marginRight: 6,
  },
  wifiArcOuter: {
    position: 'absolute', top: 0, width: 15, height: 15, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#fff', opacity: 0.95,
  },
  wifiArcInner: {
    position: 'absolute', top: 4, width: 8, height: 8, borderRadius: 4,
    borderWidth: 1.5, borderColor: '#fff',
  },
  wifiDot: {
    width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: '#fff',
    marginBottom: 0.5,
  },
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
  incoming: { color: '#888', fontSize: 16 * fontScale, letterSpacing: 0.5, marginBottom: 28, fontWeight: '500' },
  avatarWrap: { marginBottom: 22 },
  avatar: {
    width: 132, height: 132, borderRadius: 66, backgroundColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#333',
  },
  avatarInitial: { color: '#fff', fontSize: 54 * fontScale, fontWeight: '300' },
  name: { color: '#fff', fontSize: 30 * fontScale, fontWeight: '600', marginBottom: 6 },
  subtitle: { color: '#666', fontSize: 16 * fontScale },
  secondaryRow: { flexDirection: 'row', marginTop: 40 },
  secondaryItem: { alignItems: 'center', marginHorizontal: 22 },
  secondaryCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  secondaryGlyph: { fontSize: 22 * fontScale, color: '#fff' },
  secondaryLabel: { color: '#888', fontSize: 12 * fontScale },
  actions: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 56, marginBottom: 18,
  },
  actionsCentered: { justifyContent: 'center' },
  roundBtn: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    // Real dialers give these buttons a soft glow/shadow.
    elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  answer: { backgroundColor: '#2ecc71' },
  decline: { backgroundColor: '#e74c3c' },
  answerGlyph: { fontSize: 30 * fontScale, transform: [{ rotate: '90deg' }] },
  declineGlyph: { fontSize: 30 * fontScale, color: '#fff' },
  swipeHint: { color: '#444', fontSize: 13 * fontScale, textAlign: 'center', marginBottom: 28 },
});
