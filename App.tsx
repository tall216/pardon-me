import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  StatusBar,
  ScrollView,
} from 'react-native';
import { OldPhoneIcon } from './src/OldPhoneIcon';
import { FakeCallOverlay } from './src/FakeCallOverlay';
import { useFakeCall, endCall, answerCall, triggerFakeCall, scheduleNativeCall, useNativeCallBridge, checkFullScreenPermission, openFullScreenSettings, hasNativeCall } from './src/fakeCall';
import { useStealthTrigger, syncCallerToNative } from './src/volumeListener';
import { getCaller, setCaller, getPresets, addPreset, loadSavedProfile } from './src/CallerProfile';

export default function App() {
  const call = useFakeCall();
  const [name, setName] = useState(getCaller().name);
  const [presets, setPresets] = useState<any[]>([]);
  const [fsAllowed, setFsAllowed] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  // Raises the call UI when the app is opened by a call notification.
  useNativeCallBridge();

  useEffect(() => {
    (async () => {
      await loadSavedProfile();
      setName(getCaller().name);
      await loadPresets();
      setFsAllowed(await checkFullScreenPermission());
    })();
  }, []);

  const { armed, toggle } = useStealthTrigger(name);

  async function loadPresets() {
    const p = await getPresets();
    setPresets(p);
  }

  const onSaveName = () => {
    const finalName = name.trim() || 'Michael';
    setCaller({ name: finalName });
    syncCallerToNative(finalName);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <OldPhoneIcon size={80} />
            <Text style={styles.title}>Pardon Me</Text>
            <Text style={styles.desc}>Industrial-grade stealth call simulation.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Quick Identity</Text>
            <View style={styles.presetGrid}>
              {presets.map(p => (
                <TouchableOpacity 
                  key={p.id} 
                  style={[styles.presetBtn, name === p.name && styles.presetBtnActive]} 
                  onPress={() => setName(p.name)}
                >
                  <Text style={styles.presetBtnText}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={name}
              placeholder="Custom Caller Name"
              placeholderTextColor="#444"
              onChangeText={setName}
              onBlur={onSaveName}
              onSubmitEditing={onSaveName}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Trigger Controls</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => triggerFakeCall()}>
              <Text style={styles.primaryBtnText}>Execute Immediate Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={async () => {
                const ok = await scheduleNativeCall(60);
                setStatus(ok ? 'Call scheduled — lock the phone and wait 60s.' : 'Schedule failed.');
                setTimeout(() => setStatus(null), 4000);
              }}
            >
              <Text style={styles.secondaryBtnText}>Schedule in 60 Seconds</Text>
            </TouchableOpacity>
            {status && <Text style={styles.status}>{status}</Text>}
          </View>

          {!fsAllowed && (
            <TouchableOpacity style={styles.warnCard} onPress={() => openFullScreenSettings()}>
              <Text style={styles.warnTitle}>Action needed</Text>
              <Text style={styles.warnText}>
                Allow full-screen notifications so calls can appear on the lock screen. Tap to open settings.
              </Text>
            </TouchableOpacity>
          )}
          {!hasNativeCall && (
            <View style={styles.warnCard}>
              <Text style={styles.warnTitle}>Limited mode</Text>
              <Text style={styles.warnText}>
                Native call module unavailable — lock-screen ringing is disabled in this build.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Stealth Trigger</Text>
            <TouchableOpacity
              style={[styles.armBtn, armed && styles.armBtnActive]}
              onPress={toggle}
            >
              <View style={[styles.armDot, armed && styles.armDotActive]} />
              <Text style={[styles.armBtnText, armed && styles.armBtnTextActive]}>
                {armed ? 'ARMED — Tap to turn off' : 'OFF — Tap to arm'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.armHint}>
              {armed
                ? 'Double-press either volume key to trigger a call. Works with the app closed or the phone locked.'
                : 'Volume keys behave normally. No calls will trigger.'}
            </Text>
          </View>

          <View style={styles.footer}>
             <Text style={styles.footnote}>Scheduled calls fire even when fully closed.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/*
        Rendered inline (not in a <Modal>) on purpose: a Modal is a separate
        Android window with its own insets controller, so the immersive
        full-screen flags applied to the activity never reached it and Android
        kept drawing its white navigation bar across the bottom of the fake
        call screen. Inline + absolute fill lives in the activity window, so
        the native immersive mode governs it.
      */}
      {call.state !== 'IDLE' && (
        <FakeCallOverlay
          callerName={call.callerName}
          photoUri={call.photoUri}
          callState={call.state}
          onAnswer={() => answerCall()}
          onDecline={() => endCall()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  safe: { flex: 1 },
  content: { padding: 24, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 40, marginTop: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 16, letterSpacing: 1 },
  desc: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 4 },
  card: { 
    width: '100%', 
    backgroundColor: '#111', 
    borderRadius: 16, 
    padding: 20, 
    marginBottom: 20, 
    borderWidth: 1, 
    borderColor: '#222' 
  },
  cardTitle: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  presetBtn: { backgroundColor: '#222', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  presetBtnActive: { borderColor: '#0066cc', backgroundColor: '#1a1a2e' },
  presetBtnText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  input: { 
    backgroundColor: '#050505', 
    color: '#fff', 
    padding: 12, 
    borderRadius: 8, 
    fontSize: 16, 
    borderWidth: 1, 
    borderColor: '#333' 
  },
  primaryBtn: { 
    backgroundColor: '#fff', 
    padding: 16, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginTop: 12 
  },
  primaryBtnText: { color: '#000', fontWeight: '800', fontSize: 16, textTransform: 'uppercase' },
  secondaryBtn: { 
    backgroundColor: 'transparent', 
    padding: 16, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginTop: 8, 
    borderWidth: 1, 
    borderColor: '#333' 
  },
  secondaryBtnText: { color: '#888', fontSize: 14, fontWeight: '500' },
  footer: { marginTop: 20, alignItems: 'center' },
  status: { color: '#4a9eff', fontSize: 13, marginTop: 12, textAlign: 'center' },
  armBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0d0d0d', padding: 16, borderRadius: 8,
    borderWidth: 1, borderColor: '#333',
  },
  armBtnActive: { borderColor: '#2ecc71', backgroundColor: '#0a1a0f' },
  armDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#444', marginRight: 10,
  },
  armDotActive: { backgroundColor: '#2ecc71' },
  armBtnText: { color: '#888', fontSize: 14, fontWeight: '600' },
  armBtnTextActive: { color: '#2ecc71' },
  armHint: { color: '#555', fontSize: 12, marginTop: 10, lineHeight: 17 },
  warnCard: {
    width: '100%', backgroundColor: '#1a1206', borderRadius: 12, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: '#4a3510',
  },
  warnTitle: { color: '#f0a020', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  warnText: { color: '#b89050', fontSize: 13, lineHeight: 18 },
  footnote: { color: '#444', fontSize: 12, textAlign: 'center', fontStyle: 'italic' },
});
