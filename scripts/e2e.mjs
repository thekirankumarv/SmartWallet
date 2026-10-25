// End-to-end UI test against the web build.
// Usage: npx expo start --web (port 8081), then `npm run e2e`. Requires `npx playwright install chromium` once.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';

async function run(page) {
  const log = [];
  const dialogs = [];
  let acceptNext = true;
  page.on('dialog', async (d) => {
    dialogs.push(d.message().replace(/\n+/g, ' | '));
    await (acceptNext ? d.accept() : d.dismiss());
  });
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
    acceptNext = false;
    dialogs.length = 0;
    await lab('Delete transaction');
    await check('delete asks for confirmation', Promise.resolve(dialogs[0]?.startsWith('Delete this transaction?')));
    await check('cancel keeps transaction', has('Edit transaction'));
    acceptNext = true;
    await lab('Delete transaction');
    await wait(500);
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
    dialogs.length = 0;
    await tap('Delete account');
    await check('account with transactions: blocked without delete prompt', Promise.resolve(dialogs.length === 1 && dialogs[0].includes('Hide it instead')));
    await go(`/account/edit?id=${tmp.id}`, 600);
    dialogs.length = 0;
    await tap('Delete account');
    await wait(400);
    await check('empty account delete asks confirmation', Promise.resolve(dialogs[0]?.startsWith('Delete "Temp Wallet"?')));
    await check('empty account deleted', Promise.resolve(!(await stored()).accounts.some((a) => a.name === 'Temp Wallet')));

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
    dialogs.length = 0;
    await lab('Delete Vet');
    await check('subcategory delete asks confirmation', Promise.resolve(dialogs[0]?.includes('subcategory "Vet"')));
    await tap('Save');
    await check('subcategory removed', (async () => (await has('Pet Food')) && (await not('Pet Food, Vet')))());
    await tap('Pets');
    dialogs.length = 0;
    await tap('Delete category');
    await wait(400);
    await check('category delete asks confirmation', Promise.resolve(dialogs[0]?.startsWith('Delete category "Pets"?')));
    await check('category deleted', not('Pets'));

    await go('/search', 600);
    await page.getByPlaceholder('Note, category, account, amount…').fill('salary');
    await wait(400);
    await check('search finds salary', has('1 results'));

    await go('/accounts', 1000);
    await check('data persists after reload (HDFC paid EMI)', has('₹42,000'));
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
