import { Ionicons } from '@expo/vector-icons';
import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AiError, understand } from '../lib/ai';
import { pickData } from '../lib/io';
import { today } from '../lib/money';
import { useStore } from '../lib/store';
import { readAudio, useApiKey } from '../lib/voice';
import { C, confirm, notify, s } from './ui';

const OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};
const MIN_MS = 700;
const MAX_MS = 60_000;

const openSettings = () => router.push('/voice-settings');
const buzz = () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

export function VoiceButton({ bottom }: { bottom: number }) {
  const recorder = useAudioRecorder(OPTIONS);
  const { durationMillis } = useAudioRecorderState(recorder, 250);
  const key = useApiKey((st) => st.key);
  const [phase, setPhase] = useState<'idle' | 'rec' | 'busy'>('idle');
  const started = useRef<Promise<boolean> | null>(null);
  const t0 = useRef(0);
  const cap = useRef<ReturnType<typeof setTimeout>>(undefined);

  const begin = async () => {
    if (!(await getRecordingPermissionsAsync()).granted) {
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted)
        notify(
          'Microphone needed',
          p.canAskAgain
            ? 'Allow microphone access to add entries by voice.'
            : 'Microphone access is turned off for SmartWallet. Turn it on in Android Settings → Apps → SmartWallet → Permissions.',
        );
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    t0.current = Date.now();
    buzz();
    setPhase('rec');
    cap.current = setTimeout(finish, MAX_MS);
    return true;
  };

  const start = () => {
    if (phase !== 'idle' || started.current) return;
    if (!key) return confirm('Set up voice entry', 'Add a free Gemini API key to log expenses by speaking.', 'Set up', openSettings);
    started.current = begin().catch((e) => {
      notify('Couldn’t start recording', e instanceof Error ? e.message : String(e));
      return false;
    });
  };

  async function finish() {
    clearTimeout(cap.current);
    const pending = started.current;
    started.current = null;
    if (!pending || !(await pending)) return;
    setPhase('busy');
    try {
      await recorder.stop();
      const held = Date.now() - t0.current;
      const audio = recorder.uri ? await readAudio(recorder.uri) : null;
      if (!audio || held < MIN_MS) return notify('Hold to speak', 'Keep holding the mic while you speak, then let go.');
      const r = await understand(key!, pickData(useStore.getState()), today(), audio);
      router.push({ pathname: '/voice', params: { heard: r.heard, drafts: JSON.stringify(r.drafts) } });
    } catch (e) {
      if (e instanceof AiError && e.kind === 'key') confirm(e.title, e.message, 'Open settings', openSettings);
      else if (e instanceof AiError) notify(e.title, e.message);
      else notify('Voice entry failed', e instanceof Error ? e.message : String(e));
    } finally {
      setPhase('idle');
    }
  }

  const secs = Math.floor(durationMillis / 1000);
  return (
    <>
      {phase !== 'idle' && (
        <View style={[st.banner, { bottom: bottom + 70 }]} pointerEvents="none">
          {phase === 'rec' ? <View style={st.dot} /> : <ActivityIndicator color={C.accent} />}
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{phase === 'rec' ? `Listening… 0:${String(secs).padStart(2, '0')}` : 'Understanding…'}</Text>
            <Text style={s.small}>{phase === 'rec' ? 'Say e.g. “milk 47, petrol 205 yesterday”. Release to finish.' : 'Turning your voice into entries'}</Text>
          </View>
        </View>
      )}
      <Pressable
        onPressIn={start}
        onPressOut={finish}
        disabled={phase === 'busy'}
        accessibilityRole="button"
        accessibilityLabel="Hold to add by voice"
        style={({ pressed }) => [st.mic, { bottom }, phase === 'rec' && st.live, pressed && { transform: [{ scale: 1.08 }] }]}
      >
        {phase === 'busy' ? <ActivityIndicator color={C.accent} /> : <Ionicons name="mic" size={24} color={phase === 'rec' ? '#0A0A0F' : C.accent} />}
      </Pressable>
    </>
  );
}

const st = StyleSheet.create({
  mic: {
    position: 'absolute',
    right: 26,
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  live: { backgroundColor: C.red, borderColor: C.red },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    elevation: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.red },
});
