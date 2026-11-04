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

// tags
assert.deepEqual(L.clean(exp(100, { g: ['milk', 'Amazon Fresh'] })).g, ['milk', 'Amazon Fresh']);
assert.equal('g' in L.clean(exp(100, { g: [' ', '#'] })), false);
assert.deepEqual(L.tidyTags(['#Milk, curd', 'milk', ' swiggy   instamart '], ['milk']), ['milk', 'curd', 'swiggy instamart']);
let tg = ok(L.addTxs(s, [exp(100, { g: ['milk', 'instamart'] }), exp(200, { g: ['Instamart', 'veg'] }), exp(300, { g: ['veg'] })]));
assert.deepEqual(tg.txs.find((t) => t.amt === 200)!.g, ['instamart', 'veg']); // reuses existing spelling
assert.deepEqual(L.allTags(tg.txs), ['instamart', 'veg', 'milk']);
assert.deepEqual(L.flows(tg, '2026-10-10', '2026-10-10').find((f) => f.amt === 100)!.g, ['milk', 'instamart']);
tg = ok(L.renameTag(tg, 'milk', 'Instamart')); // merge into existing, no dup in one tx
assert.deepEqual(tg.txs.find((t) => t.amt === 100)!.g, ['instamart']);
assert.deepEqual(L.allTags(tg.txs), ['instamart', 'veg']);
assert.equal(L.renameTag(tg, 'veg', ' # ').error, 'Enter a tag name');
tg = L.deleteTag(tg, 'veg');
assert.equal(tg.txs.find((t) => t.amt === 300)!.g, undefined);
assert.deepEqual(tg.txs.find((t) => t.amt === 200)!.g, ['instamart']);

// tag list: created in Settings, kept in the user's order, old tags on transactions still offered
{
  let w: Data = { ...seed(), txs: [{ id: 'o', t: 'e', amt: 100, d: '2026-10-10', a: 'x', c: 'dairy', g: ['old'] }] };
  assert.deepEqual(L.tagList(w), ['old']);
  w = ok(L.addTag(w, '#Milk'));
  w = ok(L.addTag(w, 'dmart'));
  assert.deepEqual(w.tags, ['old', 'Milk', 'dmart']);
  assert.equal(L.addTag(w, 'milk').error, '#milk already exists');
  assert.equal(L.addTag(w, ' # ').error, 'Enter a tag name');
  w = ok(L.renameTag(w, 'Milk', 'milk'));
  assert.deepEqual(w.tags, ['old', 'milk', 'dmart']);
  w = L.deleteTag(w, 'dmart');
  assert.deepEqual(w.tags, ['old', 'milk']);
  w = L.deleteTag(w, 'old');
  assert.deepEqual([w.tags, w.txs[0].g], [['milk'], undefined]);
}

