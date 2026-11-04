import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { dayLabel, fmt, nextDay, today } from '../lib/money';
import { balances, cardStatus, useStore } from '../lib/store';
import { Bar, Btn, C, Card, Empty, Header, IconBtn, s, Screen, Section, TxRow } from '../components/ui';

const utilColor = (u: number) => (u > 0.8 ? C.red : u > 0.3 ? C.amber : C.green);

export default function Cards() {
  const { accounts, txs } = useStore();
  const bal = useMemo(() => balances({ accounts, txs }), [accounts, txs]);
  const cards = accounts.filter((a) => a.type === 'card' && !a.hidden).map((a) => ({ a, ...cardStatus(a, bal[a.id]), dueOn: a.due ? nextDay(a.due, today()) : undefined }));
  const limit = cards.reduce((x, c) => x + c.limit, 0);
  const outstanding = cards.reduce((x, c) => x + c.outstanding, 0);
  const available = cards.reduce((x, c) => x + c.available, 0);
  const limited = cards.filter((c) => c.limit).reduce((x, c) => x + c.outstanding, 0);
  const next = cards.filter((c) => c.outstanding && c.dueOn).sort((x, y) => x.dueOn!.localeCompare(y.dueOn!))[0];
  const ids = new Set(cards.map((c) => c.a.id));
  const recent = txs.filter((t) => ids.has(t.a) || (t.to && ids.has(t.to))).slice(0, 8);
  const add = () => router.push({ pathname: '/account/edit', params: { type: 'card' } });

  return (
    <Screen scroll>
      <Header title="Credit cards" back right={<IconBtn name="add" onPress={add} label="Add credit card" />} />
      {cards.length === 0 ? (
        <View style={{ gap: 16 }}>
          <Empty icon="card-outline" text={'No credit cards yet.\nAdd a regular or FD-backed card to track limit, dues and available credit.'} />
          <Btn label="Add credit card" icon="add" onPress={add} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Card style={{ gap: 12 }}>
            <View style={[s.row, { gap: 8 }]}>
              <Total label="Outstanding" value={outstanding} color={outstanding ? C.red : C.text} />
              <Total label="Available" value={available} color={C.green} />
              <Total label="Total limit" value={limit} />
            </View>
            {limit > 0 && (
              <View style={{ gap: 6 }}>
                <Bar value={limited} max={limit} color={utilColor(limited / limit)} />
                <Text style={s.small}>{Math.round((limited / limit) * 100)}% utilisation</Text>
              </View>
            )}
            {next && (
              <Text style={s.muted}>
                Next due: {fmt(next.outstanding)} on {next.a.name} · {dayLabel(next.dueOn!)}
              </Text>
            )}
          </Card>

          {cards.map(({ a, ...c }) => (
            <Pressable key={a.id} onPress={() => router.push(`/account/${a.id}`)}>
              <Card style={{ gap: 10 }}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.section}>{a.name}</Text>
                    {!!a.bank && <Text style={s.small}>{a.bank}</Text>}
                  </View>
                  <View style={[s.chip, { height: 26, paddingHorizontal: 10, borderColor: a.fd ? C.amber : C.line }]}>
                    <Text style={[s.small, { marginTop: 0, color: a.fd ? C.amber : C.sub }]}>{a.fd ? '🔒 FD-backed' : 'Regular'}</Text>
                  </View>
                </View>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <View>
                    <Text style={s.small}>{c.credit ? 'Credit balance' : 'Outstanding'}</Text>
                    <Text style={[s.big, { fontSize: 24, color: c.outstanding ? C.text : C.green }]}>{fmt(c.outstanding || c.credit)}</Text>
                  </View>
                  {c.limit > 0 && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.small}>Available</Text>
                      <Text style={[s.amt, { fontSize: 16 }]}>{fmt(c.available)}</Text>
                    </View>
                  )}
                </View>
                {c.limit > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Bar value={c.outstanding} max={c.limit} color={utilColor(c.util)} />
                    <Text style={s.small}>
                      {Math.round(c.util * 100)}% of {fmt(c.limit)} used{c.dueOn && c.outstanding ? ` · due ${dayLabel(c.dueOn)}` : ''}
                    </Text>
                  </View>
                ) : (
                  <Text style={s.small}>No limit set · tap to edit</Text>
                )}
              </Card>
            </Pressable>
          ))}

          {recent.length > 0 && (
            <>
              <Section title="Recent activity" />
              <Card style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
                {recent.map((t) => (
                  <TxRow key={t.id} tx={t} showDate />
                ))}
              </Card>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

function Total({ label, value, color = C.text }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: 14, padding: 10 }}>
      <Text style={s.small}>{label}</Text>
      <Text style={[s.amt, { color, fontSize: 15 }]} numberOfLines={1} adjustsFontSizeToFit>
        {fmt(value)}
      </Text>
    </View>
  );
}
