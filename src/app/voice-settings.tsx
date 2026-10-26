import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { AiError, KEY_URL, keyProblem, verifyKey } from '../lib/ai';
import { maskKey, saveApiKey, useApiKey } from '../lib/voice';
import { Btn, C, Card, Field, Header, s, Screen, confirm, confirmDelete, goBack, notify } from '../components/ui';

export default function VoiceSettings() {
  const saved = useApiKey((st) => st.key);
  const [editing, setEditing] = useState(!saved);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const store = async (key: string) => {
    await saveApiKey(key);
    setInput('');
    setEditing(false);
    notify('Voice entry is on', 'Hold the mic button on Transactions and speak your entries.');
    goBack();
  };

  const check = async () => {
    const key = input.trim();
    const problem = keyProblem(key);
    if (problem) return setError(problem);
    setBusy(true);
    setError(undefined);
    try {
      await verifyKey(key);
      await store(key);
    } catch (e) {
      if (e instanceof AiError && (e.kind === 'network' || e.kind === 'quota'))
        confirm(`${e.title}: key not checked`, `${e.message}\n\nSave the key anyway?`, 'Save', () => store(key));
      else setError(e instanceof AiError ? `${e.title}. ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      await verifyKey(saved!);
      notify('Key works', 'Google accepted your Gemini API key.');
    } catch (e) {
      notify(e instanceof AiError ? e.title : 'Check failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    confirmDelete('your API key', 'Voice entry will stop working until you add a key again.', async () => {
      await saveApiKey(null);
      setEditing(true);
    });

  return (
    <Screen scroll>
      <Header title="Voice entry" back />
      <View style={{ gap: 16 }}>
        <Card style={{ gap: 8 }}>
          <Text style={s.rowTitle}>🎤 Hold, speak, release</Text>
          <Text style={s.muted}>
            Hold the mic button on Transactions and say something like “milk 47, petrol 205 yesterday, salary 60000 to savings”. You’ll see the entries to check
            before they’re saved.
          </Text>
          <Text style={s.small}>Uses Google Gemini with your own free API key. A few entries a day stays well within the free limit.</Text>
        </Card>

        {saved && !editing ? (
          <Card style={{ gap: 14 }}>
            <View style={[s.row, { gap: 10 }]}>
              <Ionicons name="checkmark-circle" size={22} color={C.green} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Gemini API key saved</Text>
                <Text style={s.small}>{maskKey(saved)}</Text>
              </View>
              {busy && <ActivityIndicator color={C.accent} />}
            </View>
            <Btn label="Test key" kind="ghost" icon="pulse" onPress={test} disabled={busy} />
            <Btn label="Replace key" kind="ghost" icon="swap-horizontal" onPress={() => setEditing(true)} disabled={busy} />
            <Btn label="Remove key" kind="danger" icon="trash-outline" onPress={remove} disabled={busy} />
          </Card>
        ) : (
          <Card style={{ gap: 14 }}>
            <Text style={s.label}>1. Get a free key</Text>
            <Text style={s.small}>Sign in with Google, tap “Create API key”, then copy it.</Text>
            <Btn label="Open Google AI Studio" kind="ghost" icon="open-outline" onPress={() => Linking.openURL(KEY_URL)} />
            <Text style={s.label}>2. Paste it here</Text>
            <Field
              label="Gemini API key"
              value={input}
              onChangeText={(v) => (setInput(v), setError(undefined))}
              placeholder="AQ.…"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              importantForAutofill="no"
            />
            {!!error && <Text style={{ color: C.red, fontSize: 13, lineHeight: 18 }}>{error}</Text>}
            <Btn label={busy ? 'Checking…' : 'Check & save'} icon="checkmark" onPress={check} disabled={busy || !input.trim()} />
            {saved && <Btn label="Cancel" kind="ghost" onPress={() => (setEditing(false), setInput(''), setError(undefined))} />}
          </Card>
        )}

        <Text style={[s.small, { paddingHorizontal: 4 }]}>
          Your key is stored encrypted on this phone only and isn’t included in backups. Voice clips are sent to Google along with your account and category
          names; balances and past transactions are not. On Gemini’s free tier, Google may use requests to improve its products.
        </Text>
      </View>
    </Screen>
  );
}
