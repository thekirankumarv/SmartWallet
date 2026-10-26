// Run: npx tsx src/lib/money.test.ts
import assert from 'node:assert/strict';
import { addDays, addMonths, calc, fmt, fmtShort, isValidYmd, lastDayOf, monthsLeft, ymd } from './money';

assert.equal(calc('47+205'), 252);
assert.equal(calc('2+3×4'), 14);
assert.equal(calc('100−20÷4'), 95);
assert.equal(calc('12.5*2'), 25);
assert.equal(calc('50+'), 50);
assert.equal(calc('-5+10'), 5);
assert.ok(isNaN(calc('5//2')));
assert.ok(isNaN(calc('abc')));
assert.ok(isNaN(calc('5÷0')));

assert.equal(fmt(12345678), '₹1,23,456.78');
assert.equal(fmt(100000), '₹1,000');
assert.equal(fmt(-2002400), '-₹20,024');
assert.equal(fmt(4700, { sign: true }), '+₹47');
assert.equal(fmt(100087), '₹1,000.87');
assert.equal(fmtShort(4750), '₹47.50');
assert.equal(fmtShort(150000), '₹1.5k');

assert.equal(addDays('2026-03-01', -1), '2026-02-28');
assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(addMonths('2026-12', 1), '2027-01');
assert.equal(addMonths('2026-01', -1), '2025-12');
assert.equal(lastDayOf('2028-02'), '2028-02-29');
assert.ok(isValidYmd('2026-10-25') && !isValidYmd('2026-02-30'));
// local date, not UTC: 00:30 on the 25th is still the 25th
assert.equal(ymd(new Date(2026, 9, 25, 0, 30)), '2026-10-25');

assert.equal(monthsLeft(240000_00, 20024_00, 0), 12);
assert.equal(monthsLeft(100, 0, 10), Infinity);
assert.ok(monthsLeft(240000_00, 20024_00, 9) === 13);

console.log('money ok');
