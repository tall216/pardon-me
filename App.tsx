import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  StatusBar,
} from 'react-native';
import { OldPhoneIcon } from './src/OldPhoneIcon';
import { FakeCallOverlay } from './src/FakeCallOverlay';
import { useFakeCall, endCall, triggerFakeCall } from './src/fakeCall';
import { useVolumeTrigger, simulateVolumeDownPress } from './src/volumeListener';
import { startCallScheduler, scheduleCall } from './src/scheduler';
import { getCaller, setCallerName } from './src/CallerProfile';

export default function App() {
  const call = useFakeCall();
  const [name, setName] = useState(getCaller().name);

  // Start the volume (double-press) listener and the scheduled-call receiver.
  useVolumeTrigger();
  useEffect(() => {
    try { startCallScheduler(); } catch (_) { /* permissions not yet granted */ }
  }, []);

  const onSaveName = () => {
    setCallerName(name.trim() || 'Michael');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0b0f" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* App icon + title */}
          <OldPhoneIcon size={104} />
          <Text style={styles.title}>Pardon Me</Text>
          <Text style={styles.desc}>A fake incoming call, on demand — to escape any situation.</Text>

          {/* Armed chip */}
          <View style={styles.chip}>
            <View style={styles.dot} />
            <Text style={styles.chipText}>Armed · ready</Text>
          </View>

          {/* Caller name (minimal, per "no extra settings" rule) */}
          <View style={styles.nameRow}>
            <TextInput
              style={styles.input}
              value={name}
              placeholder="Caller name"
              placeholderTextColor="#6a6f78"
              onChangeText={setName}
              onBlur={onSaveName}
              onSubmitEditing={onSaveName}
            />
          </View>
          <Text style={styles.hint}>Default caller: Michael</Text>

          {/* Test trigger (no hardware needed) */}
          <TouchableOpacity style={styles.primaryBtn} onPress={() => triggerFakeCall()}>
            <Text style={styles.primaryBtnText}>Trigger fake call</Text>
          </TouchableOpacity>

          {/* Schedule demo */}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              const when = new Date(Date.now() + 60 * 1000);
              scheduleCall(when);
            }}
          >
            <Text style={styles.secondaryBtnText}>Schedule call in 1 min</Text>
          </TouchableOpacity>

          <Text style={styles.footnote}>
            On a dev client, double-press Volume Down to launch the call instantly.
          </Text>
        </View>

        {/* The OEM-style incoming call overlay */}
        {call.active && (
          <FakeCallOverlay
            callerName={call.callerName}
            photoUri={call.photoUri}
            onAnswer={() => endCall()}
            onDecline={() => endCall()}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f' },
  safe: { flex: 1 },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28, paddingVertical: 24,
  },
  title: { color: '#fff', fontSize: 30, fontWeight: '700', marginTop: 22 },
  desc: {
    color: '#9aa0aa', fontSize: 15, textAlign: 'center',
    marginTop: 10, lineHeight: 21, maxWidth: 280,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(233,30,99,0.14)', borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: 14, marginTop: 22,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E91E63', marginRight: 8 },
  chipText: { color: '#ff8ab3', fontSize: 13, fontWeight: '600' },

  nameRow: { width: '80%', marginTop: 26 },
  input: {
    backgroundColor: '#16161d', color: '#fff', fontSize: 16,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#23232c', textAlign: 'center',
  },
  hint: { color: '#6a6f78', fontSize: 12, marginTop: 8 },

  primaryBtn: {
    backgroundColor: '#E91E63', borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 40, marginTop: 26,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    backgroundColor: '#16161d', borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 34, marginTop: 12,
    borderWidth: 1, borderColor: '#23232c',
  },
  secondaryBtnText: { color: '#c7ccd6', fontSize: 14 },

  footnote: {
    color: '#5c616b', fontSize: 12, textAlign: 'center',
    marginTop: 26, maxWidth: 300, lineHeight: 18,
  },
});
