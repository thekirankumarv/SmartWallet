export type AccountType = 'bank' | 'cash' | 'wallet' | 'card' | 'loan';
export type TxType = 'e' | 'i' | 'x'; // expense, income, transfer
export type CatKind = 'e' | 'i';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  open: number; // opening balance in paise (loans/cards negative)
  hidden?: boolean;
  rate?: number; // loan: annual interest %
  emi?: number; // loan: monthly payment in paise
  accrued?: string; // loan: last 'YYYY-MM' interest was posted for
}

export interface Sub {
  id: string;
  name: string;
  hidden?: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  kind: CatKind;
  budget?: number; // monthly, paise
  hidden?: boolean;
  subs: Sub[];
}

export interface Tx {
  id: string;
  t: TxType;
  amt: number;
  d: string;
  tm?: string; // 'HH:mm'
  a: string; // account (from, for transfers)
  to?: string; // transfer target
  c?: string;
  s?: string;
  n?: string; // note
  auto?: 1; // generated (loan interest)
}

export interface Data {
  v: 1;
  accounts: Account[];
  cats: Category[];
  txs: Tx[];
  lastAcc?: string;
}
