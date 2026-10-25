// Run: npx tsx src/lib/ledger.test.ts
import assert from 'node:assert/strict';
import * as L from './ledger';
import { ADJ_E, INTEREST_SUB, LOAN_CAT, seed } from './seed';
import type { Data } from './types';

const ok = (r: L.Result) => {
  assert.equal(r.error, undefined, r.error);
  return r.data;
};

let s: Data = seed();
s = L.saveAccount(s, { id: 'bank', name: 'Bank', type: 'bank', open: 50000_00 });
s = L.saveAccount(s, { id: 'cash', name: 'Cash', type: 'cash', open: 1000_00 });
s = L.saveAccount(s, { id: 'card', name: 'Card', type: 'card', open: 0 });
s = L.saveAccount(s, { id: 'loan', name: 'Loan', type: 'loan', open: -300000_00, rate: 12, emi: 12500_00 }, '2026-10-26');
assert.equal(s.accounts.find((a) => a.id === 'loan')!.accrued, '2026-09');

// validation
const exp = (amt: number, extra: Partial<L.Draft> = {}): L.Draft => ({ t: 'e', amt, d: '2026-10-10', a: 'bank', c: 'dairy', s: 'dairy-0', ...extra });
assert.equal(L.addTxs(s, [exp(0)]).error, 'Amount must be more than 0');
assert.equal(L.addTxs(s, [exp(-5)]).error, 'Amount must be more than 0');
assert.equal(L.addTxs(s, [exp(10.5)]).error, 'Amount must be more than 0');
assert.equal(L.addTxs(s, [exp(100, { d: '2026-02-30' })]).error, 'Invalid date');
assert.equal(L.addTxs(s, [exp(100, { a: 'nope' })]).error, 'Pick an account');
assert.equal(L.addTxs(s, [exp(100, { c: undefined })]).error, 'Pick a category');
assert.equal(L.addTxs(s, [exp(100, { c: 'sal' })]).error, 'Category type mismatch');
assert.equal(L.addTxs(s, [exp(100, { s: 'meat-0' })]).error, 'Unknown subcategory');
assert.equal(L.addTxs(s, [{ t: 'x', amt: 100, d: '2026-10-10', a: 'bank' }]).error, 'Pick where the money goes');
assert.equal(L.addTxs(s, [{ t: 'x', amt: 100, d: '2026-10-10', a: 'bank', to: 'bank' }]).error, 'From and To must differ');
// a bad row blocks the whole batch
const batch = L.addTxs(s, [exp(100), exp(0)]);
assert.equal(batch.error, '#2: Amount must be more than 0');
assert.equal(batch.data.txs.length, 0);

// add: milk 47 + petrol 205 + salary + transfer to cash + card spend + EMI
s = ok(
  L.addTxs(s, [
    exp(47_00, { tm: '08:00', n: '  morning  ' }),
    exp(205_00, { c: 'veh', s: 'veh-0', tm: '09:00' }),
    { t: 'i', amt: 45000_00, d: '2026-10-01', a: 'bank', c: 'sal' },
    { t: 'x', amt: 2000_00, d: '2026-10-05', a: 'bank', to: 'cash' },
    { t: 'e', amt: 1500_00, d: '2026-10-06', a: 'card', c: 'shop', s: 'shop-0' },
    { t: 'x', amt: 12500_00, d: '2026-10-05', a: 'bank', to: 'loan' },
  ]),
);
assert.equal(s.txs.length, 6);
assert.equal(s.txs[0].d, '2026-10-10'); // newest first
assert.equal(s.txs[0].tm, '09:00'); // later time first within a day
assert.equal(s.txs.find((t) => t.amt === 47_00)!.n, 'morning');
assert.equal(s.lastAcc, 'bank');
const transfer = s.txs.find((t) => t.to === 'cash')!;
assert.equal(transfer.c, undefined);

let b = L.balances(s);
assert.equal(b.bank, 50000_00 - 47_00 - 205_00 + 45000_00 - 2000_00 - 12500_00);
assert.equal(b.cash, 1000_00 + 2000_00);
assert.equal(b.card, -1500_00);
assert.equal(b.loan, -300000_00 + 12500_00);
assert.equal(L.balances(s, '2026-10-04').bank, 50000_00 + 45000_00); // as of date

