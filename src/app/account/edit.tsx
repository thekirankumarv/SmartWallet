import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { calc, hm, today, toPaise, uid } from '../../lib/money';
import { balances, useStore } from '../../lib/store';
import { ADJ_E, ADJ_I } from '../../lib/seed';
import type { Account, AccountType } from '../../lib/types';
import { ACC_TYPES, Btn, C, Chip, Field, Header, isDebt, s, Screen, goBack, confirmDelete, notify } from '../../components/ui';

const resolveType = (name: string, customTypes: string[]): AccountType => {
  const n = name.toLowerCase();
  return ACC_TYPES.find(([t, l]) => t === n || l.toLowerCase() === n)?.[0] ?? customTypes.find((t) => t.toLowerCase() === n) ?? name;
};

export default function AccountEdit() {
  const { id, type: initialType } = useLocalSearchParams<{ id?: string; type?: AccountType }>();
  const store = useStore();
  const a = store.accounts.find((x) => x.id === id);
  const curBal = a ? balances(store)[a.id] : 0;

  const [name, setName] = useState(a?.name ?? '');
  const [picked, setPicked] = useState<AccountType>(a?.type ?? initialType ?? 'bank');
  const [custom, setCustom] = useState<string | null>(null);
  const customTypes = [...new Set(store.accounts.map((x) => x.type).filter((t) => !ACC_TYPES.some(([k]) => k === t)))];
  const type = custom === null ? picked : resolveType(custom.trim(), customTypes);
  const initialBalance = a && curBal ? String((isDebt(a.type) ? -curBal : curBal) / 100) : '';
  const hasTxs = !!a && store.txs.some((t) => t.a === a.id || t.to === a.id);
  const [balance, setBalance] = useState(initialBalance);
  const [rate, setRate] = useState(a?.rate ? String(a.rate) : '');
  const [emi, setEmi] = useState(a?.emi ? String(a.emi / 100) : '');
  const [hidden, setHidden] = useState(!!a?.hidden);

  const save = () => {
    if (!name.trim()) return notify('Enter a name');
    if (!type) return notify('Enter a type name');
    const n = balance.trim() ? calc(balance) : 0;
    if (isNaN(n)) return notify('Invalid balance');
    const target = isDebt(type) ? -toPaise(n) : toPaise(n);
    const r = parseFloat(rate) || 0;
    const e = toPaise(parseFloat(emi) || 0);
    const next: Account = {
      ...(a ?? { id: uid(), open: target }),
      name: name.trim(),
      type,
      ...(type === 'loan' ? { rate: r, emi: e } : { rate: undefined, emi: undefined }),
      hidden: hidden || undefined,
    };
    const changed = !!a && balance.trim() !== initialBalance && target !== curBal;
    if (changed && !hasTxs) next.open = target;
    store.saveAccount(next);
    if (changed && hasTxs) {
      const diff = target - curBal;
      store.addTxs([
        { t: diff > 0 ? 'i' : 'e', amt: Math.abs(diff), d: today(), tm: hm(new Date()), a: a.id, c: diff > 0 ? ADJ_I : ADJ_E, n: 'Balance adjusted' },
      ]);
    }
    goBack();
  };

  const remove = () =>
    hasTxs
      ? notify('Can’t delete', 'This account has transactions. Hide it instead.')
      : confirmDelete(`"${a!.name}"`, undefined, () => {
          const err = store.deleteAccount(a!.id);
          if (err) return notify('Can’t delete', err);
          router.dismissTo(a!.type === 'loan' ? '/loans' : '/accounts');
        });

  return (
    <Screen scroll>
      <Header title={a ? 'Edit' : type === 'loan' ? 'New loan' : 'New account'} back />
      <View style={{ gap: 18 }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder={type === 'loan' ? 'e.g. Home Loan, Car Loan' : 'e.g. HDFC Savings, Paytm, Cash'} />
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ACC_TYPES.map(([t, l, i]) => (
              <Chip key={t} label={`${i} ${l}`} active={custom === null && picked === t} onPress={() => (setPicked(t), setCustom(null))} />
            ))}
            {customTypes.map((t) => (
              <Chip key={t} label={`🗂️ ${t}`} active={custom === null && picked === t} onPress={() => (setPicked(t), setCustom(null))} />
            ))}
            <Chip label="+ Custom" active={custom !== null} onPress={() => setCustom('')} />
          </View>
          {custom !== null && <Field label="Custom type" value={custom} onChangeText={setCustom} placeholder="e.g. Investments, Savings Jar" autoFocus />}
        </View>
        <Field
          label={isDebt(type) ? 'Amount owed (₹)' : a ? 'Current balance (₹)' : 'Opening balance (₹)'}
          value={balance}
          onChangeText={setBalance}
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholder="0"
        />
        {type === 'loan' && (
          <>
            <Field label="Interest rate (% per year)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="e.g. 9.5" />
            <Field label="EMI (₹ per month)" value={emi} onChangeText={setEmi} keyboardType="decimal-pad" placeholder="e.g. 12500" />
          </>
        )}
        {a && (
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.rowTitle}>Hide account</Text>
            <Switch value={hidden} onValueChange={setHidden} trackColor={{ true: C.accent, false: C.card2 }} thumbColor={C.text} />
          </View>
        )}
        <Btn label="Save" icon="checkmark" onPress={save} />
        {a && <Btn label="Delete account" kind="danger" icon="trash-outline" onPress={remove} />}
      </View>
    </Screen>
  );
}
