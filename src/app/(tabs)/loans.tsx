import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addMonths, fmt, monthLabel, monthOf, monthsLeft, today } from '../../lib/money';
import { balances, useStore } from '../../lib/store';
import { Bar, Btn, C, Card, Empty, Header, IconBtn, s, Screen } from '../../components/ui';

export default function Loans() {
  const { accounts, txs } = useStore();
  const bal = useMemo(() => balances({ accounts, txs }), [accounts, txs]);
  const loans = accounts.filter((a) => a.type === 'loan' && !a.hidden);
  const owedTotal = loans.reduce((x, a) => x + Math.max(0, -bal[a.id]), 0);
  const emiTotal = loans.reduce((x, a) => x + (-bal[a.id] > 0 ? (a.emi ?? 0) : 0), 0);
  const add = () => router.push({ pathname: '/account/edit', params: { type: 'loan' } });

  return (
    <Screen scroll>
      <Header title="Loans" right={<IconBtn name="add" onPress={add} />} />
      {loans.length === 0 ? (
        <View style={{ gap: 16 }}>
          <Empty icon="trending-down-outline" text={'No loans yet.\nAdd one to track EMI, interest and payoff date.'} />
          <Btn label="Add loan" icon="add" onPress={add} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Card style={[s.row, { gap: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.small}>Total outstanding</Text>
              <Text style={[s.amt, { color: C.red, fontSize: 20, marginTop: 4 }]}>{fmt(owedTotal)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.small}>EMI per month</Text>
              <Text style={[s.amt, { fontSize: 20, marginTop: 4 }]}>{fmt(emiTotal)}</Text>
            </View>
          </Card>
          {loans.map((a) => {
            const owed = Math.max(0, -bal[a.id]);
            const principal = Math.max(-a.open, owed);
            const left = monthsLeft(owed, a.emi ?? 0, a.rate ?? 0);
            return (
              <Pressable key={a.id} onPress={() => router.push(`/account/${a.id}`)}>
                <Card style={{ gap: 12 }}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={s.section}>{a.name}</Text>
                    <Text style={s.small}>{a.rate ? `${a.rate}%` : 'Rate not set'}</Text>
                  </View>
                  <View>
                    <Text style={s.small}>Outstanding</Text>
                    <Text style={[s.big, { fontSize: 26, color: owed ? C.text : C.green }]}>{owed ? fmt(owed) : 'Closed 🎉'}</Text>
                  </View>
                  {principal > 0 && (
                    <View style={{ gap: 6 }}>
                      <Bar value={principal - owed} max={principal} color={C.green} />
                      <Text style={s.small}>{Math.round(((principal - owed) / principal) * 100)}% paid</Text>
                    </View>
                  )}
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={s.muted}>EMI {a.emi ? fmt(a.emi) : '—'}</Text>
                    <Text style={s.muted}>{!owed ? '' : left === Infinity ? 'Set EMI' : `Ends ${monthLabel(addMonths(monthOf(today()), left))}`}</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
