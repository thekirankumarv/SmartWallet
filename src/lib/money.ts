export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const toPaise = (rupees: number) => Math.round(rupees * 100);

export function fmt(paise: number, opts: { sign?: boolean; decimals?: boolean } = {}) {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const ps = abs % 100;
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  let out = '₹' + (rest ? rest + ',' + last3 : last3);
  if (ps && opts.decimals !== false) out += '.' + String(ps).padStart(2, '0');
  if (neg) out = '-' + out;
  else if (opts.sign) out = '+' + out;
  return out;
}

export function fmtShort(paise: number) {
  const r = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';
  if (r >= 1e7) return `${sign}₹${+(r / 1e7).toFixed(2)}Cr`;
  if (r >= 1e5) return `${sign}₹${+(r / 1e5).toFixed(2)}L`;
  if (r >= 1e3) return `${sign}₹${+(r / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(r)}`;
}

export function calc(expr: string): number {
  const toks = expr
    .replace(/\s/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .match(/\d*\.?\d+|[-+*/]/g);
  if (!toks || toks.join('') !== expr.replace(/\s/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')) return NaN;
  if ('+-*/'.includes(toks[toks.length - 1])) toks.pop();
  let i = 0;
  const num = (): number => {
    const t = toks[i++];
    if (t === '-') return -num();
    const n = parseFloat(t);
    return isNaN(n) ? NaN : n;
  };
  const term = (): number => {
    let v = num();
    while (toks[i] === '*' || toks[i] === '/') {
      const op = toks[i++];
      const r = num();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  let v = term();
  while (toks[i] === '+' || toks[i] === '-') {
    const op = toks[i++];
    const r = term();
    v = op === '+' ? v + r : v - r;
  }
  return i === toks.length && isFinite(v) ? v : NaN;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
export const hm = (dt: Date) => `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
export const today = () => ymd(new Date());
export const parseYmd = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd);
};
export const addDays = (d: string, n: number) => {
  const dt = parseYmd(d);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
};
export const isValidYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && ymd(parseYmd(d)) === d;
export const monthOf = (d: string) => d.slice(0, 7);
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
};
export const lastDayOf = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(y, m, 0).getDate())}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const monthLabel = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
export const shortMonth = (m: number) => MONTHS[m];
export function dayLabel(d: string) {
  const t = today();
  if (d === t) return 'Today';
  if (d === addDays(t, -1)) return 'Yesterday';
  const dt = parseYmd(d);
  return `${DAYS[dt.getDay()]}, ${dt.getDate()} ${MONTHS[dt.getMonth()]}${d.slice(0, 4) === t.slice(0, 4) ? '' : ' ' + d.slice(0, 4)}`;
}

export function monthsLeft(owed: number, emi: number, rate: number) {
  if (owed <= 0) return 0;
  if (emi <= 0) return Infinity;
  const r = rate / 1200;
  if (r === 0) return Math.ceil(owed / emi);
  const x = 1 - (r * owed) / emi;
  if (x <= 0) return Infinity;
  return Math.ceil(-Math.log(x) / Math.log(1 + r));
}
