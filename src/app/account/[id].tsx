import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { addMonths, fmt, monthLabel, monthOf, monthsLeft, today } from '../../lib/money';
import { balances, useStore } from '../../lib/store';
import { INTEREST_SUB } from '../../lib/seed';
import { ACC_TYPES, Btn, C, Card, Empty, Header, IconBtn, s, Screen, TxRow } from '../../components/ui';

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, txs, lastAcc } = useStore();
  const a = accounts.find((x) => x.id === id);
  const list = useMemo(() => txs.filter((t) => t.a === id || t.to === id), [txs, id]);
  const bal = useMemo(() => (a ? balances({ accounts: [a], txs: list })[a.id] : 0), [a, list]);
  if (!a) return null;

  const isLoan = a.type === 'loan';
  const owed = -bal;
  const left = isLoan ? monthsLeft(owed, a.emi ?? 0, a.rate ?? 0) : 0;
  const year = today().slice(0, 4);
  const interestYear = list.filter((t) => t.s === INTEREST_SUB && t.d.startsWith(year)).reduce((x, t) => x + t.amt, 0);
  const paidYear = list.filter((t) => t.t === 'x' && t.to === a.id && t.d.startsWith(year)).reduce((x, t) => x + t.amt, 0);
  const payFrom = lastAcc && lastAcc !== a.id ? lastAcc : accounts.find((x) => x.type === 'bank' && x.id !== a.id)?.id;
  const icon = ACC_TYPES.find(([t]) => t === a.type)?.[2];

  return (
    <Screen>
      <Header title={a.name} back right={<IconBtn name="create-outline" onPress={() => router.push({ pathname: '/account/edit', params: { id: a.id } })} />} />
      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TxRow tx={item} showDate />}
        contentContainerStyle={{ paddingBottom: 40 }}
        initialNumToRender={20}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <Card style={{ gap: 4 }}>
              <Text style={s.muted}>
                {icon} {isLoan ? 'Outstanding' : 'Balance'}
              </Text>
              <Text style={[s.big, { color: isLoan ? C.red : bal < 0 ? C.red : C.text }]}>{fmt(isLoan ? owed : bal)}</Text>
            </Card>
            {isLoan && (
              <Card style={{ gap: 10 }}>
                <Stat label="Interest rate" value={a.rate ? `${a.rate}% / year` : 'Not set'} />
                <Stat label="EMI" value={a.emi ? fmt(a.emi) : 'Not set'} />
                <Stat
                  label="Paid off in"
                  value={owed <= 0 ? 'Closed 🎉' : left === Infinity ? 'EMI too low' : `${left} months · ${monthLabel(addMonths(monthOf(today()), left))}`}
                />
                <Stat label={`Paid in ${year}`} value={fmt(paidYear, { decimals: false })} />
                <Stat label={`Interest in ${year}`} value={fmt(interestYear, { decimals: false })} />
                <Text style={s.small}>Interest is added automatically at the end of every month on the outstanding amount.</Text>
              </Card>
            )}
            <View style={[s.row, { gap: 8 }]}>
              {isLoan ? (
                <View style={{ flex: 1 }}>
                  <Btn
                    label="Pay EMI"
                    icon="checkmark-circle-outline"
                    onPress={() => router.push({ pathname: '/tx', params: { type: 'x', to: a.id, from: payFrom, amt: a.emi ? String(a.emi / 100) : '' } })}
                  />
                </View>
              ) : (
                <>
                  <View style={{ flex: 1 }}>
                    <Btn label="Add" icon="add" onPress={() => router.push({ pathname: '/tx', params: { from: a.id } })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Btn
                      label="Transfer"
                      kind="ghost"
                      icon="swap-horizontal"
                      onPress={() => router.push({ pathname: '/tx', params: { type: 'x', from: a.id } })}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={<Empty icon="receipt-outline" text="No transactions yet." />}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <Text style={{ color: C.sub, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
