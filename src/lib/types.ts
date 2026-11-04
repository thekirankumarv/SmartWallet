// built-in: bank, cash, wallet, card, fd, loan; any other name is a user-defined asset type
export type AccountType = string;
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
  bank?: string; // card: issuing bank
  limit?: number; // card: credit limit in paise. Never counted as an asset or liability
  bill?: number; // card: statement day of month (1-31)
  due?: number; // card: payment due day of month (1-31)
  fd?: string; // card: id of the 'fd' account securing it (FD-backed card)
  ref?: string; // fd: deposit / receipt number
  maturity?: string; // fd: 'YYYY-MM-DD'
  fdRate?: number; // fd: annual interest %
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
  g?: string[]; // tags
  auto?: 1; // generated (loan interest)
}

export interface Data {
  v: 1;
  accounts: Account[];
  cats: Category[];
  txs: Tx[];
  tags?: string[]; // user's tag list, in their order
  lastAcc?: string;
}
