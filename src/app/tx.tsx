import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, calc, dayLabel, fmt, hm, today, toPaise } from '../lib/money';
import { useStore, type Draft } from '../lib/store';
import { ADJ_E, ADJ_I } from '../lib/seed';
import type { TxType } from '../lib/types';
import { Btn, C, Chip, Chips, Empty, IconBtn, pickDate, s, Seg, tap, TX_COLOR, goBack, confirmDelete, notify } from '../components/ui';

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+'];
const OPS = '+−×÷';

const rows = <T,>(items: T[], n: number): (T | undefined)[][] =>
  Array.from({ length: Math.ceil(items.length / n) }, (_, i) => Array.from({ length: n }, (_, j) => items[i * n + j]));

function nextExpr(expr: string, k: string) {
  if (k === '⌫') return expr.slice(0, -1);
  const last = expr.slice(-1);
  if (OPS.includes(k)) return !expr ? expr : OPS.includes(last) ? expr.slice(0, -1) + k : expr + k;
  const num = expr.split(/[+−×÷]/).pop() ?? '';
  if (k === '.' && num.includes('.')) return expr;
  if (/\.\d\d$/.test(num) || num.replace('.', '').length >= 9) return expr;
  if (num === '0' && k !== '.') return expr.slice(0, -1) + k;
  return expr + (k === '.' && !num ? '0.' : k);
}

