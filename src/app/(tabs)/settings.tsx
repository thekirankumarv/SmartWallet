import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import { importCsv } from '../../lib/csv';
import { backupJson, exportCsv, pickData, pickText, readBackup } from '../../lib/io';
import { useStore } from '../../lib/store';
import { useApiKey } from '../../lib/voice';
import { Bubble, C, Card, Header, Row, s, Screen, Section, type IconName, confirm, notify } from '../../components/ui';

const guard = async (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return notify('Available in the Android app');
  try {
    await fn();
  } catch (e) {
    notify('Something went wrong', String(e instanceof Error ? e.message : e));
  }
};

export default function Settings() {
  const store = useStore();
  const size = JSON.stringify(pickData(store)).length;
  const apiKey = useApiKey((st) => st.key);

  const restore = () =>
    guard(async () => {
      const text = await pickText();
      if (text == null) return;
      const data = readBackup(text);
      confirm(
        'Restore backup?',
        `This replaces ALL data on this phone with the backup (${data.txs.length} transactions). Current data will be lost.`,
        'Restore',
        () => store.replaceAll(data),
      );
    });

  const importFile = () =>
    guard(async () => {
      const text = await pickText();
      if (text == null) return;
      const r = importCsv(text, pickData(store));
      const extra = [r.dupes && `${r.dupes} already in the app (skipped)`, r.bad.length && `${r.bad.length} unreadable rows`].filter(Boolean).join('\n');
      if (!r.added) return notify('Nothing to import', extra || 'No rows found.');
      confirm(`Import ${r.added} transactions?`, extra || undefined, 'Import', () => store.replaceAll(r.data));
    });

  const item = (icon: IconName, color: string, title: string, sub: string, onPress: () => void) => (
    <Row
      onPress={onPress}
      icon={
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
      }
      title={title}
      sub={sub}
      right={<Ionicons name="chevron-forward" size={18} color={C.dim} />}
    />
  );

  return (
    <Screen scroll>
      <Header title="Settings" />
      {(store.loadError || store.saveError) && (
        <Card style={{ borderColor: C.red, marginBottom: 12 }}>
          <Text style={{ color: C.red, fontWeight: '700' }}>{store.loadError || store.saveError}</Text>
        </Card>
      )}
      <Card style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
        {item('pricetags', C.accent, 'Categories & budgets', 'Add, rename, hide, set monthly budget', () => router.push('/categories'))}
        {item('wallet', C.blue, 'Accounts', 'Banks, cash, wallets, cards, loans', () => router.push('/accounts'))}
        {item('mic', C.red, 'Voice entry', apiKey ? 'On · Gemini' : 'Set up with a free Gemini key', () => router.push('/voice-settings'))}
      </Card>

      <Section title="Backup" />
      <Card style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
        {item('cloud-upload', C.green, 'Backup to Google Drive', 'Full backup file — pick Drive in the share menu', () => guard(() => backupJson(store)))}
        {item('cloud-download', C.amber, 'Restore backup', 'Replace data with a backup file', restore)}
        {item('document-text', C.blue, 'Export CSV', 'Spreadsheet of all transactions', () => guard(() => exportCsv(store)))}
        {item('push', C.accent, 'Import CSV', 'Any CSV with Date, Account, Type, Amount', importFile)}
      </Card>

      <View style={{ alignItems: 'center', marginTop: 28, gap: 6 }}>
        <Bubble emoji="💜" size={44} />
        <Text style={s.rowTitle}>SmartWallet</Text>
        <Text style={s.small}>
          {store.txs.length} transactions · {(size / 1024).toFixed(1)} KB · stored only on this phone
        </Text>
      </View>
    </Screen>
  );
}