// stats flows: transfers excluded, EMI counted as Loan spending, card spend counted
const f = L.flows(s, '2026-10-01', '2026-10-31');
const spent = f.filter((x) => x.kind === 'e').reduce((a, x) => a + x.amt, 0);
assert.equal(spent, 47_00 + 205_00 + 1500_00 + 12500_00);
assert.equal(
  f.filter((x) => x.kind === 'i').reduce((a, x) => a + x.amt, 0),
  45000_00,
);
assert.ok(f.some((x) => x.c === LOAN_CAT && x.amt === 12500_00));
assert.equal(L.flows(s, '2026-11-01', '2026-11-30').length, 0);

// edit
const milk = s.txs.find((t) => t.amt === 47_00)!;
assert.equal(L.updateTx(s, milk.id, { ...milk, amt: 0 }).error, 'Amount must be more than 0');
s = ok(L.updateTx(s, milk.id, { t: 'e', amt: 54_00, d: '2026-10-09', a: 'cash', c: 'dairy', s: 'dairy-2' }));
const edited = s.txs.find((t) => t.id === milk.id)!;
assert.deepEqual([edited.amt, edited.d, edited.a, edited.s, edited.n], [54_00, '2026-10-09', 'cash', 'dairy-2', undefined]);
assert.equal(s.txs.length, 6);

// delete transaction
s = L.deleteTx(s, milk.id);
assert.equal(s.txs.length, 5);
assert.equal(L.balances(s).cash, 3000_00);

// loan interest: Oct and Nov posted when opened in Dec, once only
const dec = L.accrue(s, '2026-12-03')!;
const interest = dec.txs.filter((t) => t.s === INTEREST_SUB);
assert.equal(interest.length, 2);
const oct = interest.find((t) => t.d === '2026-10-31')!.amt;
assert.equal(oct, Math.round(((300000_00 - 12500_00) * 12) / 1200));
assert.equal(interest.find((t) => t.d === '2026-11-30')!.amt, Math.round(((300000_00 - 12500_00 + oct) * 12) / 1200));
assert.equal(dec.accounts.find((a) => a.id === 'loan')!.accrued, '2026-11');
assert.equal(L.accrue(dec, '2026-12-20'), null); // idempotent
assert.equal(L.accrue(s, '2026-10-26'), null); // current month not posted early
// interest doesn't count as cash spending
assert.equal(L.flows(dec, '2026-10-01', '2026-11-30').filter((x) => x.kind === 'e').length, 3); // petrol, card, EMI
// loan without rate never accrues
const noRate = L.saveAccount(s, { ...s.accounts.find((a) => a.id === 'loan')!, rate: 0 });
assert.equal(L.accrue(noRate, '2027-03-01'), null);

// adjustments don't change last-used account and are excluded from stats
const adj = ok(L.addTxs(s, [{ t: 'e', amt: 10_00, d: '2026-10-11', a: 'card', c: ADJ_E }]));
assert.equal(adj.lastAcc, s.lastAcc);
assert.equal(L.flows(adj, '2026-10-11', '2026-10-11').length, 0);

// delete guards
assert.ok(L.deleteAccount(s, 'bank').error);
s = L.saveAccount(s, { id: 'tmp', name: 'Tmp', type: 'wallet', open: 0 });
s = { ...s, lastAcc: 'tmp' };
s = ok(L.deleteAccount(s, 'tmp'));
assert.ok(!s.accounts.some((a) => a.id === 'tmp'));
assert.equal(s.lastAcc, undefined);
assert.ok(L.deleteCategory(s, 'veh').error); // has transactions
assert.ok(L.deleteCategory(s, LOAN_CAT).error); // system
assert.ok(L.deleteCategory(s, ADJ_E).error);
s = ok(L.deleteCategory(s, 'edu'));
assert.ok(!s.cats.some((c) => c.id === 'edu'));

// category save: new + rename + hide
s = L.saveCategory(s, { id: 'pets', name: 'Pets', icon: '🐶', kind: 'e', subs: [{ id: 'p1', name: 'Food' }], budget: 500_00 });
s = L.saveCategory(s, { ...s.cats.find((c) => c.id === 'pets')!, name: 'Pet Care', hidden: true });
const pets = s.cats.filter((c) => c.id === 'pets');
assert.equal(pets.length, 1);
assert.equal(pets[0].name, 'Pet Care');
assert.equal(pets[0].hidden, true);

// backup parse
assert.deepEqual(L.parse(JSON.stringify(s)).txs.length, s.txs.length);
assert.throws(() => L.parse('{"v":2}'));
assert.throws(() => L.parse('not json'));

console.log('ledger ok');
