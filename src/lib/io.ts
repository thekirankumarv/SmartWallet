import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { toCsv } from './csv';
import { today } from './money';
import { parseBackup } from './store';
import type { Data } from './types';

async function share(name: string, body: string, mimeType: string) {
  const f = new File(Paths.cache, name);
  f.create({ overwrite: true });
  f.writeSync(body);
  await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: 'Save to Google Drive or anywhere' });
}

export const pickData = (s: Data): Data => ({ v: 1, accounts: s.accounts, cats: s.cats, txs: s.txs, lastAcc: s.lastAcc });
export const backupJson = (s: Data) => share(`SmartWallet-backup-${today()}.json`, JSON.stringify(pickData(s)), 'application/json');
export const exportCsv = (s: Data) => share(`SmartWallet-${today()}.csv`, toCsv(s), 'text/csv');

export async function pickText(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (r.canceled) return null;
  return new File(r.assets[0].uri).text();
}

export const readBackup = (text: string) => parseBackup(text);
