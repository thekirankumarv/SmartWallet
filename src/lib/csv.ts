import { isValidYmd, toPaise, uid } from './money';
import type { Account, AccountType, Category, Data, Tx, TxType } from './types';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const esc = (v: string | number | undefined) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const TYPE_OUT: Record<TxType, string> = { e: 'Expense', i: 'Income', x: 'Transfer' };

export function toCsv(s: Data): string {
  const acc = Object.fromEntries(s.accounts.map((a) => [a.id, a.name]));
  const cat = Object.fromEntries(s.cats.map((c) => [c.id, c]));
  const lines = ['Date,Time,Type,Account,To Account,Category,Subcategory,Note,Amount'];
  for (const t of s.txs) {
    const c = t.c ? cat[t.c] : undefined;
    lines.push(
      [t.d, t.tm, TYPE_OUT[t.t], acc[t.a], t.to ? acc[t.to] : '', c?.name, c?.subs.find((x) => x.id === t.s)?.name, t.n, (t.amt / 100).toFixed(2)]
        .map(esc)
        .join(','),
    );
  }
  return lines.join('\n');
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const guessType = (name: string): AccountType => {
  const n = norm(name);
  if (n.includes('loan')) return 'loan';
  if (n.includes('cash')) return 'cash';
  if (n.includes('card')) return 'card';
  if (n.includes('wallet') || n.includes('pay')) return 'wallet';
  return 'bank';
};

function parseDate(raw: string): { d: string; tm?: string } | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return isValidYmd(d) ? { d, tm: m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : undefined } : null;
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/); // dd/mm/yyyy
  if (m) {
    const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValidYmd(d) ? { d, tm: m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : undefined } : null;
  }
  return null;
}

export interface ImportResult {
  data: Data;
  added: number;
  dupes: number;
  bad: string[];
}

export function importCsv(text: string, cur: Data): ImportResult {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const head = rows.shift()?.map(norm) ?? [];
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const C = {
    date: col('date'),
    time: col('time'),
    type: col('type', 'incomeexpense'),
    acc: col('account'),
    to: col('toaccount'),
    cat: col('category'),
    sub: col('subcategory'),
    note: col('note'),
    desc: col('description'),
    amt: col('amount', 'inr'),
  };
  if (C.date < 0 || C.acc < 0 || C.amt < 0 || C.type < 0) throw new Error('CSV needs Date, Account, Amount and Type (or Income/Expense) columns');

  const accounts: Account[] = cur.accounts.map((a) => ({ ...a }));
  const cats: Category[] = cur.cats.map((c) => ({ ...c, subs: [...c.subs] }));
  const seen = new Set(cur.txs.map((t) => `${t.t}|${t.d}|${t.tm ?? ''}|${t.amt}|${t.a}|${t.to ?? t.c}`));
  const txs: Tx[] = [...cur.txs];
  const bad: string[] = [];
  let added = 0;
  let dupes = 0;

  const account = (name: string) => {
    const n = norm(name);
    const hit = accounts.find((a) => norm(a.name) === n);
    if (hit) return hit.id;
    const a: Account = { id: uid(), name: name.trim(), type: guessType(name), open: 0 };
    accounts.push(a);
    return a.id;
  };
  const clean = (name: string) =>
    name
      .replace(/[^\p{L}\p{N}\s()/&.,'-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  const resolve = (catName: string, subName: string, kind: 'e' | 'i'): { c: string; s?: string } => {
    const nc = norm(catName);
    let cat = cats.find((c) => c.kind === kind && norm(c.name) === nc);
    if (!cat) {
      cat = { id: uid(), name: clean(catName) || 'Other', icon: '📁', kind, subs: [] };
      cats.push(cat);
    }
    const label = subName === '-' ? '' : clean(subName);
    if (!label) return { c: cat.id };
    let sub = cat.subs.find((x) => norm(x.name) === norm(label));
    if (!sub) cat.subs.push((sub = { id: uid(), name: label }));
    return { c: cat.id, s: sub.id };
  };

  rows.forEach((r, i) => {
    const line = i + 2;
    const get = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
    const dt = parseDate(get(C.date));
    const amt = toPaise(Math.abs(parseFloat(get(C.amt).replace(/[₹,\s]/g, ''))));
    const ty = norm(get(C.type));
    const t: TxType | undefined = ty.startsWith('exp') ? 'e' : ty.startsWith('inc') ? 'i' : ty === 'transfer' || ty === 'transferout' ? 'x' : undefined;
    if (ty === 'transferin') return;
    if (!dt || !amt || !t || !get(C.acc)) return bad.push(`Line ${line}: missing date/amount/type/account`);
    const tx: Tx = { id: uid(), t, amt, d: dt.d, a: account(get(C.acc)) };
    const tm = get(C.time) || dt.tm;
    if (tm) tx.tm = tm.slice(0, 5);
    if (t === 'x') {
      const toName = get(C.to) || get(C.cat);
      if (!toName) return bad.push(`Line ${line}: transfer without target account`);
      tx.to = account(toName);
      if (tx.to === tx.a) return bad.push(`Line ${line}: transfer to same account`);
    } else {
      const r = resolve(get(C.cat) || 'Other', get(C.sub), t);
      tx.c = r.c;
      if (r.s) tx.s = r.s;
    }
    const note = [get(C.note), get(C.desc)].filter(Boolean).join(' · ');
    if (note) tx.n = note;
    const key = `${tx.t}|${tx.d}|${tx.tm ?? ''}|${tx.amt}|${tx.a}|${tx.to ?? tx.c}`;
    if (seen.has(key)) return dupes++;
    txs.push(tx);
    added++;
  });

  return { data: { ...cur, accounts, cats, txs }, added, dupes, bad };
}
