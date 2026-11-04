// End-to-end UI test against the web build.
// Usage: npx expo start --web (port 8081), then `npm run e2e`. Requires `npx playwright install chromium` once.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';

async function run(page) {
  const log = [];
  const wait = (ms = 350) => page.waitForTimeout(ms);
  const tap = async (t) => {
    await page.getByText(t, { exact: true }).last().click({ timeout: 5000 });
    await wait();
  };
  const lab = async (t) => {
    await page.getByLabel(t, { exact: true }).last().click({ timeout: 5000 });
    await wait();
  };
  const has = async (t) => (await page.getByText(t, { exact: false }).count()) > 0;
  const not = async (t) => !(await has(t));
  const check = async (name, cond) => log.push(`${(await cond) ? 'PASS' : 'FAIL'} ${name}`);
  const keys = async (s) => {
    for (const k of s) await lab(k);
  };
  const fill = async (ph, v) => {
    await page.getByPlaceholder(ph, { exact: true }).last().fill(v);
    await wait(150);
  };
  const go = async (u, ms = 800) => {
    await page.goto(BASE + u);
    await wait(ms);
  };
  const dialog = async () => ((await page.getByTestId('dialog').count()) ? (await page.getByTestId('dialog').innerText()).replace(/\n+/g, ' | ') : '');
  const answer = async (label) => {
    await page.getByTestId('dialog').getByText(label, { exact: true }).click({ timeout: 5000 });
    await wait(400);
  };
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('smartwallet.json')));

  try {
    await page.setViewportSize({ width: 400, height: 860 });
    await page.goto(BASE + '/status');
    await page.evaluate(() => localStorage.clear());
    await go('/', 1500);

    await check('fresh install: empty, no preset accounts', has('No transactions this month'));
    await go('/accounts');
    await check('fresh install: accounts empty', has('Add your bank accounts'));
    await go('/tx');
    await check('add tx without account asks to add one', has('Add an account first'));
    await tap('Add account');
    await fill('e.g. HDFC Savings, Paytm, Cash', 'HDFC');
    await fill('0', '10000');
    await tap('Save');
    await go('/accounts');
    await check('account created with opening balance', has('₹10,000'));

    await go('/account/edit', 600);
    await fill('e.g. HDFC Savings, Paytm, Cash', 'Cash');
    await tap('💵 Cash');
    await fill('0', '500');
    await tap('Save');

    await go('/tx');
    await tap('Dairy');
    await tap('Milk');
    await keys(['4', '0', '+', '7']);
    await check('calculator 40+7 previews ₹47', has('= ₹47'));
    await tap('HDFC');
    await tap('Save');
    await go('/');
    await check('expense listed under Today', (async () => (await has('-₹47')) && (await has('Today')))());

    await tap('Milk');
    await check('tap opens edit', has('Edit transaction'));
    await keys(['Backspace', 'Backspace', '5', '4']);
    await tap('Update');
    await check('edit saved', has('-₹54'));

    await tap('Milk');
    await lab('Delete transaction');
    await check('delete asks for confirmation', (await dialog()).includes('Delete this transaction?'));
    await answer('Cancel');
    await check('cancel keeps transaction', (async () => (await has('Edit transaction')) && !(await dialog()))());
    await lab('Delete transaction');
    await answer('Delete');
    await check('confirm deletes transaction', not('-₹54'));

    await go('/tx');
    await tap('Transfer');
    await keys(['5', '0', '0']);
    await page.getByText('HDFC', { exact: true }).first().click();
    await wait(200);
    await page.getByText('Cash', { exact: true }).last().click();
    await wait(200);
    await tap('Save');
    await go('/tx');
    await tap('Income');
    await tap('Salary');
    await keys(['4', '5', '0', '0', '0']);
    await tap('HDFC');
    await tap('Save');
    await go('/accounts');
    await check('HDFC = 10000 - 500 + 45000', has('₹54,500'));
    await check('Cash = 500 + 500', has('₹1,000'));

    await go('/loans');
    await tap('Add loan');
    await fill('e.g. Home Loan, Car Loan', 'Edu Loan');
    await fill('0', '300000');
    await fill('e.g. 9.5', '9.5');
    await fill('e.g. 12500', '12500');
    await tap('Save');
    await check('loan shows payoff month', has('Ends'));
    await tap('Edu Loan');
    await tap('Pay EMI');
    await check('Pay EMI pre-fills amount', has('₹12500'));
    await tap('Save');
    await go('/loans');
    await check('EMI reduces outstanding to 2,87,500', has('₹2,87,500'));
    await go('/stats');
    await check('stats counts EMI as spending', has('₹12,500'));
    await check('stats shows income', has('₹45k'));

    await go('/account/edit', 600);
    await fill('e.g. HDFC Savings, Paytm, Cash', 'Temp Wallet');
    await tap('Save');
    const accs = (await stored()).accounts;
    const tmp = accs.find((a) => a.name === 'Temp Wallet');
    const hdfc = accs.find((a) => a.name === 'HDFC');
    await go(`/account/edit?id=${hdfc.id}`, 600);
    await tap('Delete account');
    const blocked = await dialog();
    await check('account with transactions: blocked without delete prompt', blocked.includes('Hide it instead') && !blocked.includes('Delete |'));
    await answer('OK');
    await go(`/account/edit?id=${tmp.id}`, 600);
    await tap('Delete account');
    await check('empty account delete asks confirmation', (await dialog()).includes('Delete "Temp Wallet"?'));
    await answer('Delete');
    await check('empty account deleted', Promise.resolve(!(await stored()).accounts.some((a) => a.name === 'Temp Wallet')));

    await go('/account/edit', 600);
    await fill('e.g. HDFC Savings, Paytm, Cash', 'Visa');
    await tap('💳 Credit Card');
    await fill('0', '2500');
    await tap('Save');
    await go('/accounts');
    await check('card outstanding shown as positive amount', (async () => (await has('₹2,500')) && (await not('-₹2,500')) && (await has('Overview ›')))());

    await go('/account/edit', 600);
    await fill('e.g. HDFC Savings, Paytm, Cash', 'Mutual Funds');
    await tap('+ Custom');
    await fill('e.g. Investments, Savings Jar', 'Investments');
    await fill('0', '7000');
    await tap('Save');
    await go('/accounts');
    await check('custom account type groups accounts', (async () => (await has('Investments')) && (await has('₹7,000')))());
    await go('/account/edit', 600);
    await check('custom type offered for next account', has('🗂️ Investments'));

    await fill('e.g. HDFC Savings, Paytm, Cash', 'Spare');
    await tap('Save');
    const spare = (await stored()).accounts.find((a) => a.name === 'Spare');
    await go(`/account/edit?id=${spare.id}`, 600);
    await check('zero balance field starts empty', Promise.resolve((await page.getByPlaceholder('0', { exact: true }).last().inputValue()) === ''));
    const txCount = (await stored()).txs.length;
    await fill('0', '3000.87');
    await tap('Save');
    const after = await stored();
    await check(
      'balance set on account without history is not an adjustment',
      Promise.resolve(after.txs.length === txCount && after.accounts.find((a) => a.id === spare.id).open === 300087),
    );
    await go('/accounts');
    await check('paise shown in balance and assets total', (async () => (await has('₹3,000.87')) && (await page.getByText(/\.87/).count()) >= 2)());

    await go('/category/new?kind=e', 600);
    await fill('e.g. Dairy', 'Pets');
    await fill('No budget', '500');
    await fill('Add subcategory', 'Pet Food');
    await page.keyboard.press('Enter');
    await wait(200);
    await fill('Add subcategory', 'Vet');
    await page.keyboard.press('Enter');
    await wait(200);
    await tap('Save');
    await go('/categories', 600);
    await check('new category with subcategories', has('Pet Food, Vet'));
    await tap('Pets');
    await lab('Delete Vet');
    await check('subcategory delete asks confirmation', (await dialog()).includes('subcategory "Vet"'));
    await answer('Delete');
    await tap('Save');
    await check('subcategory removed', (async () => (await has('Pet Food')) && (await not('Pet Food, Vet')))());
    await tap('Pets');
    await tap('Delete category');
    await check('category delete asks confirmation', (await dialog()).includes('Delete category "Pets"?'));
    await answer('Delete');
    await check('category deleted', not('Pets'));

    await go('/search', 600);
    await page.getByPlaceholder('Note, category, tag, account, amount…').fill('salary');
    await wait(400);
    await check('search finds salary', has('1 results'));

    await go('/');
    const mic = await page.getByLabel('Hold to add by voice', { exact: true }).boundingBox();
    await page.mouse.move(mic.x + mic.width / 2, mic.y + mic.height / 2);
    await page.mouse.down();
    await wait(300);
    await page.mouse.up();
    await wait(800);
    await check('mic without key offers setup', (await dialog()).includes('Set up voice entry'));
    await answer('Set up');
    await check('setup opens voice settings', has('Open Google AI Studio'));
    await fill('AQ.…', 'sk-' + 'x'.repeat(40));
    await tap('Check & save');
    await check('wrong key format explained', has('doesn’t look like a Gemini API key'));
    await fill('AQ.…', 'AQ.Ab8RNfake' + 'a'.repeat(40));
    await tap('Check & save');
    await page.waitForFunction(() => document.body.innerText.includes('Invalid API key'), null, { timeout: 15000 }).catch(() => {});
    await check('key rejected by Google explained', has('Invalid API key'));
    await check(
      'rejected key not saved',
      page.evaluate(() => localStorage.getItem('gemini_api_key') === null),
    );

    const cashId = (await stored()).accounts.find((a) => a.name === 'Cash').id;
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const drafts = [
      { t: 'e', amt: 4700, d: ymd, a: cashId, c: 'dairy', s: 'dairy-0' },
      { t: 'e', amt: 20500, d: ymd, a: cashId },
    ];
    await go(`/voice?heard=${encodeURIComponent('milk 47, petrol 205')}&drafts=${encodeURIComponent(JSON.stringify(drafts))}`);
    await check('review shows what was heard', has('“milk 47, petrol 205”'));
    await check('review flags entry without category', (async () => (await has('Pick a category · tap to fix')) && (await has('Fix 1 entry to save')))());
    await page.getByLabel('Remove entry', { exact: true }).last().click();
    await wait();
    await check('removing an entry asks confirmation', (await dialog()).includes('Delete this entry?'));
    await answer('Delete');
    await tap('Save');
    await check('reviewed entry saved', Promise.resolve((await stored()).txs.some((t) => t.amt === 4700 && t.s === 'dairy-0' && t.a === cashId)));

    // credit cards: regular + FD-backed, spend, limit guard, partial bill payment
    await go('/account/edit?type=card', 600);
    await fill('e.g. HDFC Millennia', 'Millennia');
    await fill('e.g. HDFC Bank', 'HDFC Bank');
    await fill('e.g. 100000', '100000');
    await page.getByPlaceholder('1–31', { exact: true }).last().fill('8');
    await tap('Save');
    await go('/account/edit?type=card', 600);
    await fill('e.g. HDFC Millennia', 'WOW');
    await fill('e.g. HDFC Bank', 'IDFC FIRST');
    await tap('FD-backed');
    await fill('e.g. 5000', '5000');
    await tap('Save');
    let st = await stored();
    const mil = st.accounts.find((a) => a.name === 'Millennia');
    const wow = st.accounts.find((a) => a.name === 'WOW');
    const fdAcc = st.accounts.find((a) => a.id === wow.fd);
    await check('regular card saved with limit and due day', Promise.resolve(mil.limit === 100000_00 && mil.due === 8 && mil.open === 0 && !mil.fd));
    await check(
      'FD-backed card: FD is a separate asset, limit defaults to FD, nothing owed',
      Promise.resolve(fdAcc?.type === 'fd' && fdAcc.open === 5000_00 && wow.limit === 5000_00 && wow.open === 0),
    );
    await go('/cards');
    await check('cards overview shows both types', (async () => (await has('🔒 FD-backed')) && (await has('Regular')) && (await has('₹1,05,000')))());

    await go('/tx');
    await tap('Shopping');
    await tap('Electronics');
    await keys(['6', '0', '0', '0', '0']);
    await tap('Millennia · ₹1,00,000 left');
    await tap('Save');
    await go(`/account/${mil.id}`);
    await check('laptop on card: outstanding 60,000, available 40,000', (async () => (await has('₹60,000')) && (await has('₹40,000')) && (await has('60% of limit used')))());
    await go('/tx');
    await tap('Shopping');
    await keys(['4', '0', '0', '0', '1']);
    await tap('Millennia · ₹40,000 left');
    await tap('Save');
    await check('spend past available credit blocked', (await dialog()).includes('Only ₹40,000 credit left on Millennia'));
    await answer('OK');

    await go(`/account/${mil.id}`);
    await tap('Pay bill');
    await check('Pay bill pre-fills outstanding', has('₹60000'));
    await keys(['Backspace', 'Backspace', 'Backspace', 'Backspace', 'Backspace', '2', '0', '0', '0', '0']);
    await tap('Save');
    st = await stored();
    const bank = st.accounts.find((a) => a.name === 'HDFC');
    const payTx = st.txs.find((t) => t.t === 'x' && t.to === mil.id);
    await check('bill paid from bank by transfer', Promise.resolve(payTx?.a === bank.id && payTx.amt === 20000_00));
    await go(`/account/${mil.id}`);
    await check('after payment: outstanding 40,000, available 60,000', (async () => (await has('₹40,000')) && (await has('₹60,000')) && (await has('Payments & refunds')))());
    await go('/stats');
    await check('repayment not counted as expense (EMI 12,500 + laptop 60,000 + milk 47)', (async () => (await has('₹72.5k')) && (await not('₹92.5k')))());

    await go('/accounts', 1000);
    // assets: HDFC 22,000 + Cash 953 + MF 7,000 + Spare 3,000.87 + FD 5,000; liabilities: Visa 2,500 + card 40,000 + loan 2,87,500
    await check('liabilities = card dues + loan, limits excluded', has('₹3,30,000'));
    await check('net worth = assets − liabilities', has('-₹2,92,046.13'));
    await check('data persists after reload (HDFC paid EMI and card bill)', has('₹22,000'));

    // loan payment from New Transaction (Loan category) must reach the loan, same as Pay EMI
    await go('/tx');
    await tap('Loan');
    await tap('EMI');
    await keys(['1', '0', '0', '0']);
    await tap('HDFC');
    await tap('Save');
    await check('Loan expense without a loan is refused', (await dialog()).includes('Pick which loan this pays'));
    await answer('OK');
    await check('loan picker offered under Loan category', has('Which loan'));
    await tap('Edu Loan');
    await tap('Save');
    await go('/loans');
    await check('EMI via New Transaction lowers outstanding to 2,86,500', has('₹2,86,500'));
    const loanPay = (await stored()).txs.find((t) => t.amt === 1000_00);
    await check('saved as a transfer to the loan, marked EMI', Promise.resolve(loanPay?.t === 'x' && loanPay.s === 'loan-0' && !loanPay.c));
    // Pay EMI switched to Expense keeps the loan selected
    await tap('Edu Loan');
    await tap('Pay EMI');
    await tap('Expense');
    await tap('Loan');
    await tap('Interest');
    await keys(['Backspace', 'Backspace', 'Backspace', 'Backspace', 'Backspace', '5', '0', '0']);
    await tap('Save');
    await go('/loans');
    await check('Pay EMI → Expense → Loan Interest lowers outstanding to 2,86,000', has('₹2,86,000'));
    const edu = (await stored()).accounts.find((a) => a.name === 'Edu Loan');
    await go(`/account/${edu.id}`);
    await check('loan history labels the payment', (async () => (await has('Loan EMI')) && (await has('Loan Interest')))());

    // tags: created once in Settings → Tags, then picked on a transaction
    await go('/tags');
    await fill('e.g. milk, swiggy instamart, dmart', 'swiggy instamart');
    await tap('Add');
    await fill('e.g. milk, swiggy instamart, dmart', '#Milk');
    await page.keyboard.press('Enter');
    await wait();
    await check('tags created in Settings', (async () => (await has('#swiggy instamart')) && (await has('#Milk')) && (await has('Not used yet')))());
    await go('/tx');
    await check('transaction offers saved tags, no typing', (async () => (await has('#swiggy instamart')) && (await page.getByPlaceholder('New tag, e.g. milk, instamart').count()) === 0)());
    await tap('Dairy');
    await keys(['3', '0']);
    await tap('#Milk');
    await tap('#swiggy instamart');
    await tap('Save');
    await check('picked tags saved on transaction', Promise.resolve((await stored()).txs.some((t) => t.amt === 3000 && t.g?.join() === 'Milk,swiggy instamart')));
    await check('tag list persisted', Promise.resolve((await stored()).tags?.join() === 'swiggy instamart,Milk'));
  } catch (e) {
    log.push('ERROR ' + e.message.split('\n')[0]);
  }
  return log;
}

const browser = await chromium.launch();
const page = await browser.newPage();
const log = await run(page);
await browser.close();
console.log(log.join('\n'));
const failed = log.filter((l) => !l.startsWith('PASS')).length;
console.log(`\n${log.length - failed}/${log.length} passed`);
process.exit(failed ? 1 : 0);
