import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { fmt } from '../lib/money';
import { allTags, flows, useStore } from '../lib/store';
import { Btn, C, Card, Empty, Field, Header, IconBtn, Row, Screen, confirmDelete, notify } from '../components/ui';

export default function Tags() {
  const txs = useStore((st) => st.txs);
  const accounts = useStore((st) => st.accounts);
  const renameTag = useStore((st) => st.renameTag);
  const deleteTag = useStore((st) => st.deleteTag);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');

  const list = useMemo(() => {
    const spent = flows({ accounts, txs }, '', '9999').filter((f) => f.kind === 'e');
    return allTags(txs).map((g) => ({
      g,
      n: txs.filter((t) => t.g?.includes(g)).length,
      spent: spent.reduce((a, f) => a + (f.g?.includes(g) ? f.amt : 0), 0),
    }));
  }, [txs, accounts]);

  const edit = (g: string) => (setEditing(g), setName(g));
  const save = () => {
    const err = renameTag(editing!, name);
    if (err) return notify('Check tag', err);
    setEditing(undefined);
  };
  const remove = () => {
    const t = list.find((x) => x.g === editing)!;
    confirmDelete(`#${t.g}`, `Removes the tag from ${t.n} transaction${t.n > 1 ? 's' : ''}. The transactions stay.`, () => {
      deleteTag(t.g);
      setEditing(undefined);
    });
  };

  return (
    <Screen scroll>
      <Header title="Tags" back />
      {editing && (
        <Card style={{ gap: 12, marginBottom: 14 }}>
          <Field label={`Rename #${editing}`} value={name} onChangeText={setName} autoFocus autoCapitalize="none" onSubmitEditing={save} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Btn label="Delete" kind="danger" icon="trash-outline" onPress={remove} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn label="Cancel" kind="ghost" onPress={() => setEditing(undefined)} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn label="Save" onPress={save} />
            </View>
          </View>
        </Card>
      )}
      {list.length === 0 ? (
        <Empty icon="pricetags-outline" text={'No tags yet.\nAdd one while entering a transaction, e.g. milk or instamart.'} />
      ) : (
        <Card style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
          {list.map((t) => (
            <Row
              key={t.g}
              onPress={() => router.push({ pathname: '/search', params: { tag: t.g } })}
              title={`#${t.g}`}
              sub={`${t.n} transaction${t.n > 1 ? 's' : ''}${t.spent ? ` · ${fmt(t.spent)} spent` : ''}`}
              right={<IconBtn name="create-outline" size={18} color={C.sub} label={`Rename ${t.g}`} onPress={() => edit(t.g)} />}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
