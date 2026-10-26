// Run: npx tsx src/lib/ai.test.ts
import assert from 'node:assert/strict';
import { buildRequest, explainError, keyProblem, parseReply, problems, type AiError } from './ai';
import * as L from './ledger';
import { seed } from './seed';
import type { Data } from './types';

// key format
const NEW = 'AQ.Ab8RN6Kx' + 'a'.repeat(40);
const OLD = 'AIza' + 'b'.repeat(35);
assert.equal(keyProblem(NEW), undefined);
assert.equal(keyProblem(`  ${NEW}\n`), undefined);
assert.equal(keyProblem(OLD), undefined);
assert.match(keyProblem('')!, /Paste/);
assert.match(keyProblem('AQ.Ab8 RN6Kx' + 'a'.repeat(30))!, /spaces/);
assert.match(keyProblem(`"${NEW}"`)!, /quotes/);
assert.match(keyProblem('sk-' + 'a'.repeat(40))!, /doesn’t look like a Gemini/);
assert.match(keyProblem('AQ.Ab8RN6')!, /cut off/);
assert.match(keyProblem('AQ.Ab8RN6Kx' + 'a'.repeat(30) + '€')!, /characters/);

// error mapping
const body = (status: string, message: string, details: unknown[] = []) => JSON.stringify({ error: { code: 0, status, message, details } });
const kind = (e: AiError) => [e.title, e.kind];
assert.deepEqual(kind(explainError(400, body('INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', [{ reason: 'API_KEY_INVALID' }]))), [
  'Invalid API key',
  'key',
]);
assert.match(explainError(400, body('INVALID_ARGUMENT', 'API key not valid.'), OLD).message, /older type/);
assert.equal(
  explainError(401, body('UNAUTHENTICATED', 'API key not valid. Please pass a valid API key.', [{ reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED' }])).title,
  'Invalid API key',
);
assert.deepEqual(kind(explainError(400, body('INVALID_ARGUMENT', 'API key expired. Please renew the API key.'))), ['API key expired', 'key']);
assert.deepEqual(kind(explainError(403, body('PERMISSION_DENIED', 'Your API key was reported as leaked. Please use another API key.'))), [
  'API key blocked',
  'key',
]);
assert.deepEqual(kind(explainError(403, body('PERMISSION_DENIED', 'Generative Language API has not been used in project'))), ['Key not allowed', 'key']);
assert.deepEqual(
  kind(explainError(429, body('RESOURCE_EXHAUSTED', 'Quota exceeded', [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }]))),
  ['Daily limit reached', 'quota'],
);
assert.deepEqual(
  kind(
    explainError(429, body('RESOURCE_EXHAUSTED', 'Quota exceeded', [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }])),
  ),
  ['Too many requests', 'quota'],
);
assert.deepEqual(kind(explainError(429, body('RESOURCE_EXHAUSTED', 'You exceeded your current quota'))), ['Usage limit reached', 'quota']);
assert.deepEqual(kind(explainError(400, body('FAILED_PRECONDITION', 'User location is not supported for the API use.'))), ['Not available', 'key']);
assert.equal(explainError(404, body('NOT_FOUND', 'models/x is not found')).title, 'Voice model unavailable');
assert.equal(explainError(503, body('UNAVAILABLE', 'The model is overloaded.')).title, 'Gemini is busy');
assert.equal(explainError(502, '<html>Bad gateway</html>').title, 'Gemini is busy');
assert.match(explainError(400, 'not json').message, /\(400\)/);

// data
let s: Data = seed();
s = L.saveAccount(s, { id: 'sav', name: 'Savings Account', type: 'bank', open: 50000_00 });
s = L.saveAccount(s, { id: 'cash', name: 'Cash', type: 'cash', open: 1000_00 });
s = L.saveAccount(s, { id: 'hl', name: 'Home Loan', type: 'loan', open: -100000_00 }, '2026-10-26');
s = { ...s, lastAcc: 'cash' };
const TODAY = '2026-11-01';

// request: lists ids, default account, today and weekday; schema enums real ids
const req = buildRequest(s, TODAY, { data: 'AAAA', mimeType: 'audio/mp4' });
const prompt = req.systemInstruction.parts[0].text;
assert.match(prompt, /Today is 2026-11-01 \(Sunday\)/);
assert.match(prompt, /- dairy: Dairy \[dairy-0: Milk/);
assert.match(prompt, /otherwise "cash"/);
assert.ok(!prompt.includes('Balance Adjustment'));
const item = req.generationConfig.responseSchema.properties.entries.items.properties;
assert.ok(item.category.enum!.includes('veh') && !item.category.enum!.includes('adj'));
assert.deepEqual(item.account.enum, ['sav', 'cash', 'hl']);
assert.equal(req.contents[0].parts[0].inlineData.mimeType, 'audio/mp4');

// reply parsing
const reply = (o: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] }, finishReason: 'STOP' }] });
const p = parseReply(
  reply({
    heard: 'milk 47, petrol 205 yesterday, salary 45000 to savings, moved 2k to cash, paid 12500 home loan',
    entries: [
      { type: 'expense', amount: 47, date: TODAY, category: 'dairy', subcategory: 'dairy-0', account: 'cash' },
      { type: 'expense', amount: 205, date: '2026-10-31', category: 'Vehicle', subcategory: 'Petrol', account: 'Cash' },
      { type: 'income', amount: 45000, date: TODAY, category: 'sal', account: 'sav' },
      { type: 'transfer', amount: 2000, date: TODAY, account: 'sav', to_account: 'cash' },
      { type: 'transfer', amount: '12,500', date: TODAY, account: 'sav', to_account: 'hl' },
    ],
  }),
  s,
  TODAY,
);
assert.equal(p.drafts.length, 5);
assert.deepEqual(p.drafts[0], { t: 'e', amt: 47_00, d: TODAY, a: 'cash', c: 'dairy', s: 'dairy-0' });
assert.deepEqual(p.drafts[1], { t: 'e', amt: 205_00, d: '2026-10-31', a: 'cash', c: 'veh', s: 'veh-0' }); // names matched, month boundary kept
assert.deepEqual(p.drafts[2], { t: 'i', amt: 45000_00, d: TODAY, a: 'sav', c: 'sal' });
assert.deepEqual(p.drafts[3], { t: 'x', amt: 2000_00, d: TODAY, a: 'sav', to: 'cash' });
assert.equal(p.drafts[4].amt, 12500_00);
assert.deepEqual(problems(p.drafts, s), [undefined, undefined, undefined, undefined, undefined]);
assert.equal(L.addTxs(s, p.drafts).error, undefined);

