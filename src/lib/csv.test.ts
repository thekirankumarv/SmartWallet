// Run: npx tsx src/lib/csv.test.ts [file.csv]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importCsv, parseCsv, toCsv } from './csv';
import { seed } from './seed';

assert.deepEqual(parseCsv('a,"b,c","d ""q"""\r\n1,2,3\n'), [
  ['a', 'b,c', 'd "q"'],
  ['1', '2', '3'],
]);

const csv = `Date,Time,Type,Account,To Account,Category,Subcategory,Note,Amount
2026-10-24,22:16,Expense,HDFC,,Dairy,Milk,,70
2026-10-23,,Expense,Cash,,dairy,PANEER,fresh,98.50
2026-10-01,,Income,HDFC,,Salary,,,60000
2026-10-05,,Transfer,HDFC,Car Loan,,,,20024
05/10/2026,,Expense,Cash,,Weird Cat,Thing,,10
,,Expense,Cash,,Dairy,,,10`;

const r = importCsv(csv, seed());
assert.equal(r.added, 5);
assert.equal(r.bad.length, 1);
assert.deepEqual(
  r.data.accounts.map((a) => `${a.name}:${a.type}`),
  ['HDFC:bank', 'Cash:cash', 'Car Loan:loan'],
);
const milk = r.data.txs.find((t) => t.amt === 7000)!;
assert.equal(milk.c, 'dairy');
assert.equal(milk.s, 'dairy-0');
assert.equal(milk.tm, '22:16');
const paneer = r.data.txs.find((t) => t.amt === 9850)!;
assert.equal(paneer.s, 'dairy-2');
assert.equal(paneer.n, 'fresh');
const emi = r.data.txs.find((t) => t.t === 'x')!;
assert.equal(r.data.accounts.find((a) => a.id === emi.to)!.name, 'Car Loan');
assert.equal(r.data.txs.find((t) => t.amt === 1000)!.d, '2026-10-05');
assert.ok(r.data.cats.some((c) => c.name === 'Weird Cat' && c.subs[0].name === 'Thing'));

const again = importCsv(csv, r.data);
assert.equal(again.added, 0);
assert.equal(again.dupes, 5);

assert.equal(importCsv(toCsv(r.data), seed()).added, 5);

const file = process.argv[2];
if (file) {
  const big = importCsv(readFileSync(file, 'utf8'), seed());
  const seeded = new Set(seed().cats.flatMap((c) => [c.id, ...c.subs.map((s) => s.id)]));
  console.log(`${big.added} added, ${big.bad.length} bad`);
  console.log('new categories/subs:', big.data.cats.flatMap((c) => [c.id, ...c.subs.map((s) => s.id)]).filter((id) => !seeded.has(id)).length);
  console.log('accounts:', big.data.accounts.map((a) => `${a.name}(${a.type})`).join(', '));
}
console.log('csv ok');
