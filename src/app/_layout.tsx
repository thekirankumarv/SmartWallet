import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { initStore, useStore } from '../lib/store';
import { loadApiKey } from '../lib/voice';
import { C, DialogHost } from '../components/ui';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent, text: C.text, border: C.line } };

export default function Root() {
  const ready = useStore((s) => s.ready);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(C.bg);
    initStore();
    loadApiKey().catch(() => {});
  }, []);
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      {ready ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="tx" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      ) : (
        <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.sub }}>Loading…</Text>
        </View>
      )}
      <DialogHost />
    </ThemeProvider>
  );
}
