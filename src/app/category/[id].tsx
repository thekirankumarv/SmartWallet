import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { toPaise, uid } from '../../lib/money';
import { useStore } from '../../lib/store';
import type { Category, Sub } from '../../lib/types';
import { Btn, C, Card, Field, Header, s, Screen, goBack, confirmDelete, notify } from '../../components/ui';

export default function CategoryEdit() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: 'e' | 'i' }>();
  const store = useStore();
  const existing = store.cats.find((c) => c.id === id);
  const k = existing?.kind ?? kind ?? 'e';

  const [icon, setIcon] = useState(existing?.icon ?? '📁');
  const [name, setName] = useState(existing?.name ?? '');
  const [budget, setBudget] = useState(existing?.budget ? String(existing.budget / 100) : '');
  const [hidden, setHidden] = useState(!!existing?.hidden);
  const [subs, setSubs] = useState<Sub[]>(existing?.subs ?? []);
  const [newSub, setNewSub] = useState('');

  const used = (sid: string) => store.txs.some((t) => t.c === id && t.s === sid);

  const addSub = () => {
    const n = newSub.trim();
    if (!n) return;
    if (subs.some((x) => x.name.toLowerCase() === n.toLowerCase())) return notify('Already exists');
    setSubs([...subs, { id: uid(), name: n }]);
    setNewSub('');
  };

  const removeSub = (x: Sub) => {
    if (used(x.id)) return notify('In use', 'This subcategory has transactions. Hide it instead.');
    confirmDelete(`subcategory "${x.name}"`, 'Removed when you tap Save.', () => setSubs((cur) => cur.filter((y) => y.id !== x.id)));
  };

  const save = () => {
    if (!name.trim()) return notify('Enter a name');
    if (subs.some((x) => !x.name.trim())) return notify('Subcategory names can’t be empty');
    const b = toPaise(parseFloat(budget) || 0);
    const c: Category = {
      id: existing?.id ?? uid(),
      kind: k,
      icon: icon.trim() || '📁',
      name: name.trim(),
      subs: subs.map((x) => ({ ...x, name: x.name.trim() })),
    };
    if (b > 0 && k === 'e') c.budget = b;
    if (hidden) c.hidden = true;
    store.saveCategory(c);
    goBack();
  };

  const remove = () =>
    store.txs.some((t) => t.c === existing!.id)
      ? notify('Can’t delete', 'This category has transactions. Hide it instead.')
      : confirmDelete(`category "${existing!.name}"`, 'Its subcategories will be deleted too. This can’t be undone.', () => {
          const err = store.deleteCategory(existing!.id);
          if (err) notify('Can’t delete', err);
          else goBack();
        });

  return (
    <Screen scroll>
      <Header title={existing ? 'Edit category' : 'New category'} back />
      <View style={{ gap: 18 }}>
        <View style={[s.row, { gap: 12, alignItems: 'flex-end' }]}>
          <View style={{ width: 76, gap: 6 }}>
            <Text style={s.label}>Icon</Text>
            <TextInput value={icon} onChangeText={(v) => setIcon([...v].slice(-2).join(''))} style={[s.input, { textAlign: 'center', fontSize: 24 }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Dairy" />
          </View>
        </View>
        {k === 'e' && <Field label="Monthly budget (₹)" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="No budget" />}

        <View style={{ gap: 8 }}>
          <Text style={s.label}>Subcategories</Text>
          <Card style={{ paddingVertical: 4, paddingHorizontal: 12 }}>
            {subs.map((x, i) => (
              <View key={x.id} style={[s.row, { paddingVertical: 4, opacity: x.hidden ? 0.45 : 1 }]}>
                <TextInput
                  value={x.name}
                  onChangeText={(v) => setSubs(subs.map((y, j) => (j === i ? { ...y, name: v } : y)))}
                  style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 8 }}
                  selectionColor={C.accent}
                />
                <Pressable hitSlop={8} onPress={() => setSubs(subs.map((y, j) => (j === i ? { ...y, hidden: !y.hidden || undefined } : y)))}>
                  <Ionicons name={x.hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.sub} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => removeSub(x)} style={{ marginLeft: 10 }} accessibilityLabel={`Delete ${x.name}`}>
                  <Ionicons name="trash-outline" size={20} color={C.red} />
                </Pressable>
              </View>
            ))}
            <View style={[s.row, { paddingVertical: 4 }]}>
              <TextInput
                value={newSub}
                onChangeText={setNewSub}
                onSubmitEditing={addSub}
                placeholder="Add subcategory"
                placeholderTextColor={C.dim}
                style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 8 }}
                selectionColor={C.accent}
                returnKeyType="done"
                submitBehavior="submit"
              />
              <Pressable hitSlop={8} onPress={addSub}>
                <Ionicons name="add-circle" size={26} color={C.accent} />
              </Pressable>
            </View>
          </Card>
        </View>

        {existing && (
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.rowTitle}>Hide category</Text>
            <Switch value={hidden} onValueChange={setHidden} trackColor={{ true: C.accent, false: C.card2 }} thumbColor={C.text} />
          </View>
        )}
        <Btn label="Save" icon="checkmark" onPress={save} />
        {existing && <Btn label="Delete category" kind="danger" icon="trash-outline" onPress={remove} />}
      </View>
    </Screen>
  );
}
