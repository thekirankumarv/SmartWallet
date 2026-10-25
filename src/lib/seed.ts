import type { Category, Data } from './types';

type S = [id: string, icon: string, name: string, subs: string[]];

const EXPENSE: S[] = [
  ['dairy', '🥛', 'Dairy', ['Milk', 'Curd', 'Paneer', 'Buttermilk', 'Butter', 'Ghee', 'Cheese']],
  ['meat', '🍗', 'Meat & Eggs', ['Eggs', 'Chicken', 'Fish', 'Mutton']],
  ['fv', '🥦', 'Fruits & Vegetables', ['Fruits', 'Vegetables']],
  [
    'gro',
    '🛒',
    'Groceries',
    ['Rice & Grains', 'Atta & Flour', 'Dal & Pulses', 'Oil', 'Spices', 'Sugar & Salt', 'Snacks', 'Bakery', 'Beverages', 'Ice Cream', 'Cleaning Supplies'],
  ],
  ['food', '🍜', 'Food & Dining', ['Restaurant', 'Cafe', 'Food Delivery', 'Street Food']],
  ['home', '🏠', 'Housing', ['Rent', 'Maintenance', 'Repairs']],
  ['bills', '💡', 'Bills & Utilities', ['Electricity', 'Internet', 'Gas Cylinder', 'Mobile Recharge', 'Water', 'DTH']],
  ['loan', '🏛️', 'Loan', ['EMI', 'Interest']],
  ['veh', '🏍️', 'Vehicle', ['Petrol', 'Service', 'Engine Oil', 'Wash', 'Parking', 'Insurance', 'Emission Test']],
  ['trans', '🚕', 'Transport', ['Auto', 'Cab', 'Bus', 'Metro', 'Train']],
  ['shop', '🛍️', 'Shopping', ['Clothing', 'Footwear', 'Electronics', 'Home & Kitchen', 'Accessories']],
  ['care', '💇', 'Personal Care', ['Gym', 'Haircut', 'Skincare', 'Toiletries']],
  ['health', '🏥', 'Health', ['Medicines', 'Doctor', 'Dental', 'Lab Tests']],
  ['temple', '🛕', 'Temple & Pooja', ['Hundi', 'Pooja Items', 'Prasada', 'Flowers']],
  ['ent', '🎬', 'Entertainment', ['Movies', 'Subscriptions', 'Outing']],
  ['travel', '✈️', 'Travel', ['Tickets', 'Stay', 'Food']],
  ['gift', '🎁', 'Gifts & Donations', []],
  ['edu', '🎓', 'Education', ['Courses', 'Books']],
  ['bank', '🏦', 'Bank Charges', []],
  ['inv', '💰', 'Savings & Investment', ['Gold', 'Silver', 'SIP', 'Gold Scheme', 'Fixed Deposit', 'Emergency Fund']],
  ['other', '📦', 'Other', []],
];

const INCOME: S[] = [
  ['sal', '💼', 'Salary', []],
  ['int', '🏦', 'Interest', []],
  ['ref', '↩️', 'Refund', []],
  ['cb', '🎉', 'Cashback', []],
  ['invret', '📈', 'Investment Returns', []],
  ['gifti', '🎁', 'Gift Received', []],
  ['iother', '📦', 'Other Income', []],
];

export const ADJ_E = 'adj';
export const ADJ_I = 'iadj';
export const LOAN_CAT = 'loan';
export const INTEREST_SUB = 'loan-1';

const build =
  (kind: 'e' | 'i') =>
  ([id, icon, name, subs]: S): Category => ({
    id,
    icon,
    name,
    kind,
    subs: subs.map((n, i) => ({ id: `${id}-${i}`, name: n })),
  });

export function seed(): Data {
  return {
    v: 1,
    accounts: [],
    cats: [
      ...EXPENSE.map(build('e')),
      { id: ADJ_E, icon: '⚖️', name: 'Balance Adjustment', kind: 'e', subs: [] },
      ...INCOME.map(build('i')),
      { id: ADJ_I, icon: '⚖️', name: 'Balance Adjustment', kind: 'i', subs: [] },
    ],
    txs: [],
  };
}
