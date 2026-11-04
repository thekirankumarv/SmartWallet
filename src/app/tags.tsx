import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { fmt } from '../lib/money';
import { flows, tagList, useStore } from '../lib/store';
import { Btn, C, Card, Empty, Field, Header, IconBtn, Row, Screen, confirmDelete, notify } from '../components/ui';

export default function Tags() {
  const txs = useStore((st) => st.txs);
  const accounts = useStore((st) => st.accounts);
  const saved = useStore((st) => st.tags);
  const addTag = useStore((st) => st.addTag);
  const [fresh, setFresh] = useState('');
  const renameTag = useStore((st) => st.renameTag);
  const deleteTag = useStore((st) => st.deleteTag);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');

  const list = useMemo(() => {
    const spent = flows({ accounts, txs }, '', '9999').filter((f) => f.kind === 'e');
    return tagList({ tags: saved, txs }).map((g) => ({
      g,
      n: txs.filter((t) => t.g?.includes(g)).length,
      spent: spent.reduce((a, f) => a + (f.g?.includes(g) ? f.amt : 0), 0),
    }));
  }, [txs, accounts, saved]);

  const create = () => {
    const err = addTag(fresh);
    if (err) return notify('Check tag', err);
    setFresh('');
  };

  const edit = (g: string) => (setEditing(g), setName(g));
  const save = () => {
    const err = renameTag(editing!, name);
    if (err) return notify('Check tag', err);
    setEditing(undefined);
  };
  const remove = () => {
    const t = list.find((x) => x.g === editing)!;
    confirmDelete(`#${t.g}`, t.n ? `Removes the tag from ${t.n} transaction${t.n > 1 ? 's' : ''}. The transactions stay.` : undefined, () => {
      deleteTag(t.g);
      setEditing(undefined);
    });
  };

  return (
    <Screen scroll>
      <Header title="Tags" back />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Field label="New tag" value={fresh} onChangeText={setFresh} autoCapitalize="none" placeholder="e.g. milk, swiggy instamart, dmart" onSubmitEditing={create} submitBehavior="submit" returnKeyType="done" />
        </View>
        <Btn label="Add" icon="add" onPress={create} disabled={!fresh.trim()} />
      </View>
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
        <Empty icon="pricetags-outline" text={'No tags yet.\nAdd the items and shops you want to track, then pick them when adding a transaction.'} />
      ) : (
        <Card style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
          {list.map((t) => (
            <Row
              key={t.g}
              onPress={() => router.push({ pathname: '/search', params: { tag: t.g } })}
              title={`#${t.g}`}
              sub={t.n ? `${t.n} transaction${t.n > 1 ? 's' : ''}${t.spent ? ` · ${fmt(t.spent)} spent` : ''}` : 'Not used yet'}
              right={<IconBtn name="create-outline" size={18} color={C.sub} label={`Rename ${t.g}`} onPress={() => edit(t.g)} />}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
