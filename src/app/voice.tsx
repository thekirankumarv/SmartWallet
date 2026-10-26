import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { problems } from '../lib/ai';
import { pickData } from '../lib/io';
import { dayLabel, fmt } from '../lib/money';
import { catById, subName, useStore, type Draft } from '../lib/store';
import { Bubble, Btn, C, Card, Empty, Header, s, Screen, TX_COLOR, confirmDelete, goBack, notify } from '../components/ui';

const parse = (raw?: string): Draft[] => {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export default function VoiceReview() {
  const p = useLocalSearchParams<{ heard?: string; drafts?: string }>();
  const store = useStore();
  const [drafts, setDrafts] = useState(() => parse(p.drafts));
  const errs = problems(drafts, pickData(store));
  const bad = errs.filter(Boolean).length;
  const acc = (id?: string) => store.accounts.find((a) => a.id === id)?.name ?? '?';
  const drop = (i: number) => setDrafts((ds) => ds.filter((_, j) => j !== i));

  const edit = (i: number) => {
    const d = drafts[i];
    drop(i);
    router.push({
      pathname: '/tx',
      params: {
        type: d.t,
        amt: String(d.amt / 100),
        date: d.d,
        from: d.a,
        ...(d.to && { to: d.to }),
        ...(d.c && { c: d.c }),
        ...(d.s && { s: d.s }),
        ...(d.n && { note: d.n }),
      },
    });
  };

  const saveAll = () => {
    const err = store.addTxs(drafts);
    if (err) return notify('Check entries', err);
    goBack();
  };

  return (
    <Screen scroll>
      <Header title="Check entries" back />
      {!!p.heard && (
        <Card style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <Ionicons name="mic" size={18} color={C.accent} />
          <Text style={[s.muted, { flex: 1, fontStyle: 'italic' }]}>“{p.heard}”</Text>
        </Card>
      )}
      {drafts.length === 0 ? (
        <View style={{ gap: 16 }}>
          <Empty icon="checkmark-done-outline" text="Nothing left to save." />
          <Btn label="Done" onPress={goBack} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <Card style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
            {drafts.map((d, i) => {
              const c = catById(store.cats, d.c);
              const title = d.t === 'x' ? `${acc(d.a)} → ${d.to ? acc(d.to) : '?'}` : (subName(c, d.s) ?? c?.name ?? 'Pick a category');
              const meta = [dayLabel(d.d), d.t === 'x' ? 'Transfer' : subName(c, d.s) && c?.name, d.t !== 'x' && acc(d.a), d.n].filter(Boolean).join(' · ');
              return (
                <Pressable key={i} onPress={() => edit(i)} style={({ pressed }) => [s.rowItem, pressed && { backgroundColor: C.card2 }]}>
                  <Bubble emoji={d.t === 'x' ? '🔁' : (c?.icon ?? '❔')} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={[s.small, errs[i] && { color: C.red }]} numberOfLines={2}>
                      {errs[i] ? `${errs[i]} · tap to fix` : meta}
                    </Text>
                  </View>
                  <Text style={[s.amt, { color: TX_COLOR[d.t] }]}>{(d.t === 'e' ? '-' : d.t === 'i' ? '+' : '') + fmt(d.amt)}</Text>
                  <Pressable
                    hitSlop={10}
                    accessibilityLabel="Remove entry"
                    onPress={() => confirmDelete('this entry', `${fmt(d.amt)} · ${title}. It won’t be saved.`, () => drop(i))}
                  >
                    <Ionicons name="close-circle" size={22} color={C.dim} />
                  </Pressable>
                </Pressable>
              );
            })}
          </Card>
          <Text style={[s.small, { paddingHorizontal: 4 }]}>Tap an entry to edit it in full. Edited entries are saved from the editor.</Text>
          <Btn
            label={bad ? `Fix ${bad} ${bad > 1 ? 'entries' : 'entry'} to save` : `Save ${drafts.length > 1 ? `all ${drafts.length}` : ''}`.trim()}
            icon="checkmark"
            onPress={saveAll}
            disabled={!!bad}
          />
        </View>
      )}
    </Screen>
  );
}
