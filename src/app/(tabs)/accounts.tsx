import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fmt } from '../../lib/money';
import { balances, useStore } from '../../lib/store';
import { ACC_TYPES, Btn, Bubble, Empty, C, Card, Header, IconBtn, Row, s, Screen, Section } from '../../components/ui';

export default function Accounts() {
  const { accounts, txs } = useStore();
  const [showHidden, setShowHidden] = useState(false);
  const bal = useMemo(() => balances({ accounts, txs }), [accounts, txs]);
  const visible = accounts.filter((a) => a.type !== 'loan' && (showHidden || !a.hidden));
  const assets = accounts.filter((a) => a.type !== 'loan' && a.type !== 'card').reduce((x, a) => x + bal[a.id], 0);
  const debt = accounts.filter((a) => a.type === 'loan' || a.type === 'card').reduce((x, a) => x + Math.min(0, bal[a.id]), 0);
  const hiddenCount = accounts.filter((a) => a.hidden && a.type !== 'loan').length;

  return (
    <Screen scroll>
      <Header title="Accounts" right={<IconBtn name="add" onPress={() => router.push('/account/edit')} />} />
      <Card style={{ gap: 14 }}>
        <View>
          <Text style={s.muted}>Net worth (incl. loans)</Text>
          <Text style={[s.big, { color: assets + debt < 0 ? C.red : C.text }]}>{fmt(assets + debt, { decimals: false })}</Text>
        </View>
        <View style={[s.row, { gap: 8 }]}>
          <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: 14, padding: 10 }}>
            <Text style={s.small}>Assets</Text>
            <Text style={[s.amt, { color: C.green }]}>{fmt(assets, { decimals: false })}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: 14, padding: 10 }}>
            <Text style={s.small}>Liabilities</Text>
            <Text style={[s.amt, { color: C.red }]}>{fmt(-debt, { decimals: false })}</Text>
          </View>
        </View>
      </Card>

      {accounts.every((a) => a.type === 'loan') && (
        <View style={{ gap: 16 }}>
          <Empty icon="wallet-outline" text={'Add your bank accounts, cash, wallets and credit cards.'} />
          <Btn label="Add account" icon="add" onPress={() => router.push('/account/edit')} />
        </View>
      )}
      {ACC_TYPES.filter(([t]) => t !== 'loan').map(([type, label, icon]) => {
        const list = visible.filter((a) => a.type === type);
        if (!list.length) return null;
        const sum = list.reduce((x, a) => x + bal[a.id], 0);
        return (
          <View key={type}>
            <Section title={label} right={<Text style={s.muted}>{fmt(sum, { decimals: false })}</Text>} />
            <Card style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
              {list.map((a) => (
                <Row
                  key={a.id}
                  onPress={() => router.push(`/account/${a.id}`)}
                  icon={<Bubble emoji={icon} />}
                  title={a.name + (a.hidden ? ' (hidden)' : '')}
                  sub={type === 'loan' && a.emi ? `EMI ${fmt(a.emi, { decimals: false })} · ${a.rate ?? 0}%` : undefined}
                  right={<Text style={[s.amt, { color: bal[a.id] < 0 ? C.red : C.text }]}>{fmt(bal[a.id])}</Text>}
                />
              ))}
            </Card>
          </View>
        );
      })}
      {hiddenCount > 0 && (
        <Pressable onPress={() => setShowHidden(!showHidden)} style={{ alignSelf: 'center', marginTop: 20 }}>
          <Text style={{ color: C.accent, fontWeight: '700' }}>
            {showHidden ? 'Hide' : 'Show'} hidden accounts ({hiddenCount})
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}