export default function TxScreen() {
  const ins = useSafeAreaInsets();
  const p = useLocalSearchParams<{
    id?: string;
    date?: string;
    type?: TxType;
    to?: string;
    amt?: string;
    from?: string;
    c?: string;
    s?: string;
    note?: string;
  }>();
  const store = useStore();
  const editing = p.id ? store.txs.find((t) => t.id === p.id) : undefined;

  const [t, setT] = useState<TxType>(editing?.t ?? p.type ?? 'e');
  const [expr, setExpr] = useState(editing ? String(editing.amt / 100) : (p.amt ?? ''));
  const [d, setD] = useState(editing?.d ?? p.date ?? today());
  const usable = store.accounts.filter((x) => !x.hidden && x.type !== 'loan');
  const [a, setA] = useState(editing?.a ?? p.from ?? usable.find((x) => x.id === store.lastAcc)?.id ?? usable[0]?.id);
  const [to, setTo] = useState(editing?.to ?? p.to);
  const [c, setC] = useState(editing?.c ?? p.c);
  const [sub, setSub] = useState(editing?.s ?? p.s);
  const [note, setNote] = useState(editing?.n ?? p.note ?? '');
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const l = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => l.remove();
  }, []);
  const [pickCat, setPickCat] = useState(!editing && !p.c);

  const accounts = store.accounts.filter((x) => (!x.hidden || x.id === a || x.id === to) && (t === 'x' || x.type !== 'loan' || x.id === a));
  const cats = useMemo(() => store.cats.filter((x) => x.kind === t && (!x.hidden || x.id === c) && x.id !== ADJ_E && x.id !== ADJ_I), [store.cats, t, c]);
  const cat = store.cats.find((x) => x.id === c);
  const value = calc(expr);
  const hasOp = /[+−×÷]/.test(expr.slice(1));

  const press = (k: string) => {
    tap();
    setExpr((e) => nextExpr(e, k));
  };

  const switchType = (v: TxType) => {
    setT(v);
    if (cat?.kind === v) return;
    setC(undefined);
    setSub(undefined);
    setPickCat(true);
  };

  const draft = (): Draft => ({
    t,
    amt: toPaise(isNaN(value) ? 0 : value),
    d,
    tm: editing ? editing.tm : d === today() ? hm(new Date()) : undefined,
    a: a!,
    to: t === 'x' ? to : undefined,
    c: t === 'x' ? undefined : c,
    s: t === 'x' ? undefined : sub,
    n: note,
  });

  const save = (again?: boolean) => {
    const err = editing ? store.updateTx(editing.id, draft()) : store.addTxs([draft()]);
    if (err) return notify('Check entry', err);
    if (!again) return goBack();
    setExpr('');
    setNote('');
    setSub(undefined);
  };

  const remove = () =>
    confirmDelete('this transaction', `${fmt(editing!.amt)} on ${dayLabel(editing!.d)}. This can’t be undone.`, () => {
      store.deleteTx(editing!.id);
      goBack();
    });

  const color = TX_COLOR[t];
  const accountPicker = (
    <View style={st.group}>
      <Label icon="wallet-outline" text={t === 'x' ? 'From' : 'Account'} />
      <Chips>
        {accounts.map((x) => (
          <Chip key={x.id} label={x.name} active={a === x.id} onPress={() => setA(x.id)} color={color} />
        ))}
      </Chips>
    </View>
  );
  const yest = addDays(today(), -1);

  if (!usable.length && !editing)
    return (
      <View style={[s.fill, { paddingTop: ins.top + 8, paddingHorizontal: 16 }]}>
        <View style={s.header}>
          <IconBtn name="close" onPress={goBack} />
        </View>
        <Empty icon="wallet-outline" text="Add an account first: bank, cash, wallet or card." />
        <Btn label="Add account" icon="add" onPress={() => router.replace('/account/edit')} />
      </View>
    );

  return (
    <KeyboardAvoidingView style={[s.fill, { paddingTop: ins.top + 8 }]} behavior="padding">
      <View style={[s.header, { paddingHorizontal: 16 }]}>
        <IconBtn name="close" onPress={() => goBack()} />
        <Text style={[s.h1, { fontSize: 20, textAlign: 'center' }]}>{editing ? 'Edit' : 'New'} transaction</Text>
        {editing ? <IconBtn name="trash-outline" color={C.red} onPress={remove} label="Delete transaction" /> : <View style={{ width: 40 }} />}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <Seg
          options={[
            ['e', 'Expense'],
            ['i', 'Income'],
            ['x', 'Transfer'],
          ]}
          value={t}
          onChange={switchType}
          colors={TX_COLOR}
        />
        <Pressable onPress={() => setTyping(false)} style={st.amountBox}>
          <Text style={[st.amount, { color: expr ? C.text : C.dim }]} numberOfLines={1} adjustsFontSizeToFit>
            ₹{expr || '0'}
          </Text>
          <Text style={[s.small, { color: isNaN(value) ? C.red : color, minHeight: 18 }]}>
            {hasOp ? (isNaN(value) ? 'Invalid' : `= ${fmt(toPaise(value))}`) : ''}
          </Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {t === 'x' && accountPicker}
        {t === 'x' ? (
          <View style={st.group}>
            <Label icon="arrow-forward-circle-outline" text="To" />
            <Chips>
              {accounts
                .filter((x) => x.id !== a)
                .map((x) => (
                  <Chip key={x.id} label={x.name} active={to === x.id} onPress={() => setTo(x.id)} color={color} />
                ))}
            </Chips>
          </View>
        ) : (
          <View style={st.group}>
            <Label icon="pricetag-outline" text="Category" />
            {cat && !pickCat ? (
              <Pressable onPress={() => setPickCat(true)} style={[st.picked, { borderColor: color }]}>
                <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
                <Text style={[s.rowTitle, { flex: 1 }]}>{cat.name}</Text>
                <Text style={{ color: C.accent, fontWeight: '700' }}>Change</Text>
              </Pressable>
            ) : (
              <View style={st.grid}>
                {rows(cats, 4).map((row, r) => (
                  <View key={r} style={st.gridRow}>
                    {row.map((x, i) =>
                      x ? (
                        <Pressable
                          key={x.id}
                          onPress={() => (tap(), setC(x.id), setSub(undefined), setPickCat(false))}
                          style={[st.cat, x.id === c && { borderColor: color, backgroundColor: color + '1F' }]}
                        >
                          <Text style={{ fontSize: 22 }}>{x.icon}</Text>
                          <Text style={[st.catText, x.id === c && { color: C.text }]} numberOfLines={2}>
                            {x.name}
                          </Text>
                        </Pressable>
                      ) : (
                        <View key={`pad${i}`} style={st.slot} />
                      ),
                    )}
                  </View>
                ))}
              </View>
            )}
            {cat && cat.subs.some((x) => !x.hidden) && (
              <View style={st.subs}>
                {cat.subs
                  .filter((x) => !x.hidden || x.id === sub)
                  .map((x) => (
                    <Chip key={x.id} label={x.name} active={sub === x.id} onPress={() => setSub(sub === x.id ? undefined : x.id)} color={color} />
                  ))}
              </View>
            )}
          </View>
        )}

        <View style={st.group}>
          <Label icon="calendar-outline" text="Date" />
          <Chips>
            <Chip label="Today" active={d === today()} onPress={() => setD(today())} color={color} />
            <Chip label="Yesterday" active={d === yest} onPress={() => setD(yest)} color={color} />
            <Chip
              label={d !== today() && d !== yest ? dayLabel(d) : 'Pick date…'}
              active={d !== today() && d !== yest}
              onPress={() => pickDate(d, setD)}
              color={color}
            />
          </Chips>
        </View>

        {t !== 'x' && accountPicker}

        <View style={st.group}>
          <Label icon="create-outline" text="Note" />
          <TextInput
            value={note}
            onChangeText={setNote}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            placeholder="Optional"
            placeholderTextColor={C.dim}
            selectionColor={C.accent}
            style={s.input}
          />
        </View>
      </ScrollView>

      {!typing && (
        <View style={[st.pad, { paddingBottom: ins.bottom + 12 }]}>
          <View style={st.keys}>
            {rows(KEYS, 4).map((row, r) => (
              <View key={r} style={st.gridRow}>
                {row.map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => press(k!)}
                    onLongPress={k === '⌫' ? () => setExpr('') : undefined}
                    accessibilityLabel={k === '⌫' ? 'Backspace' : k}
                    style={({ pressed }) => [st.key, OPS.includes(k!) && st.op, pressed && { backgroundColor: C.line }]}
                  >
                    {k === '⌫' ? (
                      <Ionicons name="backspace-outline" size={22} color={C.text} />
                    ) : (
                      <Text style={[st.keyText, OPS.includes(k!) && { color }]}>{k}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
          <View style={[s.row, { marginTop: 10 }]}>
            {!editing && (
              <View style={{ flex: 1 }}>
                <Btn label="+ Next" kind="ghost" onPress={() => save(true)} />
              </View>
            )}
            <View style={{ flex: 2 }}>
              <Btn label={editing ? 'Update' : 'Save'} icon="checkmark" onPress={() => save()} />
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Label({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={15} color={C.sub} />
      <Text style={s.label}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  amountBox: { alignItems: 'center', paddingVertical: 8 },
  amount: { fontSize: 46, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  group: { gap: 10 },
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1 },
  cat: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 4,
  },
  catText: { color: C.sub, fontSize: 10.5, fontWeight: '600', textAlign: 'center' },
  subs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, backgroundColor: C.card },
  pad: {
    backgroundColor: C.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  keys: { gap: 8 },
  key: { flex: 1, height: 46, borderRadius: 14, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  op: { backgroundColor: C.bg },
  keyText: { color: C.text, fontSize: 22, fontWeight: '600' },
});
