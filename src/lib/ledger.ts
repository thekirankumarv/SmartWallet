import { addMonths, fmt, isValidYmd, lastDayOf, monthOf, today, uid } from './money';
import { ADJ_E, ADJ_I, INTEREST_SUB, LOAN_CAT } from './seed';
import type { Account, AccountType, Category, Data, Tx } from './types';

export type Draft = Omit<Tx, 'id'>;

// Cards and loans carry what you owe (negative balance). Everything else, FDs included, is what you own.
export const isDebt = (t: AccountType) => t === 'loan' || t === 'card';
// Loans and FDs aren't paid from directly; money only moves in or out of them by transfer.
export const canSpend = (a: Pick<Account, 'type'>) => a.type !== 'loan' && a.type !== 'fd';

export function parse(raw: string): Data {
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    d = null;
  }
  if (d?.v !== 1 || !Array.isArray(d.txs) || !Array.isArray(d.accounts) || !Array.isArray(d.cats))
    throw new Error('This isn’t a SmartWallet backup. Pick the .json file saved by Backup.');
  return d;
}

export function validate(d: Draft, s: Data, was?: number): string | undefined {
  if (!Number.isInteger(d.amt) || d.amt <= 0) return 'Amount must be more than 0';
  if (!isValidYmd(d.d)) return 'Invalid date';
  if (!s.accounts.some((a) => a.id === d.a)) return 'Pick an account';
  if (d.t === 'x') {
    const to = s.accounts.find((a) => a.id === d.to);
    if (!to) return 'Pick where the money goes';
    if (d.to === d.a) return 'From and To must differ';
    if (d.s && (to.type !== 'loan' || !LOAN_SUBS.includes(d.s))) return 'Only loan payments can be marked EMI or Interest';
  } else {
    const c = s.cats.find((c) => c.id === d.c);
    if (!c) return 'Pick a category';
    if (c.kind !== d.t) return 'Category type mismatch';
    if (d.s && !c.subs.some((x) => x.id === d.s)) return 'Unknown subcategory';
    // A loan payment must reach the loan: it's saved as a transfer to it (see loanPayment), never as a plain expense.
    if (c.id === LOAN_CAT && d.t === 'e' && s.accounts.find((a) => a.id === d.a)?.type !== 'loan') return 'Pick which loan this pays';
  }
  return overLimit(d, s, was);
}

// Blocks a card spend (expense or transfer out) that would push outstanding past the limit.
// `was` is the outstanding before this entry, so editing an entry on a card that is already over isn't blocked unless it makes it worse.
function overLimit(d: Draft, s: Data, was?: number): string | undefined {
  const card = s.accounts.find((a) => a.id === d.a);
  if (card?.type !== 'card' || !card.limit || d.t === 'i' || d.c === ADJ_E) return;
  const before = -balances({ accounts: [card], txs: s.txs })[card.id]; // negative when the card is in credit
  const after = before + d.amt;
  if (after > card.limit && after > (was ?? before)) return `Only ${fmt(Math.max(0, card.limit - before))} credit left on ${card.name}`;
}

// Every tag in use, most used first.
export function allTags(txs: Pick<Tx, 'g'>[]) {
  const n = new Map<string, number>();
  for (const t of txs) for (const g of t.g ?? []) n.set(g, (n.get(g) ?? 0) + 1);
  return [...n].sort((x, y) => y[1] - x[1]).map(([g]) => g);
}

// Trim, drop '#' and commas, dedupe case-insensitively, reuse the spelling of an existing tag.
export function tidyTags(raw: string[], known: string[] = []): string[] {
  const out: string[] = [];
  for (const r of raw.flatMap((x) => x.split(/[,;]/))) {
    const name = r.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (out.some((x) => x.toLowerCase() === key)) continue;
    out.push(known.find((x) => x.toLowerCase() === key) ?? name);
  }
  return out;
}

export const EMI_SUB = `${LOAN_CAT}-0`;
const LOAN_SUBS = [EMI_SUB, INTEREST_SUB];

// Paying a loan from a bank, whichever screen it's entered on: a transfer to the loan, tagged EMI or Interest for reports.
export const loanPayment = (d: Draft, loan: string): Draft => ({ ...d, t: 'x', to: loan, c: undefined, s: d.s && LOAN_SUBS.includes(d.s) ? d.s : EMI_SUB });

