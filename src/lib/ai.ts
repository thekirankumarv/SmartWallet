import { norm } from './csv';
import type { Draft } from './ledger';
import { validate } from './ledger';
import { ADJ_E, ADJ_I } from './seed';
import { isValidYmd, parseYmd, toPaise } from './money';
import type { Data } from './types';

export const MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
export const KEY_URL = 'https://aistudio.google.com/apikey';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const TIMEOUT_MS = 30_000;

export class AiError extends Error {
  constructor(
    public title: string,
    message: string,
    public kind: 'key' | 'quota' | 'network' | 'server' | 'reply' = 'server',
  ) {
    super(message);
  }
}

const NEW_KEY = 'Create a new key in Google AI Studio and paste it in Voice entry settings.';

export function keyProblem(raw: string): string | undefined {
  const k = raw.trim();
  if (!k) return 'Paste your API key.';
  if (/\s/.test(k) || /["'`]/.test(k)) return 'The key contains spaces or quotes. Copy it again from Google AI Studio.';
  if (!/^[\w.-]+$/.test(k)) return 'The key contains characters an API key never has. Copy it again from Google AI Studio.';
  if (!k.startsWith('AQ.') && !k.startsWith('AIza')) return 'That doesn’t look like a Gemini API key. Keys from Google AI Studio start with “AQ.”';
  if (k.length < 30) return 'The key looks cut off. Copy the whole key from Google AI Studio.';
}

interface ApiErrorBody {
  error?: { code?: number; status?: string; message?: string; details?: { reason?: string; violations?: { quotaId?: string }[] }[] };
}

export function explainError(status: number, body: string, key = ''): AiError {
  let e: ApiErrorBody['error'] = {};
  try {
    e = (JSON.parse(body) as ApiErrorBody).error ?? {};
  } catch {}
  const msg = e.message ?? '';
  const reasons = (e.details ?? []).map((d) => d.reason ?? '');
  const quotaIds = (e.details ?? []).flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? '');
  const has = (re: RegExp) => re.test(msg) || reasons.some((r) => re.test(r));
  const oldKey = key.startsWith('AIza') ? ' Keys starting with “AIza” are an older type Google is retiring.' : '';

  if (has(/expired/i)) return new AiError('API key expired', `Your Gemini API key has expired. ${NEW_KEY}`, 'key');
  if (has(/leaked/i)) return new AiError('API key blocked', `Google blocked this key because it was reported as leaked. ${NEW_KEY}`, 'key');
  if (status === 401 || has(/API_KEY_INVALID|api key not valid|invalid api key|API_KEY_.*INVALID/i))
    return new AiError('Invalid API key', `Google didn’t accept this key. Check it was copied completely.${oldKey} ${NEW_KEY}`, 'key');
  if (status === 429) {
    if (quotaIds.some((q) => /PerDay/i.test(q)) || /per day|daily/i.test(msg))
      return new AiError(
        'Daily limit reached',
        'You’ve used today’s free Gemini limit. It resets at midnight US Pacific time (about 12:30 PM IST). You can still add entries by hand.',
        'quota',
      );
    if (quotaIds.some((q) => /PerMinute/i.test(q)) || /per minute/i.test(msg))
      return new AiError('Too many requests', 'Too many voice entries in a short time. Wait a minute and try again.', 'quota');
    return new AiError('Usage limit reached', 'This key has run out of Gemini usage. Check your plan and limits in Google AI Studio.', 'quota');
  }
  if (status === 403 || e.status === 'PERMISSION_DENIED')
    return new AiError('Key not allowed', `This key isn’t allowed to use the Gemini API.${oldKey} ${NEW_KEY}`, 'key');
  if (e.status === 'FAILED_PRECONDITION' || /location is not supported|not available in your country/i.test(msg))
    return new AiError(
      'Not available',
      'Gemini’s free tier isn’t available for this key’s region. Enable billing on the key’s Google project to use it.',
      'key',
    );
  if (status === 404)
    return new AiError('Voice model unavailable', 'The Gemini model this app uses isn’t available. Update SmartWallet to the latest version.');
  if (status >= 500) return new AiError('Gemini is busy', 'Google’s servers are busy right now. Try again in a moment.');
  return new AiError('Voice entry failed', `Gemini returned an error (${status}${msg ? `: ${msg}` : ''}).`);
}

async function call(path: string, key: string, init: RequestInit = {}): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(API + path, { ...init, signal: ctrl.signal, headers: { 'x-goog-api-key': key.trim(), 'Content-Type': 'application/json' } });
    } catch {
      throw ctrl.signal.aborted
        ? new AiError('Took too long', 'Gemini didn’t answer in time. Check your connection and try again.', 'network')
        : new AiError('No internet', 'Couldn’t reach Gemini. Check your internet connection and try again.', 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return res.json();
    if (res.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    throw explainError(res.status, await res.text(), key);
  }
}

async function withModel<T>(fn: (model: string) => Promise<T>): Promise<T> {
  for (const m of MODELS) {
    try {
      return await fn(m);
    } catch (e) {
      if (!(e instanceof AiError && e.title === 'Voice model unavailable') || m === MODELS[MODELS.length - 1]) throw e;
    }
  }
  throw new Error('unreachable');
}

export const verifyKey = async (key: string) => {
  await withModel((m) => call(m, key));
};

const visibleCats = (s: Data, kind: 'e' | 'i') => s.cats.filter((c) => c.kind === kind && !c.hidden && c.id !== ADJ_E && c.id !== ADJ_I);
const visibleAccs = (s: Data) => s.accounts.filter((a) => !a.hidden);
const defaultAcc = (s: Data) => {
  const usable = visibleAccs(s).filter((a) => a.type !== 'loan');
  return usable.find((a) => a.id === s.lastAcc)?.id ?? usable[0]?.id;
};

export function buildRequest(s: Data, today: string, audio: { data: string; mimeType: string }) {
  const cats = [...visibleCats(s, 'e'), ...visibleCats(s, 'i')];
  const accs = visibleAccs(s);
  const weekday = parseYmd(today).toLocaleDateString('en-US', { weekday: 'long' });
  const catLines = (kind: 'e' | 'i') =>
    visibleCats(s, kind)
      .map((c) => {
        const subs = c.subs.filter((x) => !x.hidden);
        return `- ${c.id}: ${c.name}${subs.length ? ` [${subs.map((x) => `${x.id}: ${x.name}`).join(', ')}]` : ''}`;
      })
      .join('\n');
  const prompt = `You turn a short spoken note into entries for a personal expense tracker. Amounts are in Indian rupees.
Today is ${today} (${weekday}).

Rules:
- The speaker may mix English with Indian languages. Listen carefully to numbers.
- One entry per amount mentioned. "milk 47 and petrol 205" is two entries.
- "2k" = 2000, "1.5 lakh" = 150000. Work out simple maths like "3 coffees at 20 each" = 60.
- date: YYYY-MM-DD. Resolve words like "yesterday", "last Friday", "on the 5th" from today. Never a future date: a day of the month after today means last month. Default is today.
- type: "income" for money received (salary, refund, interest, cashback, gift received), "transfer" for moving money between the user's own accounts or paying a credit card or loan, otherwise "expense".
- category and subcategory: pick ids from the lists. The subcategory must belong to the category. Leave subcategory empty if none fits.
- account: the account mentioned (e.g. "by cash", "from savings"), otherwise "${defaultAcc(s) ?? ''}". For transfers, account is where money leaves and to_account is where it goes.
- note: only extra detail not covered by the category (a place or person), otherwise empty.
- heard: what the speaker said, written out.
- If nothing about money was said, return no entries.

Expense categories:
${catLines('e')}

Income categories:
${catLines('i')}

Accounts:
${accs.map((a) => `- ${a.id}: ${a.name} (${a.type})`).join('\n')}`;

  const ids = (xs: string[]) => (xs.length ? { type: 'STRING', enum: xs } : { type: 'STRING' });
  const schema = {
    type: 'OBJECT',
    properties: {
      heard: { type: 'STRING' },
      entries: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            type: { type: 'STRING', enum: ['expense', 'income', 'transfer'] },
            amount: { type: 'NUMBER' },
            date: { type: 'STRING' },
            category: ids(cats.map((c) => c.id)),
            subcategory: ids(cats.flatMap((c) => c.subs.filter((x) => !x.hidden).map((x) => x.id))),
            account: ids(accs.map((a) => a.id)),
            to_account: ids(accs.map((a) => a.id)),
            note: { type: 'STRING' },
          },
          required: ['type', 'amount', 'date', 'account'],
        },
      },
    },
    required: ['heard', 'entries'],
  };
  return {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: 'user', parts: [{ inlineData: audio }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
  };
}

