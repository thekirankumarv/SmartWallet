import { File, Paths } from 'expo-file-system';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import * as L from './ledger';
import type { Draft } from './ledger';
import { seed } from './seed';
import type { Account, Category, Data } from './types';

export const { balances, flows } = L;
export const parseBackup = L.parse;
export type { Flow } from './ledger';

export type { Draft };

interface State extends Data {
  ready: boolean;
  loadError?: string;
  saveError?: string;
  addTxs: (drafts: Draft[]) => string | undefined;
  updateTx: (id: string, d: Draft) => string | undefined;
  deleteTx: (id: string) => void;
  saveAccount: (a: Account) => void;
  deleteAccount: (id: string) => string | undefined;
  saveCategory: (c: Category) => void;
  deleteCategory: (id: string) => string | undefined;
  replaceAll: (d: Data) => void;
}

const FILE = 'smartwallet.json';
const PREV = 'smartwallet.prev.json';
const TMP = 'smartwallet.tmp.json';
const web = Platform.OS === 'web';

function readRaw(name: string): string | null {
  if (web) return globalThis.localStorage?.getItem(name) ?? null;
  const f = new File(Paths.document, name);
  return f.exists ? f.textSync() : null;
}

function writeRaw(json: string) {
  if (web) return globalThis.localStorage?.setItem(FILE, json);
  const main = new File(Paths.document, FILE);
  const tmp = new File(Paths.document, TMP);
  tmp.create({ overwrite: true });
  tmp.writeSync(json);
  if (main.exists) main.copySync(new File(Paths.document, PREV), { overwrite: true });
  tmp.moveSync(main, { overwrite: true });
}

function load(): { data: Data; error?: string } {
  for (const name of [FILE, PREV]) {
    try {
      const raw = readRaw(name);
      if (raw == null) continue;
      return { data: L.parse(raw) };
    } catch (e) {
      if (name === PREV) return { data: seed(), error: `Saved data is unreadable (${String(e)}). Restore a backup from Settings → Restore.` };
    }
  }
  return { data: seed() };
}

let timer: ReturnType<typeof setTimeout> | undefined;
function flush() {
  clearTimeout(timer);
  const s = useStore.getState();
  if (s.loadError || !s.ready) return;
  const { v, accounts, cats, txs, lastAcc } = s;
  try {
    writeRaw(JSON.stringify({ v, accounts, cats, txs, lastAcc }));
    if (s.saveError) useStore.setState({ saveError: undefined });
  } catch (e) {
    useStore.setState({ saveError: `Couldn't save: ${String(e)}` });
  }
}
function scheduleSave(next: State, prev: State) {
  if (next.txs === prev.txs && next.accounts === prev.accounts && next.cats === prev.cats && next.lastAcc === prev.lastAcc) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

const pick = ({ accounts, cats, txs, lastAcc }: Data) => ({ accounts, cats, txs, lastAcc });

export const useStore = create<State>()((set, get) => {
  const apply = (r: L.Result) => {
    if (!r.error) set(pick(r.data));
    return r.error;
  };
  return {
    ...seed(),
    ready: false,

    addTxs: (drafts) => apply(L.addTxs(get(), drafts)),
    updateTx: (id, d) => apply(L.updateTx(get(), id, d)),
    deleteTx: (id) => set(pick(L.deleteTx(get(), id))),
    saveAccount: (a) => set(pick(L.saveAccount(get(), a))),
    deleteAccount: (id) => apply(L.deleteAccount(get(), id)),
    saveCategory: (c) => set(pick(L.saveCategory(get(), c))),
    deleteCategory: (id) => apply(L.deleteCategory(get(), id)),
    replaceAll: (d) => set({ v: 1, accounts: d.accounts, cats: d.cats, txs: L.sortTxs([...d.txs]), lastAcc: d.lastAcc, loadError: undefined }),
  };
});

export function initStore() {
  const { data, error } = load();
  const accrued = error ? null : L.accrue(data);
  useStore.setState({ ...(accrued ?? data), ready: true, loadError: error });
  useStore.subscribe(scheduleSave);
  AppState.addEventListener('change', (st) => st !== 'active' && flush());
  if (accrued) flush();
}

export const catById = (cats: Category[], id?: string) => cats.find((c) => c.id === id);
export const subName = (c: Category | undefined, sid?: string) => c?.subs.find((s) => s.id === sid)?.name;
