import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addMonths, dayLabel, fmt, lastDayOf, monthLabel, monthOf, today } from '../../lib/money';
import { flows, useStore } from '../../lib/store';
import type { Tx } from '../../lib/types';
import { Bar, C, Card, Empty, IconBtn, s, tap, TxRow } from '../../components/ui';

export default function Home() {
  const ins = useSafeAreaInsets();
  const [month, setMonth] = useState(monthOf(today()));
  const txs = useStore((st) => st.txs);
  const accounts = useStore((st) => st.accounts);
  const cats = useStore((st) => st.cats);
  const error = useStore((st) => st.loadError || st.saveError);

  const { sections, inc, exp, budget } = useMemo(() => {
    const from = `${month}-01`;
    const to = lastDayOf(month);
    const list = txs.filter((t) => t.d >= from && t.d <= to);
    const byDay = new Map<string, Tx[]>();
    for (const t of list) byDay.set(t.d, [...(byDay.get(t.d) ?? []), t]);
    const f = flows({ accounts, txs: list }, from, to);
    const sum = (k: 'e' | 'i') => f.filter((x) => x.kind === k).reduce((a, x) => a + x.amt, 0);
    const dayNet = (ts: Tx[]) => ts.reduce((a, t) => a + (t.t === 'e' ? -t.amt : t.t === 'i' ? t.amt : 0), 0);
    return {
      sections: [...byDay].map(([d, data]) => ({ d, data, net: dayNet(data) })),
      inc: sum('i'),
      exp: sum('e'),
      budget: cats.reduce((a, c) => a + (c.kind === 'e' && !c.hidden ? (c.budget ?? 0) : 0), 0),
    };
  }, [txs, accounts, cats, month]);

  const cur = month === monthOf(today());
  return (
    <View style={[s.fill, { paddingTop: ins.top + 8 }]}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        ListHeaderComponent={
          <View>
            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={s.muted}>SmartWallet</Text>
                <View style={[s.row, { marginTop: 2 }]}>
                  <Pressable hitSlop={12} onPress={() => (tap(), setMonth(addMonths(month, -1)))}>
                    <Ionicons name="chevron-back" size={22} color={C.sub} />
                  </Pressable>
                  <Pressable onLongPress={() => setMonth(monthOf(today()))}>
                    <Text style={st.month}>{monthLabel(month)}</Text>
                  </Pressable>
                  <Pressable hitSlop={12} onPress={() => (tap(), setMonth(addMonths(month, 1)))}>
                    <Ionicons name="chevron-forward" size={22} color={C.sub} />
                  </Pressable>
                </View>
              </View>
              <IconBtn name="search" onPress={() => router.push('/search')} />
            </View>

            {!!error && (
              <Pressable onPress={() => router.push('/settings')}>
                <Card style={{ borderColor: C.red, marginTop: 8 }}>
                  <Text style={{ color: C.red, fontWeight: '700' }}>{error}</Text>
                </Card>
              </Pressable>
            )}
            <Card style={{ marginTop: 8, gap: 14 }}>
              <View>
                <Text style={s.muted}>Spent this month</Text>
                <Text style={[s.big, { fontSize: 36 }]}>{fmt(exp, { decimals: false })}</Text>
              </View>
              {budget > 0 && (
                <View style={{ gap: 6 }}>
                  <Bar value={exp} max={budget} color={exp > budget ? C.red : C.accent} />
                  <Text style={s.small}>
                    {exp > budget
                      ? `${fmt(exp - budget, { decimals: false })} over budget`
                      : `${fmt(budget - exp, { decimals: false })} left of ${fmt(budget, { decimals: false })}`}
                  </Text>
                </View>
              )}
              <View style={st.pills}>
                <Pill label="Income" value={inc} color={C.green} />
                <Pill label="Expense" value={exp} color={C.red} />
                <Pill label="Balance" value={inc - exp} color={inc - exp >= 0 ? C.text : C.red} />
              </View>
            </Card>
            {!cur && (
              <Pressable onPress={() => setMonth(monthOf(today()))} style={{ alignSelf: 'center', marginTop: 12 }}>
                <Text style={{ color: C.accent, fontWeight: '700' }}>Back to this month</Text>
              </Pressable>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[s.row, { justifyContent: 'space-between', marginTop: 22, marginBottom: 4, paddingHorizontal: 4 }]}>
            <Text style={st.day}>{dayLabel(section.d)}</Text>
            <Text style={[st.day, { color: C.dim }]}>{section.net === 0 ? '' : fmt(section.net, { sign: true, decimals: false })}</Text>
          </View>
        )}
        renderItem={({ item }) => <TxRow tx={item} />}
        ListEmptyComponent={<Empty icon="receipt-outline" text={'No transactions this month.\nTap + to add one.'} />}
      />
      <Pressable
        onPress={() => (tap(), router.push({ pathname: '/tx', params: cur ? {} : { date: lastDayOf(month) } }))}
        style={({ pressed }) => [st.fab, { bottom: 20, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      >
        <Ionicons name="add" size={32} color="#0A0A0F" />
      </Pressable>
    </View>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={st.pill}>
      <Text style={s.small}>{label}</Text>
      <Text style={[s.amt, { color, fontSize: 15 }]} numberOfLines={1} adjustsFontSizeToFit>
        {fmt(value, { decimals: false })}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, backgroundColor: C.card2, borderRadius: 14, padding: 10 },
  month: { color: C.text, fontSize: 19, fontWeight: '700', minWidth: 92, textAlign: 'center' },
  day: { color: C.sub, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
});