interface RawEntry {
  type?: string;
  amount?: number | string;
  date?: string;
  category?: string;
  subcategory?: string;
  account?: string;
  to_account?: string;
  note?: string;
}

export interface Parsed {
  heard: string;
  drafts: Draft[];
}

const byIdOrName = <T extends { id: string; name: string }>(list: T[], v?: string) =>
  v ? (list.find((x) => x.id === v) ?? list.find((x) => norm(x.name) === norm(v) && norm(v) !== '')) : undefined;

export function parseReply(reply: unknown, s: Data, today: string): Parsed {
  const r = reply as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  const cand = r?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('');
  if (r?.promptFeedback?.blockReason || !text)
    throw new AiError('Couldn’t understand', 'Gemini didn’t return anything for that recording. Try again and speak clearly.', 'reply');
  let out: { heard?: string; entries?: RawEntry[] };
  try {
    out = JSON.parse(text);
  } catch {
    throw new AiError('Couldn’t understand', 'Gemini’s answer was incomplete. Try again with a shorter note.', 'reply');
  }
  const accs = s.accounts;
  const fallback = defaultAcc(s);
  const drafts: Draft[] = [];
  for (const e of out.entries ?? []) {
    const amount = typeof e.amount === 'string' ? parseFloat(e.amount.replace(/[^\d.]/g, '')) : e.amount;
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) continue;
    const t = e.type === 'income' ? 'i' : e.type === 'transfer' ? 'x' : 'e';
    const d = e.date && isValidYmd(e.date) && e.date <= today ? e.date : today;
    const acc = byIdOrName(accs, e.account);
    const draft: Draft = { t, amt: toPaise(amount), d, a: acc && (t === 'x' || acc.type !== 'loan') ? acc.id : (fallback ?? '') };
    if (t === 'x') {
      draft.to = byIdOrName(accs, e.to_account)?.id;
    } else {
      const cat = byIdOrName(visibleCats(s, t), e.category);
      draft.c = cat?.id;
      const sub = cat && byIdOrName(cat.subs, e.subcategory);
      if (sub) draft.s = sub.id;
    }
    if (e.note?.trim()) draft.n = e.note.trim();
    drafts.push(draft);
  }
  if (!drafts.length) throw new AiError('No amounts heard', 'Didn’t catch any amounts. Hold the mic and say something like “milk 47, petrol 205”.', 'reply');
  return { heard: (out.heard ?? '').trim(), drafts };
}

export async function understand(key: string, s: Data, today: string, audio: { data: string; mimeType: string }): Promise<Parsed> {
  const reply = await withModel((m) => call(`${m}:generateContent`, key, { method: 'POST', body: JSON.stringify(buildRequest(s, today, audio)) }));
  return parseReply(reply, s, today);
}

export const problems = (drafts: Draft[], s: Data) => drafts.map((d) => validate(d, s));
