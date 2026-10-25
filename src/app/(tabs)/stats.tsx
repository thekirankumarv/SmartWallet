import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { addMonths, fmt, fmtShort, lastDayOf, monthLabel, monthOf, shortMonth, today } from '../../lib/money';
import { flows, subName, useStore } from '../../lib/store';
import { Bar, Bubble, C, Card, Empty, PALETTE, s, Screen, Section, Seg, tap } from '../../components/ui';

type Mode = 'month' | 'year';

export default function Stats() {
  const { txs, accounts, cats } = useStore();
  const [mode, setMode] = useState<Mode>('month');
  const [kind, setKind] = useState<'e' | 'i'>('e');
  const [month, setMonth] = useState(monthOf(today()));
  const [open, setOpen] = useState<string>();
  const year = month.slice(0, 4);

  const from = mode === 'month' ? `${month}-01` : `${year}-01-01`;
  const to = mode === 'month' ? lastDayOf(month) : `${year}-12-31`;

  const data = useMemo(() => {
    const f = flows({ accounts, txs }, from, to);
    const mine = f.filter((x) => x.kind === kind);
    const total = mine.reduce((a, x) => a + x.amt, 0);
    const byCat = new Map<string, { amt: number; subs: Map<string, number> }>();
    for (const x of mine) {
      const e = byCat.get(x.c) ?? { amt: 0, subs: new Map() };
      e.amt += x.amt;
      e.subs.set(x.s ?? '', (e.subs.get(x.s ?? '') ?? 0) + x.amt);
      byCat.set(x.c, e);
    }
    const rows = [...byCat]
      .map(([id, v], i) => ({ id, cat: cats.find((c) => c.id === id), ...v }))
      .sort((a, b) => b.amt - a.amt)
      .map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));
    const spentBy = new Map<string, number>();
    for (const x of f) if (x.kind === 'e') spentBy.set(x.c, (spentBy.get(x.c) ?? 0) + x.amt);
    const budgets = cats.filter((c) => c.kind === 'e' && !c.hidden && c.budget).map((c) => ({ c, spent: spentBy.get(c.id) ?? 0 }));
    const months = Array.from({ length: 12 }, (_, m) => {
      const ym = `${year}-${String(m + 1).padStart(2, '0')}`;
      const mf = f.filter((x) => x.d.startsWith(ym));
      return { m, e: mf.filter((x) => x.kind === 'e').reduce((a, x) => a + x.amt, 0), i: mf.filter((x) => x.kind === 'i').reduce((a, x) => a + x.amt, 0) };
    });
    const inc = f.filter((x) => x.kind === 'i').reduce((a, x) => a + x.amt, 0);
    const exp = f.filter((x) => x.kind === 'e').reduce((a, x) => a + x.amt, 0);
    return { total, rows, budgets, months, inc, exp };
  }, [txs, accounts, cats, from, to, kind, year]);

  const shift = (n: number) => (tap(), setMonth(mode === 'month' ? addMonths(month, n) : addMonths(month, n * 12)));
  const totalBudget = data.budgets.reduce((a, b) => a + (b.c.budget ?? 0), 0);

  return (
    <Screen scroll>
      <Text style={[s.h1, { marginBottom: 12 }]}>Stats</Text>
      <Seg
        options={[
          ['month', 'Monthly'],
          ['year', 'Yearly'],
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={[s.row, { justifyContent: 'space-between', marginVertical: 14 }]}>
        <Pressable hitSlop={12} onPress={() => shift(-1)} style={st.nav}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </Pressable>
        <Text style={s.section}>{mode === 'month' ? monthLabel(month) : year}</Text>
        <Pressable hitSlop={12} onPress={() => shift(1)} style={st.nav}>
          <Ionicons name="chevron-forward" size={20} color={C.text} />
        </Pressable>
      </View>

      <View style={[s.row, { gap: 8 }]}>
        <Summary label="Income" value={data.inc} color={C.green} />
        <Summary label="Expense" value={data.exp} color={C.red} />
        <Summary label="Saved" value={data.inc - data.exp} color={data.inc - data.exp >= 0 ? C.accent : C.red} />
      </View>

      {mode === 'year' && (
        <Card style={{ marginTop: 14 }}>
          <Text style={[s.muted, { marginBottom: 12 }]}>Month by month</Text>
          <MonthBars months={data.months} onPick={(m) => (setMode('month'), setMonth(`${year}-${String(m + 1).padStart(2, '0')}`))} />
        </Card>
      )}

      <Section title="Breakdown" />
      <Seg
        options={[
          ['e', 'Expense'],
          ['i', 'Income'],
        ]}
        value={kind}
        onChange={setKind}
        colors={{ e: C.red, i: C.green }}
      />
      {data.rows.length === 0 ? (
        <Empty icon="pie-chart-outline" text="No data for this period." />
      ) : (
        <Card style={{ marginTop: 14 }}>
          <View style={{ alignItems: 'center', marginVertical: 8 }}>
            <Donut parts={data.rows.map((r) => ({ v: r.amt, color: r.color }))} />
            <View style={st.donutCenter}>
              <Text style={s.small}>{kind === 'e' ? 'Spent' : 'Earned'}</Text>
              <Text style={[s.big, { fontSize: 24 }]}>{fmtShort(data.total)}</Text>
            </View>
          </View>
          {data.rows.map((r) => (
            <View key={r.id}>
              <Pressable onPress={() => (tap(), setOpen(open === r.id ? undefined : r.id))} style={st.catRow}>
                <Bubble emoji={r.cat?.icon ?? '❔'} color={r.color + '22'} size={36} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={s.rowTitle}>{r.cat?.name ?? 'Unknown'}</Text>
                    <Text style={s.amt}>{fmt(r.amt, { decimals: false })}</Text>
                  </View>
                  <View style={[s.row, { gap: 10 }]}>
                    <View style={{ flex: 1 }}>
                      <Bar value={r.amt} max={data.total} color={r.color} />
                    </View>
                    <Text style={[s.small, { width: 36, textAlign: 'right', marginTop: 0 }]}>{Math.round((r.amt / data.total) * 100)}%</Text>
                  </View>
                </View>
              </Pressable>
              {open === r.id && (
                <View style={st.subs}>
                  {[...r.subs]
                    .sort((a, b) => b[1] - a[1])
                    .map(([sid, amt]) => (
                      <View key={sid} style={[s.row, { justifyContent: 'space-between', paddingVertical: 6 }]}>
                        <Text style={{ color: C.sub, fontSize: 14 }}>{subName(r.cat, sid) ?? 'General'}</Text>
                        <Text style={[s.amt, { fontSize: 14, color: C.sub }]}>{fmt(amt, { decimals: false })}</Text>
                      </View>
                    ))}
                </View>
              )}
            </View>
          ))}
        </Card>
      )}

      {mode === 'month' && data.budgets.length > 0 && (
        <>
          <Section title="Budget" right={<Text style={s.muted}>{`${fmt(data.exp, { decimals: false })} / ${fmt(totalBudget, { decimals: false })}`}</Text>} />
          <Card style={{ gap: 16 }}>
            {data.budgets.map(({ c, spent }) => {
              const over = spent > c.budget!;
              return (
                <View key={c.id} style={{ gap: 6 }}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={s.rowTitle}>
                      {c.icon} {c.name}
                    </Text>
                    <Text style={[s.small, { color: over ? C.red : C.sub, marginTop: 0 }]}>
                      {fmt(spent, { decimals: false })} / {fmt(c.budget!, { decimals: false })}
                    </Text>
                  </View>
                  <Bar value={spent} max={c.budget!} color={over ? C.red : spent > c.budget! * 0.8 ? C.amber : C.green} />
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card style={{ flex: 1, padding: 12 }}>
      <Text style={s.small}>{label}</Text>
      <Text style={[s.amt, { color, fontSize: 16, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
        {fmtShort(value)}
      </Text>
    </Card>
  );
}

function Donut({ parts, size = 190, width = 22 }: { parts: { v: number; color: string }[]; size?: number; width?: number }) {
  const r = (size - width) / 2;
  const circ = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  const gap = parts.length > 1 ? 3 : 0;
  const offsets = parts.reduce<number[]>((acc, p, i) => [...acc, i ? acc[i - 1] + (parts[i - 1].v / total) * circ : 0], []);
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.card2} strokeWidth={width} fill="none" />
      {parts.map((p, i) => (
        <Circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={p.color}
          strokeWidth={width}
          fill="none"
          strokeDasharray={`${Math.max(0, (p.v / total) * circ - gap)} ${circ}`}
          strokeDashoffset={-offsets[i]}
        />
      ))}
    </Svg>
  );
}

function MonthBars({ months, onPick }: { months: { m: number; e: number; i: number }[]; onPick: (m: number) => void }) {
  const max = Math.max(1, ...months.flatMap((x) => [x.e, x.i]));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 }}>
      {months.map((x) => (
        <Pressable key={x.m} onPress={() => onPick(x.m)} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 110 }}>
            <View style={[st.bar, { height: Math.max(2, (x.i / max) * 110), backgroundColor: C.green }]} />
            <View style={[st.bar, { height: Math.max(2, (x.e / max) * 110), backgroundColor: C.red }]} />
          </View>
          <Text style={{ color: C.dim, fontSize: 10, fontWeight: '600' }}>{shortMonth(x.m)[0]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  nav: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  subs: { marginLeft: 48, marginBottom: 6, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: C.line },
  bar: { width: 7, borderRadius: 4 },
});
