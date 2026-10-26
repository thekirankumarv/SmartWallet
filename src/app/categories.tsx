import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { fmt } from '../lib/money';
import { ADJ_E, ADJ_I } from '../lib/seed';
import { useStore } from '../lib/store';
import { Bubble, C, Card, Header, IconBtn, Row, s, Screen, Seg } from '../components/ui';

export default function Categories() {
  const cats = useStore((st) => st.cats);
  const [kind, setKind] = useState<'e' | 'i'>('e');
  const list = cats.filter((c) => c.kind === kind && c.id !== ADJ_E && c.id !== ADJ_I);
  const total = list.reduce((a, c) => a + (c.hidden ? 0 : (c.budget ?? 0)), 0);

  return (
    <Screen scroll>
      <Header title="Categories" back right={<IconBtn name="add" onPress={() => router.push({ pathname: '/category/[id]', params: { id: 'new', kind } })} />} />
      <Seg
        options={[
          ['e', 'Expense'],
          ['i', 'Income'],
        ]}
        value={kind}
        onChange={setKind}
        colors={{ e: C.red, i: C.green }}
      />
      {kind === 'e' && total > 0 && <Text style={[s.muted, { marginTop: 14 }]}>Total monthly budget: {fmt(total)}</Text>}
      <Card style={{ paddingVertical: 6, paddingHorizontal: 10, marginTop: 14 }}>
        {list.map((c) => (
          <View key={c.id} style={{ opacity: c.hidden ? 0.45 : 1 }}>
            <Row
              onPress={() => router.push({ pathname: '/category/[id]', params: { id: c.id } })}
              icon={<Bubble emoji={c.icon} />}
              title={c.name + (c.hidden ? ' (hidden)' : '')}
              sub={
                c.subs
                  .filter((x) => !x.hidden)
                  .map((x) => x.name)
                  .join(', ') || 'No subcategories'
              }
              right={
                <View style={[s.row, { gap: 6 }]}>
                  {!!c.budget && <Text style={[s.small, { marginTop: 0 }]}>{fmt(c.budget)}</Text>}
                  <Ionicons name="chevron-forward" size={18} color={C.dim} />
                </View>
              }
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