export const clean = (d: Draft, known: string[] = []): Draft => {
  const out: Draft = { t: d.t, amt: d.amt, d: d.d, a: d.a };
  if (d.tm) out.tm = d.tm;
  if (d.t === 'x') {
    out.to = d.to;
    if (d.s) out.s = d.s;
  } else {
    out.c = d.c;
    if (d.s) out.s = d.s;
  }
  if (d.n?.trim()) out.n = d.n.trim();
  const g = tidyTags(d.g ?? [], known);
  if (g.length) out.g = g;
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

// Net worth: every account balance counted once. A card or loan in credit (overpaid) is money owed to you, so it's an asset.
// Credit limits are never part of it.
export function summary(s: Pick<Data, 'accounts' | 'txs'>) {
  const b = balances(s);
  let assets = 0;
  let liabilities = 0;
  for (const a of s.accounts) {
    const v = b[a.id];
    if (isDebt(a.type) && v < 0) liabilities -= v;
    else assets += v;
  }
  return { assets, liabilities, net: assets - liabilities };
}

export function cardStatus(card: Account, balance: number) {
  const outstanding = Math.max(0, -balance);
  const limit = card.limit ?? 0;
  return { limit, outstanding, credit: Math.max(0, balance), available: Math.max(0, limit - outstanding), util: limit ? outstanding / limit : 0 };
}

export interface Flow {
  kind: 'e' | 'i';
  c: string;
  s?: string;
  amt: number;
  d: string;
  g?: string[];
}
export function flows(s: Pick<Data, 'accounts' | 'txs'>, from: string, to: string): Flow[] {
  const type: Record<string, string> = {};
  for (const a of s.accounts) type[a.id] = a.type;
  const out: Flow[] = [];
  for (const t of s.txs) {
    if (t.d < from || t.d > to) continue;
    if (t.t === 'x') {
      if (t.to && type[t.to] === 'loan' && type[t.a] !== 'loan') out.push({ kind: 'e', c: LOAN_CAT, s: t.s ?? EMI_SUB, amt: t.amt, d: t.d, g: t.g });
    } else if (type[t.a] !== 'loan' && t.c !== ADJ_E && t.c !== ADJ_I) out.push({ kind: t.t, c: t.c!, s: t.s, amt: t.amt, d: t.d, g: t.g });
  }
  return out;
}

export type Result = { data: Data; error?: string };

export function addTxs(s: Data, drafts: Draft[]): Result {
  const known = [...allTags(s.txs), ...allTags(drafts)]; // existing spelling wins, then first in this batch
  const added = drafts.map((d) => ({ id: uid(), ...clean(d, known) }));
  // Checked one after another so several entries on one card can't jointly pass its limit.
  const errors = drafts.map((d, i) => {
    const e = validate(d, { ...s, txs: [...s.txs, ...added.slice(0, i)] });
    return e && (drafts.length > 1 ? `#${i + 1}: ${e}` : e);
  });
  const error = errors.filter(Boolean).join('\n');
  if (error) return { data: s, error };
  const last = drafts.filter((d) => d.c !== ADJ_E && d.c !== ADJ_I).pop();
  return { data: { ...s, txs: sortTxs([...s.txs, ...added]), lastAcc: last?.a ?? s.lastAcc } };
}

export function updateTx(s: Data, id: string, d: Draft): Result {
  const card = s.accounts.find((a) => a.id === d.a);
  const was = card && -balances({ accounts: [card], txs: s.txs })[card.id];
  const error = validate(d, { ...s, txs: s.txs.filter((t) => t.id !== id) }, was);
  if (error) return { data: s, error };
  return { data: { ...s, txs: sortTxs(s.txs.map((t) => (t.id === id ? { id, ...clean(d, allTags(s.txs)) } : t))) } };
}

export const deleteTx = (s: Data, id: string): Data => ({ ...s, txs: s.txs.filter((t) => t.id !== id) });

export function saveAccount(s: Data, a: Account, now = today()): Data {
  if (a.type === 'loan' && !a.accrued) a = { ...a, accrued: addMonths(monthOf(now), -1) };
  const exists = s.accounts.some((x) => x.id === a.id);
  return { ...s, accounts: exists ? s.accounts.map((x) => (x.id === a.id ? a : x)) : [...s.accounts, a] };
}

export function deleteAccount(s: Data, id: string): Result {
  if (s.txs.some((t) => t.a === id || t.to === id)) return { data: s, error: 'This account has transactions. Hide it instead.' };
  const accounts = s.accounts.filter((a) => a.id !== id).map((a) => (a.fd === id ? { ...a, fd: undefined } : a));
  return { data: { ...s, accounts, lastAcc: s.lastAcc === id ? undefined : s.lastAcc } };
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

const withTags = (s: Data, fn: (g: string[]) => string[]): Data => ({
  ...s,
  txs: s.txs.map((t) => {
    if (!t.g) return t;
    const g = fn(t.g);
    const { g: _, ...rest } = t;
    return g.length ? { ...t, g } : rest;
  }),
});

// Renaming onto an existing tag merges the two.
export function renameTag(s: Data, from: string, to: string): Result {
  const [name] = tidyTags([to], allTags(s.txs).filter((x) => x !== from));
  if (!name) return { data: s, error: 'Enter a tag name' };
  return { data: withTags(s, (g) => tidyTags(g.map((x) => (x === from ? name : x)))) };
}

export const deleteTag = (s: Data, tag: string): Data => withTags(s, (g) => g.filter((x) => x !== tag));
