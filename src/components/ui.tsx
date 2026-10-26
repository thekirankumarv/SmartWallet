import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmt, parseYmd, ymd } from '../lib/money';
import { catById, subName, useStore } from '../lib/store';
import type { AccountType, Tx } from '../lib/types';

export const C = {
  bg: '#0A0A0F',
  card: '#14141C',
  card2: '#1D1D28',
  line: '#272735',
  text: '#F4F4F8',
  sub: '#9C9CB0',
  dim: '#5F5F73',
  accent: '#8B7CFF',
  accentDim: '#2A2550',
  red: '#FF5D73',
  green: '#2FD9A0',
  blue: '#5AB2FF',
  amber: '#FFB547',
};
export const TX_COLOR = { e: C.red, i: C.green, x: C.blue } as const;
export const PALETTE = ['#8B7CFF', '#2FD9A0', '#FF5D73', '#5AB2FF', '#FFB547', '#FF7CE0', '#4DE1E8', '#B6E35A', '#FF9466', '#A3A3FF', '#E8C84D', '#66D19E'];

export const ACC_TYPES: [AccountType, string, string][] = [
  ['bank', 'Bank', '🏦'],
  ['cash', 'Cash', '💵'],
  ['wallet', 'Wallet', '📱'],
  ['card', 'Credit Card', '💳'],
  ['loan', 'Loan', '📉'],
];
export const isDebt = (t: AccountType) => t === 'loan' || t === 'card';
export const accTypeInfo = (t: AccountType): [label: string, icon: string] => {
  const known = ACC_TYPES.find(([k]) => k === t);
  return known ? [known[1], known[2]] : [t, '🗂️'];
};

export type IconName = ComponentProps<typeof Ionicons>['name'];
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') return window.alert(message ? `${title}\n\n${message}` : title);
  Alert.alert(title, message);
}

export function confirm(title: string, message: string | undefined, action: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onYes },
  ]);
}

export const confirmDelete = (what: string, detail: string | undefined, onYes: () => void) =>
  confirm(`Delete ${what}?`, detail ?? 'This can’t be undone.', 'Delete', onYes);

export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
export const tap = () => Platform.OS !== 'web' && Haptics.selectionAsync();

export function Screen({ children, scroll, pad = true }: { children: ReactNode; scroll?: boolean; pad?: boolean }) {
  const ins = useSafeAreaInsets();
  const style = { paddingTop: ins.top + 8, paddingHorizontal: pad ? 16 : 0 };
  if (scroll)
    return (
      <KeyboardAvoidingView style={s.fill} behavior="padding">
        <ScrollView style={s.fill} contentContainerStyle={[style, { paddingBottom: ins.bottom + 120 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  return <View style={[s.fill, style]}>{children}</View>;
}

export function Header({ title, back, right }: { title: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={s.header}>
      {back && <IconBtn name="chevron-back" onPress={goBack} />}
      <Text style={[s.h1, back && { fontSize: 22 }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={s.row}>{right}</View>
    </View>
  );
}

export function IconBtn({
  name,
  onPress,
  color = C.text,
  size = 22,
  label,
}: {
  name: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label ?? name.replace(/-outline$/, '').replace(/-/g, ' ')}
      style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.5 }]}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Chip({ label, active, onPress, color = C.accent }: { label: string; active?: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => [s.chip, active && { backgroundColor: color + '26', borderColor: color }, pressed && { opacity: 0.6 }]}
    >
      <Text style={[s.chipText, active && { color: C.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  colors,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  colors?: Partial<Record<T, string>>;
}) {
  return (
    <View style={s.seg}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => (tap(), onChange(v))} style={[s.segItem, on && { backgroundColor: colors?.[v] ?? C.accent }]}>
            <Text style={[s.segText, on && { color: '#0A0A0F' }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Btn({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
}) {
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? C.red + '22' : C.card2;
  const fg = kind === 'primary' ? '#0A0A0F' : kind === 'danger' ? C.red : C.text;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...p }: { label: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={C.dim} selectionColor={C.accent} style={s.input} {...p} />
    </View>
  );
}

export function Row({ icon, title, sub, right, onPress }: { icon?: ReactNode; title: string; sub?: string; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.rowItem, pressed && { backgroundColor: C.card2 }]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={s.small} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {right}
    </Pressable>
  );
}

export function Bubble({ emoji, color = C.card2, size = 40 }: { emoji?: string; color?: string; size?: number }) {
  return (
    <View style={[s.bubble, { width: size, height: size, borderRadius: size / 2.6, backgroundColor: color }]}>
      <Text style={{ fontSize: size * 0.48 }}>{emoji}</Text>
    </View>
  );
}

export function Bar({ value, max, color = C.accent }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={s.barBg}>
      <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Section({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={[s.row, { justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }]}>
      <Text style={s.section}>{title}</Text>
      {right}
    </View>
  );
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 48, gap: 12 }}>
      <Ionicons name={icon} size={44} color={C.dim} />
      <Text style={[s.small, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

export function TxRow({ tx, showDate }: { tx: Tx; showDate?: boolean }) {
  const cats = useStore((st) => st.cats);
  const accounts = useStore((st) => st.accounts);
  const acc = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '?';
  const c = catById(cats, tx.c);
  const title = tx.t === 'x' ? `${acc(tx.a)} → ${acc(tx.to)}` : (subName(c, tx.s) ?? c?.name ?? 'Unknown');
  const meta = [showDate && tx.d, tx.t === 'x' ? 'Transfer' : subName(c, tx.s) ? c?.name : undefined, tx.t !== 'x' && acc(tx.a)].filter(Boolean).join(' · ');
  return (
    <Row
      onPress={() => router.push({ pathname: '/tx', params: { id: tx.id } })}
      icon={<Bubble emoji={tx.t === 'x' ? '🔁' : c?.icon} />}
      title={title}
      sub={[meta, tx.n].filter(Boolean).join('  ·  ')}
      right={<Text style={[s.amt, { color: TX_COLOR[tx.t] }]}>{(tx.t === 'e' ? '-' : tx.t === 'i' ? '+' : '') + fmt(tx.amt)}</Text>}
    />
  );
}

export function pickDate(value: string, onPick: (d: string) => void) {
  if (Platform.OS !== 'android') return;
  DateTimePickerAndroid.open({
    value: parseYmd(value),
    mode: 'date',
    onChange: (e, date) => e.type === 'set' && date && onPick(ymd(date)),
  });
}

export const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginBottom: 8 },
  h1: { flex: 1, color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  chipText: { color: C.sub, fontSize: 14, fontWeight: '600' },
  seg: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segText: { color: C.sub, fontWeight: '700', fontSize: 14 },
  btn: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { color: C.sub, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14, height: 50, color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.line },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  small: { color: C.sub, fontSize: 12.5, marginTop: 2 },
  bubble: { alignItems: 'center', justifyContent: 'center' },
  amt: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barBg: { height: 8, borderRadius: 4, backgroundColor: C.card2, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  section: { color: C.text, fontSize: 17, fontWeight: '700' },
  big: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  muted: { color: C.sub, fontSize: 13, fontWeight: '600' },
});
