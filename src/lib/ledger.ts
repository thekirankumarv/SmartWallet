import { addMonths, isValidYmd, lastDayOf, monthOf, today, uid } from './money';
import { ADJ_E, ADJ_I, INTEREST_SUB, LOAN_CAT } from './seed';
import type { Account, Category, Data, Tx } from './types';

export type Draft = Omit<Tx, 'id'>;

export function parse(raw: string): Data {
  const d = JSON.parse(raw);
  if (d?.v !== 1 || !Array.isArray(d.txs) || !Array.isArray(d.accounts) || !Array.isArray(d.cats)) throw new Error('Not a SmartWallet file');
  return d;
}

export function validate(d: Draft, s: Data): string | undefined {
  if (!Number.isInteger(d.amt) || d.amt <= 0) return 'Amount must be more than 0';
  if (!isValidYmd(d.d)) return 'Invalid date';
  if (!s.accounts.some((a) => a.id === d.a)) return 'Pick an account';
  if (d.t === 'x') {
    if (!d.to || !s.accounts.some((a) => a.id === d.to)) return 'Pick where the money goes';
    if (d.to === d.a) return 'From and To must differ';
  } else {
    const c = s.cats.find((c) => c.id === d.c);
    if (!c) return 'Pick a category';
    if (c.kind !== d.t) return 'Category type mismatch';
    if (d.s && !c.subs.some((x) => x.id === d.s)) return 'Unknown subcategory';
  }
}

export const clean = (d: Draft): Draft => {
  const out: Draft = { t: d.t, amt: d.amt, d: d.d, a: d.a };
  if (d.tm) out.tm = d.tm;
  if (d.t === 'x') out.to = d.to;
  else {
    out.c = d.c;
    if (d.s) out.s = d.s;
  }
  if (d.n?.trim()) out.n = d.n.trim();
  if (d.auto) out.auto = 1;
  return out;
};

export const sortTxs = (txs: Tx[]) => txs.sort((x, y) => (x.d === y.d ? (y.tm ?? '').localeCompare(x.tm ?? '') : y.d.localeCompare(x.d)));

export function balances(s: Pick<Data, 'accounts' | 'txs'>, upTo?: string) {
  const b: Record<string, number> = {};
  for (const a of s.accounts) b[a.id] = a.open;
  for (const t of s.txs) {
    if (upTo && t.d > upTo) continue;
    if (t.t === 'e') b[t.a] -= t.amt;
    else if (t.t === 'i') b[t.a] += t.amt;
    else {
      b[t.a] -= t.amt;
      if (t.to) b[t.to] += t.amt;
    }
  }
  return b;
}

export function accrue(s: Data, now = today()): Data | null {
  const lastDone = addMonths(monthOf(now), -1);
  let txs = s.txs;
  let changed = false;
  const accounts = s.accounts.map((a) => {
    if (a.type !== 'loan' || !a.rate || !a.accrued || a.accrued >= lastDone) return a;
    let m = a.accrued;
    while (m < lastDone) {
      m = addMonths(m, 1);
      const end = lastDayOf(m);
      const owed = -balances({ accounts: [a], txs: txs.filter((t) => t.a === a.id || t.to === a.id) }, end)[a.id];
      const amt = Math.round((owed * a.rate) / 1200);
      if (amt > 0) txs = [...txs, { id: uid(), t: 'e', amt, d: end, a: a.id, c: LOAN_CAT, s: INTEREST_SUB, n: 'Monthly interest (auto)', auto: 1 }];
    }
    changed = true;
    return { ...a, accrued: lastDone };
  });
  return changed ? { ...s, accounts, txs: sortTxs([...txs]) } : null;
}

export interface Flow {
  kind: 'e' | 'i';
  c: string;
  s?: string;
  amt: number;
  d: string;
}
export function flows(s: Pick<Data, 'accounts' | 'txs'>, from: string, to: string): Flow[] {
  const type: Record<string, string> = {};
  for (const a of s.accounts) type[a.id] = a.type;
  const out: Flow[] = [];
  for (const t of s.txs) {
    if (t.d < from || t.d > to) continue;
    if (t.t === 'x') {
      if (t.to && type[t.to] === 'loan' && type[t.a] !== 'loan') out.push({ kind: 'e', c: LOAN_CAT, s: `${LOAN_CAT}-0`, amt: t.amt, d: t.d });
    } else if (type[t.a] !== 'loan' && t.c !== ADJ_E && t.c !== ADJ_I) out.push({ kind: t.t, c: t.c!, s: t.s, amt: t.amt, d: t.d });
  }
  return out;
}

export type Result = { data: Data; error?: string };

export function addTxs(s: Data, drafts: Draft[]): Result {
  const errors = drafts.map((d, i) => {
    const e = validate(d, s);
    return e && (drafts.length > 1 ? `#${i + 1}: ${e}` : e);
  });
  const error = errors.filter(Boolean).join('\n');
  if (error) return { data: s, error };
  const added = drafts.map((d) => ({ id: uid(), ...clean(d) }));
  const last = drafts.filter((d) => d.c !== ADJ_E && d.c !== ADJ_I).pop();
  return { data: { ...s, txs: sortTxs([...s.txs, ...added]), lastAcc: last?.a ?? s.lastAcc } };
}

export function updateTx(s: Data, id: string, d: Draft): Result {
  const error = validate(d, s);
  if (error) return { data: s, error };
  return { data: { ...s, txs: sortTxs(s.txs.map((t) => (t.id === id ? { id, ...clean(d) } : t))) } };
}

export const deleteTx = (s: Data, id: string): Data => ({ ...s, txs: s.txs.filter((t) => t.id !== id) });

export function saveAccount(s: Data, a: Account, now = today()): Data {
  if (a.type === 'loan' && !a.accrued) a = { ...a, accrued: addMonths(monthOf(now), -1) };
  const exists = s.accounts.some((x) => x.id === a.id);
  return { ...s, accounts: exists ? s.accounts.map((x) => (x.id === a.id ? a : x)) : [...s.accounts, a] };
}

export function deleteAccount(s: Data, id: string): Result {
  if (s.txs.some((t) => t.a === id || t.to === id)) return { data: s, error: 'This account has transactions. Hide it instead.' };
  return { data: { ...s, accounts: s.accounts.filter((a) => a.id !== id), lastAcc: s.lastAcc === id ? undefined : s.lastAcc } };
}

export function saveCategory(s: Data, c: Category): Data {
  const exists = s.cats.some((x) => x.id === c.id);
  return { ...s, cats: exists ? s.cats.map((x) => (x.id === c.id ? c : x)) : [...s.cats, c] };
}

export function deleteCategory(s: Data, id: string): Result {
  if ([ADJ_E, ADJ_I, LOAN_CAT].includes(id)) return { data: s, error: 'This category is used by the app. Hide it instead.' };
  if (s.txs.some((t) => t.c === id)) return { data: s, error: 'This category has transactions. Hide it instead.' };
  return { data: { ...s, cats: s.cats.filter((c) => c.id !== id) } };
}