// credit cards: the full workflow
{
  let w: Data = seed();
  const bal = (id: string) => L.balances(w)[id];
  const card = (id: string) => L.cardStatus(w.accounts.find((a) => a.id === id)!, bal(id));
  const spent = () => L.flows(w, '2026-01-01', '2026-12-31').filter((f) => f.kind === 'e').reduce((a, f) => a + f.amt, 0);
  w = L.saveAccount(w, { id: 'fed', name: 'Federal Bank', type: 'bank', open: 50000_00 });
  // 1. regular card, 2. FD-backed card: the FD is its own asset account, the card only links to it
  w = L.saveAccount(w, { id: 'hdfc', name: 'HDFC Millennia', bank: 'HDFC', type: 'card', open: 0, limit: 100000_00, bill: 20, due: 8 });
  w = L.saveAccount(w, { id: 'idfcfd', name: 'IDFC FIRST FD', type: 'fd', open: 5000_00, ref: 'FD123' });
  w = L.saveAccount(w, { id: 'idfc', name: 'IDFC FIRST WOW', bank: 'IDFC FIRST', type: 'card', open: 0, limit: 5000_00, fd: 'idfcfd' });
  assert.deepEqual(L.summary(w), { assets: 55000_00, liabilities: 0, net: 55000_00 }); // 9. FD counted once, limits never

  // 3–4. laptop on the regular card: expense recorded, bank untouched
  w = ok(L.addTxs(w, [{ t: 'e', amt: 60000_00, d: '2026-10-10', a: 'hdfc', c: 'shop', s: 'shop-2', n: 'Laptop' }]));
  assert.equal(card('hdfc').outstanding, 60000_00);
  assert.equal(card('hdfc').available, 40000_00);
  assert.equal(card('hdfc').util, 0.6);
  assert.equal(bal('fed'), 50000_00);
  assert.equal(spent(), 60000_00);

  // 5–8. partial repayment from Federal Bank is a transfer: bank down, outstanding down, no new expense
  w = ok(L.addTxs(w, [{ t: 'x', amt: 20000_00, d: '2026-10-15', a: 'fed', to: 'hdfc', n: 'Card bill' }]));
  assert.equal(bal('fed'), 30000_00);
  assert.equal(card('hdfc').outstanding, 40000_00);
  assert.equal(card('hdfc').available, 60000_00);
  assert.equal(spent(), 60000_00);
  const pay = w.txs.find((t) => t.t === 'x')!;
  assert.ok([pay.a, pay.to].includes('fed') && [pay.a, pay.to].includes('hdfc')); // one record in both histories

  // 10–11. outstanding is a liability, net worth = assets − liabilities
  assert.deepEqual(L.summary(w), { assets: 35000_00, liabilities: 40000_00, net: -5000_00 });

  // limit: can't spend past available credit, adjustments exempt
  assert.equal(L.addTxs(w, [{ t: 'e', amt: 60000_01, d: '2026-10-16', a: 'hdfc', c: 'shop' }]).error, 'Only ₹60,000 credit left on HDFC Millennia');
  assert.equal(L.addTxs(w, [{ t: 'x', amt: 60000_01, d: '2026-10-16', a: 'hdfc', to: 'fed' }]).error?.startsWith('Only'), true);
  assert.match(L.addTxs(w, [{ t: 'e', amt: 40000_00, d: '2026-10-16', a: 'hdfc', c: 'shop' }, { t: 'e', amt: 30000_00, d: '2026-10-16', a: 'hdfc', c: 'shop' }]).error!, /^#2: Only/);
  assert.equal(L.addTxs(w, [{ t: 'e', amt: 60000_00, d: '2026-10-16', a: 'hdfc', c: 'shop' }]).error, undefined); // exactly to the limit
  assert.equal(L.addTxs(w, [{ t: 'e', amt: 90000_00, d: '2026-10-16', a: 'hdfc', c: ADJ_E }]).error, undefined);

  // 12. refund on the card lowers outstanding
  w = ok(L.addTxs(w, [{ t: 'i', amt: 5000_00, d: '2026-10-17', a: 'hdfc', c: 'ref', n: 'Laptop bag refund' }]));
  assert.equal(card('hdfc').outstanding, 35000_00);
  // edit the laptop up to the limit headroom, and past it
  const laptop = w.txs.find((t) => t.n === 'Laptop')!;
  const asDraft = ({ id: _, ...d }: typeof laptop) => d;
  assert.match(L.updateTx(w, laptop.id, { ...asDraft(laptop), amt: 125000_01 }).error!, /^Only/);
  w = ok(L.updateTx(w, laptop.id, { ...asDraft(laptop), amt: 65000_00 }));
  assert.equal(card('hdfc').outstanding, 40000_00);
  // already over the limit (e.g. limit lowered): editing a note still works, raising the amount doesn't
  w = L.saveAccount(w, { ...w.accounts.find((a) => a.id === 'hdfc')!, limit: 30000_00 });
  assert.equal(card('hdfc').available, 0);
  const lap2 = w.txs.find((t) => t.id === laptop.id)!;
  w = ok(L.updateTx(w, lap2.id, { ...asDraft(lap2), n: 'Laptop (work)' }));
  assert.match(L.updateTx(w, lap2.id, { ...asDraft(lap2), amt: 65000_01 }).error!, /^Only ₹55,000 /); // headroom for this entry, excluding itself
  w = L.saveAccount(w, { ...w.accounts.find((a) => a.id === 'hdfc')!, limit: 100000_00 });

  // full repayment, then overpay: card in credit counts as an asset
  w = ok(L.addTxs(w, [{ t: 'x', amt: 40000_00, d: '2026-10-20', a: 'fed', to: 'hdfc' }]));
  assert.equal(card('hdfc').outstanding, 0);
  assert.equal(card('hdfc').available, 100000_00);
  w = ok(L.addTxs(w, [{ t: 'x', amt: 1000_00, d: '2026-10-21', a: 'fed', to: 'hdfc' }]));
  assert.equal(card('hdfc').credit, 1000_00);
  assert.deepEqual(L.summary(w), { assets: -11000_00 + 5000_00 + 1000_00, liabilities: 0, net: -5000_00 });

  // deleting (reversing) the repayment restores both sides
  w = L.deleteTx(w, pay.id);
  assert.equal(card('hdfc').outstanding, 19000_00);
  assert.equal(bal('fed'), 50000_00 - 40000_00 - 1000_00);
  assert.equal(spent(), 65000_00);

  // FD-backed card spends within its own limit; deleting the FD unlinks the card
  assert.match(L.addTxs(w, [{ t: 'e', amt: 5000_01, d: '2026-10-22', a: 'idfc', c: 'shop' }]).error!, /^Only ₹5,000 /);
  w = ok(L.deleteAccount(w, 'idfcfd'));
  assert.equal(w.accounts.find((a) => a.id === 'idfc')!.fd, undefined);
  assert.ok(L.canSpend({ type: 'card' }) && !L.canSpend({ type: 'fd' }) && !L.canSpend({ type: 'loan' }));
}

// loan payments: same result from Pay EMI (transfer) and New Transaction (Loan category + loan picked)
{
  let w: Data = seed();
  w = L.saveAccount(w, { id: 'bank', name: 'Bank', type: 'bank', open: 100000_00 });
  w = L.saveAccount(w, { id: 'edu', name: 'Education Loan', type: 'loan', open: -200000_00, rate: 0, emi: 10000_00 }, '2026-10-26');
  const owed = () => -L.balances(w).edu;
  const loanFlows = () => L.flows(w, '2026-01-01', '2026-12-31').filter((f) => f.c === LOAN_CAT);
  const asExpense: L.Draft = { t: 'e', amt: 10000_00, d: '2026-11-01', a: 'bank', c: LOAN_CAT, s: L.EMI_SUB };
  // a plain Loan expense from a bank would never reach the loan, so it's refused
  assert.equal(L.addTxs(w, [asExpense]).error, 'Pick which loan this pays');
  // with the loan picked it becomes the same transfer Pay EMI makes
  const viaCategory = L.loanPayment(asExpense, 'edu');
  assert.deepEqual(L.clean(viaCategory), { t: 'x', amt: 10000_00, d: '2026-11-01', a: 'bank', to: 'edu', s: L.EMI_SUB });
  w = ok(L.addTxs(w, [viaCategory, { t: 'x', amt: 10000_00, d: '2026-11-02', a: 'bank', to: 'edu' }]));
  assert.equal(owed(), 180000_00);
  assert.equal(L.balances(w).bank, 80000_00);
  assert.deepEqual(loanFlows().map((f) => [f.s, f.amt]), [[L.EMI_SUB, 10000_00], [L.EMI_SUB, 10000_00]]); // counted once each, as EMI
  // interest paid from the bank: lowers the loan, reported as Loan → Interest
  w = ok(L.addTxs(w, [L.loanPayment({ ...asExpense, s: INTEREST_SUB, amt: 1500_00 }, 'edu')]));
  assert.equal(owed(), 178500_00);
  assert.equal(loanFlows().filter((f) => f.s === INTEREST_SUB)[0].amt, 1500_00);
  // edit and delete recalculate the loan
  const pay = w.txs.find((t) => t.s === L.EMI_SUB)!;
  const { id: _, ...d } = pay;
  w = ok(L.updateTx(w, pay.id, { ...d, amt: 12000_00 }));
  assert.equal(owed(), 176500_00);
  w = L.deleteTx(w, pay.id);
  assert.equal(owed(), 188500_00);
  // EMI/Interest mark only on payments into a loan; auto interest on the loan itself still editable
  assert.equal(L.addTxs(w, [{ t: 'x', amt: 100, d: '2026-11-03', a: 'edu', to: 'bank', s: L.EMI_SUB }]).error, 'Only loan payments can be marked EMI or Interest');
  assert.equal(L.addTxs(w, [{ t: 'e', amt: 100, d: '2026-11-03', a: 'edu', c: LOAN_CAT, s: INTEREST_SUB }]).error, undefined);
  assert.equal(L.loanPayment({ ...asExpense, s: 'dairy-0' }, 'edu').s, L.EMI_SUB);
}

console.log('ledger ok');