// untrusted values are corrected or left for the user to pick
const bad = parseReply(
  reply({
    heard: 'x',
    entries: [
      { type: 'expense', amount: 0, date: TODAY, account: 'cash' },
      { type: 'expense', amount: -5, date: TODAY, account: 'cash' },
      { type: 'expense', amount: 30, date: '2026-11-05', category: 'nope', subcategory: 'veh-0', account: 'ghost' },
      { type: 'expense', amount: 99.999, date: '2026-02-30', category: 'dairy', subcategory: 'veh-0', account: 'hl' },
      { type: 'income', amount: 10, date: TODAY, category: 'dairy', account: 'sav' },
      { type: 'transfer', amount: 10, date: TODAY, account: 'sav', to_account: 'ghost' },
    ],
  }),
  s,
  TODAY,
);
assert.equal(bad.drafts.length, 4);
assert.deepEqual(bad.drafts[0], { t: 'e', amt: 30_00, d: TODAY, a: 'cash', c: undefined }); // future date → today, unknown account → default
assert.deepEqual(bad.drafts[1], { t: 'e', amt: 100_00, d: TODAY, a: 'cash', c: 'dairy' }); // loan not allowed for expense, foreign sub dropped
assert.equal(bad.drafts[2].c, undefined); // expense category for income
assert.deepEqual(problems(bad.drafts, s), ['Pick a category', undefined, 'Pick a category', 'Pick where the money goes']);

const throwsTitle = (r: unknown, title: string) =>
  assert.throws(
    () => parseReply(r, s, TODAY),
    (e: AiError) => e.title === title,
  );
throwsTitle(reply({ heard: 'hello there', entries: [] }), 'No amounts heard');
throwsTitle({ candidates: [] }, 'Couldn’t understand');
throwsTitle({ promptFeedback: { blockReason: 'OTHER' } }, 'Couldn’t understand');
throwsTitle({ candidates: [{ content: { parts: [{ text: '{"heard": "milk 4' }] }, finishReason: 'MAX_TOKENS' }] }, 'Couldn’t understand');

console.log('ai ok');
