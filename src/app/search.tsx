import { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { addMonths, fmt, lastDayOf, monthOf, today } from '../lib/money';
import { catById, subName, useStore } from '../lib/store';
import type { TxType } from '../lib/types';
import { C, Chip, Chips, Empty, Header, pickDate, s, Screen, TxRow } from '../components/ui';

type Range = 'all' | 'month' | 'last' | 'year' | 'custom';

export default function Search() {
  const { txs, cats, accounts } = useStore();
  const [q, setQ] = useState('');
  const [type, setType] = useState<TxType | ''>('');
  const [acc, setAcc] = useState('');
  const [cat, setCat] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [from, setFrom] = useState(`${monthOf(today())}-01`);
  const [to, setTo] = useState(today());

  const [lo, hi] = useMemo(() => {
    const m = monthOf(today());
    if (range === 'month') return [`${m}-01`, lastDayOf(m)];
    if (range === 'last') return [`${addMonths(m, -1)}-01`, lastDayOf(addMonths(m, -1))];
    if (range === 'year') return [`${m.slice(0, 4)}-01-01`, `${m.slice(0, 4)}-12-31`];
    if (range === 'custom') return [from, to];
    return ['', '9999'];
  }, [range, from, to]);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const accName = Object.fromEntries(accounts.map((a) => [a.id, a.name.toLowerCase()]));
    return txs.filter((t) => {
      if (t.d < lo || t.d > hi) return false;
      if (type && t.t !== type) return false;
      if (acc && t.a !== acc && t.to !== acc) return false;
      if (cat && t.c !== cat) return false;
      if (!words.length) return true;
      const c = catById(cats, t.c);
      const hay = [t.n, c?.name, subName(c, t.s), accName[t.a], t.to && accName[t.to], String(t.amt / 100), t.d].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [txs, cats, accounts, q, type, acc, cat, lo, hi]);

  const total = results.reduce((a, t) => a + (t.t === 'e' ? -t.amt : t.t === 'i' ? t.amt : 0), 0);
  const filtered = !!(q || type || acc || cat || range !== 'all');

  return (
    <Screen>
      <Header title="Search" back />
      <TextInput
        autoFocus
        value={q}
        onChangeText={setQ}
        placeholder="Note, category, account, amount…"
        placeholderTextColor={C.dim}
        selectionColor={C.accent}
        style={s.input}
      />
      <View style={{ gap: 8, marginTop: 12 }}>
        <Chips>
          {(
            [
              ['all', 'All time'],
              ['month', 'This month'],
              ['last', 'Last month'],
              ['year', 'This year'],
              ['custom', range === 'custom' ? `${from} → ${to}` : 'Custom…'],
            ] as [Range, string][]
          ).map(([v, l]) => (
            <Chip
              key={v}
              label={l}
              active={range === v}
              onPress={() => {
                setRange(v);
                if (v === 'custom') pickDate(from, (f) => (setFrom(f), pickDate(to < f ? f : to, (x) => setTo(x < f ? f : x))));
              }}
            />
          ))}
        </Chips>
        <Chips>
          {(
            [
              ['', 'Any type'],
              ['e', 'Expense'],
              ['i', 'Income'],
              ['x', 'Transfer'],
            ] as [TxType | '', string][]
          ).map(([v, l]) => (
            <Chip key={v} label={l} active={type === v} onPress={() => setType(v)} />
          ))}
        </Chips>
        <Chips>
          <Chip label="Any account" active={!acc} onPress={() => setAcc('')} />
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} active={acc === a.id} onPress={() => setAcc(acc === a.id ? '' : a.id)} />
          ))}
        </Chips>
        <Chips>
          <Chip label="Any category" active={!cat} onPress={() => setCat('')} />
          {cats
            .filter((c) => !c.hidden && (!type || type === c.kind))
            .map((c) => (
              <Chip key={c.id} label={`${c.icon} ${c.name}`} active={cat === c.id} onPress={() => setCat(cat === c.id ? '' : c.id)} />
            ))}
        </Chips>
      </View>
      {filtered && (
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 14, marginBottom: 4 }]}>
          <Text style={s.muted}>{results.length} results</Text>
          <Text style={[s.amt, { color: total < 0 ? C.red : C.green }]}>{fmt(total, { sign: true })}</Text>
        </View>
      )}
      <FlatList
        data={filtered ? results : []}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TxRow tx={item} showDate />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        initialNumToRender={20}
        ListEmptyComponent={<Empty icon="search" text={filtered ? 'Nothing matches.' : 'Type or pick a filter.'} />}
      />
    </Screen>
  );
}
