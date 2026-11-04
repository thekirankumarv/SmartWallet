import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { addMonths, dayLabel, fmt, monthLabel, monthOf, monthsLeft, nextDay, today } from '../../lib/money';
import { balances, cardStatus, useStore } from '../../lib/store';
import { INTEREST_SUB } from '../../lib/seed';
import { accTypeInfo, Bar, Btn, C, Card, Chip, Chips, Empty, Header, IconBtn, isDebt, s, Screen, TxRow } from '../../components/ui';

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, txs, lastAcc } = useStore();
  const a = accounts.find((x) => x.id === id);
  const [show, setShow] = useState<'all' | 'spend' | 'pay'>('all');
  const all = useMemo(() => txs.filter((t) => t.a === id || t.to === id), [txs, id]);
  const bal = useMemo(() => (a ? balances({ accounts: [a], txs: all })[a.id] : 0), [a, all]);
  // On a card, money in (payments, refunds) lowers what you owe; money out is spending.
  const list = show === 'all' ? all : all.filter((t) => (show === 'pay') === (t.to === id || t.t === 'i'));
  if (!a) return null;
  const isCard = a.type === 'card';
  const cs = cardStatus(a, bal);
  const fd = accounts.find((x) => x.id === a.fd);
  const securing = a.type === 'fd' ? accounts.filter((x) => x.fd === a.id) : [];
  const dueOn = a.due && nextDay(a.due, today());

  const isLoan = a.type === 'loan';
  const debt = isDebt(a.type);
  const owed = -bal;
  const left = isLoan ? monthsLeft(owed, a.emi ?? 0, a.rate ?? 0) : 0;
  const year = today().slice(0, 4);
  const interestYear = all.filter((t) => t.t === 'e' && t.s === INTEREST_SUB && t.d.startsWith(year)).reduce((x, t) => x + t.amt, 0);
  const paidYear = all.filter((t) => t.t === 'x' && t.to === a.id && t.d.startsWith(year)).reduce((x, t) => x + t.amt, 0);
  const payFrom = lastAcc && lastAcc !== a.id && accounts.find((x) => x.id === lastAcc)?.type !== 'card' ? lastAcc : accounts.find((x) => x.type === 'bank' && x.id !== a.id)?.id;
  const icon = accTypeInfo(a.type)[1];

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
                {icon} {isLoan || isCard ? (bal > 0 ? 'Credit balance' : 'Outstanding') : debt ? (bal > 0 ? 'Credit balance' : 'Owed') : 'Balance'}
              </Text>
              <Text style={[s.big, { color: isLoan ? C.red : !debt && bal < 0 ? C.red : C.text }]}>{fmt(debt ? Math.abs(bal) : bal)}</Text>
            </Card>
            {isCard && (
              <Card style={{ gap: 10 }}>
                {cs.limit > 0 ? (
                  <>
                    <View style={{ gap: 6 }}>
                      <Bar value={cs.outstanding} max={cs.limit} color={cs.util > 0.8 ? C.red : cs.util > 0.3 ? C.amber : C.green} />
                      <Text style={s.small}>{Math.round(cs.util * 100)}% of limit used</Text>
                    </View>
                    <Stat label="Credit limit" value={fmt(cs.limit)} />
                    <Stat label="Available credit" value={fmt(cs.available)} />
                  </>
                ) : (
                  <Text style={s.small}>Set a credit limit to track available credit.</Text>
                )}
                {!!a.bank && <Stat label="Bank" value={a.bank} />}
                <Stat label="Card type" value={fd ? 'FD-backed' : 'Regular'} />
                {!!a.bill && <Stat label="Statement day" value={`${a.bill} of every month`} />}
                {dueOn && <Stat label="Next payment due" value={cs.outstanding ? dayLabel(dueOn) : `${dayLabel(dueOn)} · nothing due`} />}
                {fd && <Stat label="Secured by" value={`${fd.name}${fd.ref ? ` · ${fd.ref}` : ''}`} />}
              </Card>
            )}
            {a.type === 'fd' && (
              <Card style={{ gap: 10 }}>
                {!!a.ref && <Stat label="Reference" value={a.ref} />}
                {!!a.fdRate && <Stat label="Interest rate" value={`${a.fdRate}% / year`} />}
                {!!a.maturity && <Stat label="Matures" value={dayLabel(a.maturity)} />}
                {securing.map((c) => (
                  <Stat key={c.id} label="Secures card" value={c.name} />
                ))}
                <Text style={s.small}>Counted once under assets. A card limit backed by this FD is not counted.</Text>
              </Card>
            )}
            {isLoan && (
              <Card style={{ gap: 10 }}>
                <Stat label="Interest rate" value={a.rate ? `${a.rate}% / year` : 'Not set'} />
                <Stat label="EMI" value={a.emi ? fmt(a.emi) : 'Not set'} />
                <Stat
                  label="Paid off in"
                  value={owed <= 0 ? 'Closed 🎉' : left === Infinity ? 'EMI too low' : `${left} months · ${monthLabel(addMonths(monthOf(today()), left))}`}
                />
                <Stat label={`Paid in ${year}`} value={fmt(paidYear)} />
                <Stat label={`Interest in ${year}`} value={fmt(interestYear)} />
                <Text style={s.small}>Interest is added automatically at the end of every month on the outstanding amount.</Text>
              </Card>
            )}
            <View style={[s.row, { gap: 8 }]}>
              {isCard ? (
                <>
                  <View style={{ flex: 1 }}>
                    <Btn
                      label="Pay bill"
                      icon="checkmark-circle-outline"
                      onPress={() =>
                        router.push({ pathname: '/tx', params: { type: 'x', to: a.id, from: payFrom, amt: cs.outstanding ? String(cs.outstanding / 100) : '', note: 'Card bill' } })
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Btn label="Spend" kind="ghost" icon="add" onPress={() => router.push({ pathname: '/tx', params: { from: a.id } })} />
                  </View>
                </>
              ) : isLoan ? (
                <View style={{ flex: 1 }}>
                  <Btn
                    label="Pay EMI"
                    icon="checkmark-circle-outline"
                    onPress={() => router.push({ pathname: '/tx', params: { type: 'x', to: a.id, from: payFrom, amt: a.emi ? String(a.emi / 100) : '' } })}
                  />
                </View>
              ) : (
                <>
                  {a.type !== 'fd' && (
                    <View style={{ flex: 1 }}>
                      <Btn label="Add" icon="add" onPress={() => router.push({ pathname: '/tx', params: { from: a.id } })} />
                    </View>
                  )}
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
            {isCard && all.length > 0 && (
              <Chips>
                <Chip label="All" active={show === 'all'} onPress={() => setShow('all')} />
                <Chip label="Spending" active={show === 'spend'} onPress={() => setShow('spend')} />
                <Chip label="Payments & refunds" active={show === 'pay'} onPress={() => setShow('pay')} />
              </Chips>
            )}
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
