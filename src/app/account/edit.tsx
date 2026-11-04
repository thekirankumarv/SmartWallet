import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { calc, fmt, hm, isValidYmd, today, toPaise, uid } from '../../lib/money';
import { balances, useStore } from '../../lib/store';
import { ADJ_E, ADJ_I } from '../../lib/seed';
import type { Account, AccountType } from '../../lib/types';
import { ACC_TYPES, Btn, C, Chip, Field, Header, isDebt, s, Screen, Seg, goBack, confirmDelete, notify } from '../../components/ui';

const resolveType = (name: string, customTypes: string[]): AccountType => {
  const n = name.toLowerCase();
  return ACC_TYPES.find(([t, l]) => t === n || l.toLowerCase() === n)?.[0] ?? customTypes.find((t) => t.toLowerCase() === n) ?? name;
};

const str = (paise?: number) => (paise ? String(paise / 100) : '');
const day = (v: string) => (v.trim() ? Number(v) : undefined);
const badDay = (v: string) => !!v.trim() && !/^([1-9]|[12]\d|3[01])$/.test(v.trim());

export default function AccountEdit() {
  const { id, type: initialType } = useLocalSearchParams<{ id?: string; type?: AccountType }>();
  const store = useStore();
  const a = store.accounts.find((x) => x.id === id);
  const bal = balances(store);
  const curBal = a ? bal[a.id] : 0;
  const linkedFd = store.accounts.find((x) => x.id === a?.fd);
  const hasTx = (acc?: Account) => !!acc && store.txs.some((t) => t.a === acc.id || t.to === acc.id);

  const [name, setName] = useState(a?.name ?? '');
  const [picked, setPicked] = useState<AccountType>(a?.type ?? initialType ?? 'bank');
  const [custom, setCustom] = useState<string | null>(null);
  const customTypes = [...new Set(store.accounts.map((x) => x.type).filter((t) => !ACC_TYPES.some(([k]) => k === t)))];
  const type = custom === null ? picked : resolveType(custom.trim(), customTypes);
  const initialBalance = a && curBal ? String((isDebt(a.type) ? -curBal : curBal) / 100) : '';
  const [balance, setBalance] = useState(initialBalance);
  const [rate, setRate] = useState(a?.rate ? String(a.rate) : '');
  const [emi, setEmi] = useState(str(a?.emi));
  const [hidden, setHidden] = useState(!!a?.hidden);
  // card
  const [bank, setBank] = useState(a?.bank ?? '');
  const [secured, setSecured] = useState<'reg' | 'fd'>(a?.fd ? 'fd' : 'reg');
  const [limit, setLimit] = useState(str(a?.limit));
  const [bill, setBill] = useState(a?.bill ? String(a.bill) : '');
  const [due, setDue] = useState(a?.due ? String(a.due) : '');
  // FD: the account itself, or the one securing this card
  const fdSrc = a?.type === 'fd' ? a : linkedFd;
  const initialFd = fdSrc ? str(bal[fdSrc.id]) : '';
  const [fdAmt, setFdAmt] = useState(initialFd);
  const [ref, setRef] = useState(fdSrc?.ref ?? '');
  const [maturity, setMaturity] = useState(fdSrc?.maturity ?? '');
  const [fdRate, setFdRate] = useState(fdSrc?.fdRate ? String(fdSrc.fdRate) : '');

  const isCard = type === 'card';
  const fdBacked = isCard && secured === 'fd';

  // Sets an account to a balance: edits the opening balance if it has no history, otherwise records an adjustment.
  const setTo = (acc: Account, target: number, current: number, isNew: boolean) => {
    if (isNew || !hasTx(acc)) return store.saveAccount({ ...acc, open: acc.open + target - current });
    store.saveAccount(acc);
    const diff = target - current;
    if (diff)
      store.addTxs([{ t: diff > 0 ? 'i' : 'e', amt: Math.abs(diff), d: today(), tm: hm(new Date()), a: acc.id, c: diff > 0 ? ADJ_I : ADJ_E, n: 'Balance adjusted' }]);
  };

  const save = () => {
    if (!name.trim()) return notify('Enter a name');
    if (!type) return notify('Enter a type name');
    const n = balance.trim() ? calc(balance) : 0;
    if (isNaN(n) || n < 0 && isCard) return notify(isCard ? 'Outstanding can’t be negative' : 'Invalid balance');
    const fd = fdAmt.trim() ? calc(fdAmt) : 0;
    const lim = limit.trim() ? calc(limit) : fdBacked ? fd : 0;
    if (isCard && (isNaN(lim) || lim < 0)) return notify('Invalid credit limit');
    if (isCard && (badDay(bill) || badDay(due))) return notify('Days must be 1 to 31');
    if ((fdBacked || type === 'fd') && (isNaN(fd) || fd <= 0)) return notify('Enter the FD amount');
    if ((fdBacked || type === 'fd') && maturity.trim() && !isValidYmd(maturity.trim())) return notify('Maturity date must be YYYY-MM-DD');
    const target = isDebt(type) ? -toPaise(n) : toPaise(type === 'fd' ? fd : n);
    const fdInfo = { ref: ref.trim() || undefined, maturity: maturity.trim() || undefined, fdRate: parseFloat(fdRate) || undefined };

    let fdId: string | undefined;
    if (fdBacked) {
      const fdAcc: Account = { ...(linkedFd ?? { id: uid(), name: `${bank.trim() || name.trim()} FD`, type: 'fd', open: 0 }), ...fdInfo };
      setTo(fdAcc, toPaise(fd), linkedFd ? bal[linkedFd.id] : 0, !linkedFd);
      fdId = fdAcc.id;
    }
    const next: Account = {
      ...(a ?? { id: uid(), open: 0 }),
      name: name.trim(),
      type,
      ...(type === 'loan' ? { rate: parseFloat(rate) || 0, emi: toPaise(parseFloat(emi) || 0) } : { rate: undefined, emi: undefined }),
      ...(isCard
        ? { bank: bank.trim() || undefined, limit: toPaise(lim) || undefined, bill: day(bill), due: day(due), fd: fdId }
        : { bank: undefined, limit: undefined, bill: undefined, due: undefined, fd: undefined }),
      ...(type === 'fd' ? fdInfo : { ref: undefined, maturity: undefined, fdRate: undefined }),
      hidden: hidden || undefined,
    };
    const changed = !a || target !== curBal;
    if (changed) setTo(next, target, curBal, !a);
    else store.saveAccount(next);
    goBack();
  };

  const remove = () =>
    hasTx(a)
      ? notify('Can’t delete', 'This account has transactions. Hide it instead.')
      : confirmDelete(`"${a!.name}"`, linkedFd ? `Its FD "${linkedFd.name}" stays under Fixed Deposits as an asset.` : undefined, () => {
          const err = store.deleteAccount(a!.id);
          if (err) return notify('Can’t delete', err);
          router.dismissTo(a!.type === 'loan' ? '/loans' : '/accounts');
        });

  const fdFields = (
    <>
      <Field label="FD reference (optional)" value={ref} onChangeText={setRef} placeholder="Deposit or receipt number" />
      <Field label="Maturity date (optional)" value={maturity} onChangeText={setMaturity} placeholder="YYYY-MM-DD" />
      <Field label="FD interest rate (% per year, optional)" value={fdRate} onChangeText={setFdRate} keyboardType="decimal-pad" placeholder="e.g. 7.25" />
    </>
  );

  return (
    <Screen scroll>
      <Header title={a ? 'Edit' : type === 'loan' ? 'New loan' : isCard ? 'New credit card' : 'New account'} back />
      <View style={{ gap: 18 }}>
        <Field
          label={isCard ? 'Card name' : 'Name'}
          value={name}
          onChangeText={setName}
          placeholder={type === 'loan' ? 'e.g. Home Loan, Car Loan' : isCard ? 'e.g. HDFC Millennia' : type === 'fd' ? 'e.g. SBI FD' : 'e.g. HDFC Savings, Paytm, Cash'}
        />
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
        {isCard && (
          <>
            <Field label="Bank" value={bank} onChangeText={setBank} placeholder="e.g. HDFC Bank" />
            <View style={{ gap: 8 }}>
              <Text style={s.label}>Card type</Text>
              <Seg
                options={[
                  ['reg', 'Regular'],
                  ['fd', 'FD-backed'],
                ]}
                value={secured}
                onChange={setSecured}
              />
              <Text style={s.small}>
                {fdBacked
                  ? 'Secured against a fixed deposit. The FD is tracked under Fixed Deposits as an asset; the limit is never counted.'
                  : 'Bank-given limit with no deposit.'}
              </Text>
            </View>
            {fdBacked && (
              <>
                <Field label="FD deposit amount (₹)" value={fdAmt} onChangeText={setFdAmt} keyboardType="decimal-pad" selectTextOnFocus placeholder="e.g. 5000" />
                {fdFields}
              </>
            )}
            <Field
              label="Credit limit (₹)"
              value={limit}
              onChangeText={setLimit}
              keyboardType="decimal-pad"
              selectTextOnFocus
              placeholder={fdBacked ? 'Same as FD if empty' : 'e.g. 100000'}
            />
            <View style={[s.row, { gap: 10, alignItems: 'flex-start' }]}>
              <View style={{ flex: 1 }}>
                <Field label="Statement day" value={bill} onChangeText={setBill} keyboardType="number-pad" placeholder="1–31" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Payment due day" value={due} onChangeText={setDue} keyboardType="number-pad" placeholder="1–31" />
              </View>
            </View>
          </>
        )}
        {type === 'fd' ? (
          <>
            <Field label="Deposit amount (₹)" value={fdAmt} onChangeText={setFdAmt} keyboardType="decimal-pad" selectTextOnFocus placeholder="e.g. 5000" />
            {fdFields}
          </>
        ) : (
          <Field
            label={isCard ? 'Current outstanding (₹)' : isDebt(type) ? 'Amount owed (₹)' : a ? 'Current balance (₹)' : 'Opening balance (₹)'}
            value={balance}
            onChangeText={setBalance}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder="0"
          />
        )}
        {isCard && !!limit.trim() && !isNaN(calc(limit)) && (
          <Text style={s.small}>Available credit: {fmt(Math.max(0, toPaise(calc(limit)) - toPaise(calc(balance || '0') || 0)))}</Text>
        )}
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
        {a && <Btn label={isCard ? 'Delete card' : 'Delete account'} kind="danger" icon="trash-outline" onPress={remove} />}
      </View>
    </Screen>
  );
}
