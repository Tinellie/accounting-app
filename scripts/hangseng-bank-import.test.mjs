import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.includes('/src/')) {
      return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});
const { parseBankDate, bankTableLayout, parseHangSengBankPages, recognizeBankChinese } = await import('../src/lib/wechat-import/hangseng-bank.ts');
const { readStatementPages, importHangSengPdf } = await import('../src/lib/wechat-import/hangseng-pdf.ts');
const { debugRoot } = await import('../src/lib/wechat-import/server.ts');
const text = (value, x, y = 270) => ({ text: value, x, y, width: 30 });
const page = (number, items, title = true, date = '11 Jan 2026') => ({
  page: number, width: 595.44, height: 841.68,
  items: [
    text(date, 480, 700), ...(title ? [text('TRANSACTION HISTORY', 57, 330)] : []),
    text('Date', 60, 300), text('Transaction Details', 106, 300),
    text('Deposit', 312, 300), text('Withdrawal', 386, 300), text('Balance', 460, 300), ...items,
  ],
  horizontalLines: [{ left: 56, right: 539, y: 285 }, { left: 56, right: 539, y: 80 }],
});

test('bank dates use statement year, previous December and leap years without current-year guessing', () => {
  assert.equal(parseBankDate('31 Dec', '2026-01-11'), '2025-12-31');
  assert.equal(parseBankDate('1 Jan', '2026-01-11'), '2026-01-01');
  assert.equal(parseBankDate('29 Feb', '2025-01-11'), '2024-02-29');
  assert.equal(parseBankDate('29 Feb', '2026-03-11'), null);
  for (const invalid of ['32 Aug', '1 Xxx', '0 Aug', '11 Aug 2026', '31 Apr']) {
    assert.equal(parseBankDate(invalid, '2026-09-11'), null);
  }
});

test('bounded history merges bilingual wrapped rows, inherits omitted dates and ignores balances and summary', () => {
  const rows = parseHangSengBankPages([page(1, [
    text('999.99', 430, 350), text('OUTSIDE', 106, 350),
    text('11 Dec', 64, 280), text('B/F BALANCE', 106, 280), text('9,000.00', 490, 280),
    text('31 Dec', 64), text('LONG ENGLISH', 106), text('中文', 245),
    text('DESCRIPTION', 106, 260), text('描述', 245, 260), text('1,234.56', 430, 260),
    text('ANOTHER PAYMENT', 106, 250), text('另一笔', 245, 250),
    text('(REFERENCE)', 106, 240), text('100.00', 430, 240),
    text('1 Jan', 64, 230), text('CREDIT INTEREST', 106, 230), text('存款利息', 245, 230),
    text('0.04', 367, 230), text('7,665.48', 490, 230),
    text('11 Jan', 64, 220), text('C/F BALANCE', 106, 220), text('7,665.48', 490, 220),
    text('Transaction Summary', 106, 210), text('999.99', 367, 210), text('999.99', 430, 210),
    text('Credit Interest Accrued', 106, 200), text('99.99', 367, 200),
    text('OUTSIDE', 106, 70), text('999.99', 430, 70),
  ])]);
  assert.deepEqual(rows.map(({ date, type, amount, description, data, errors }) => ({ date, type, amount, description, data, errors })), [
    { date: '2025-12-31', type: 'expense', amount: 123456, description: 'LONG ENGLISH DESCRIPTION (中文描述)', data: {}, errors: [] },
    { date: '2025-12-31', type: 'expense', amount: 10000, description: 'ANOTHER PAYMENT (REFERENCE) (另一笔)', data: {}, errors: [] },
    { date: '2026-01-01', type: 'income', amount: 4, description: 'CREDIT INTEREST (存款利息)', data: {}, errors: [] },
  ]);
});

test('wrapped rows and inherited dates survive a continuation page without the history title', () => {
  const rows = parseHangSengBankPages([
    page(1, [text('1 Jan', 64), text('WRAPPED', 106), text('跨页', 245)]),
    page(2, [text('CONTINUED', 106), text('描述', 245), text('50.00', 430),
      text('SECOND', 106, 250), text('10.00', 367, 250)], false),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].description, 'WRAPPED CONTINUED (跨页描述)');
  assert.equal(rows[0].amount, 5000);
  assert.equal(rows[1].date, '2026-01-01');
  assert.equal(rows[1].type, 'income');
  assert.deepEqual(rows.map((row) => row.errors), [[], []]);
  assert.deepEqual(rows[0].lines.map((line) => line.page), [1, 2]);
});

test('malformed dates, ambiguous/missing/signed amounts remain errors; unknown year and missing borders fail', () => {
  const rows = parseHangSengBankPages([page(1, [
    text('31 Feb', 64), text('INVALID', 106), text('100.00', 367), text('200.00', 430),
    text('2 Jan', 64, 250), text('SIGNED', 106, 250), text('20.00-', 430, 250),
    text('3 Jan', 64, 230), text('MISSING', 106, 230),
    text('4 Jan', 64, 210), text('GROUPING', 106, 210), text('1,00.00', 430, 210),
  ])]);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.errors.length > 0 && row.amount === null));
  assert.equal(rows[0].date, null);
  assert.throws(() => parseHangSengBankPages([page(1, [], true, 'unknown')]), /账单日期/);
  assert.throws(() => parseHangSengBankPages([page(1, []), page(2, [], true, '11 Feb 2026')]), /不同的账单日期/);
  assert.throws(() => bankTableLayout({ ...page(1, []), horizontalLines: [] }), /边界/);
  assert.deepEqual(parseHangSengBankPages([page(1, [], false)]), []);
});

test('extractable Chinese is not sent to OCR and failed raster OCR is explicit', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const withText = page(1, [text('中文', 245)]);
  await recognizeBankChinese(withText, bankTableLayout(withText), () => { throw Error('Must not render'); }, new AbortController().signal);
  globalThis.fetch = async () => Response.json({ boxes: [] });
  const withoutText = page(1, []);
  await assert.rejects(recognizeBankChinese(withoutText, bankTableLayout(withoutText), async () => Buffer.from('mock'), new AbortController().signal), /未识别到文字/);
});

const sampleRoot = path.join('data', '.example', 'bkhk');
const samples = ['bkhk0.pdf', 'bkhk1.pdf', 'bkhk2.pdf'];
const available = samples.every((file) => existsSync(path.join(sampleRoot, file)));
test('three real bank PDFs preserve row counts, wrapped references and exact income/expense totals without OCR', {
  skip: !available, timeout: 120_000,
}, async () => {
  for (const [file, count, income, expense] of [
    ['bkhk0.pdf', 3, 4, 201760], ['bkhk1.pdf', 2, 3, 930000], ['bkhk2.pdf', 3, 2, 230000],
  ]) {
    const pages = await readStatementPages(await readFile(path.join(sampleRoot, file)), new AbortController().signal);
    assert.equal(pages.length, 2);
    const rows = parseHangSengBankPages(pages);
    assert.equal(rows.length, count);
    assert.ok(rows.every((row) => row.errors.length === 0), file);
    assert.equal(rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0), income);
    assert.equal(rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0), expense);
    if (file === 'bkhk0.pdf') {
      assert.deepEqual(rows.map((row) => row.date), ['2026-07-25', '2026-08-06', '2026-08-06']);
      assert.equal(rows[1].description, 'ATM FCY WITHDRAWAL (06AUG26)');
      assert.equal(rows[2].description, rows[1].description);
    }
  }
});

test('full bank PDF pipeline uses local Chinese OCR, mocked AI and persists bilingual preview; no real ledger writes', {
  skip: !available || process.env.RUN_BANK_OCR !== '1', timeout: 180_000,
}, async (context) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-not-a-real-key';
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });
  const categories = [
    { id: 1, name: 'Expense', type: 'expense', parentId: null, sortOrder: 0 },
    { id: 2, name: 'Income', type: 'income', parentId: null, sortOrder: 0 },
  ];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:8765/')) return originalFetch(url, init);
    assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
    const request = JSON.parse(init.body);
    const input = JSON.parse(request.messages[1].content);
    assert.ok(input.transactions.every((row) => Object.keys(row).sort().join(',') === 'description,transactionId,type'));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      results: input.transactions.map((row) => ({
        transactionId: row.transactionId, categoryId: row.type === 'expense' ? 1 : 2,
        confidence: 0.9, explanation: 'Mock classification',
      })),
    }) } }] });
  };
  for (const [index, count] of [3, 2, 3].entries()) {
    const events = [];
    const result = await importHangSengPdf(
      await readFile(path.join(sampleRoot, samples[index])), categories, new AbortController().signal,
      (progress) => events.push(progress), 'hangseng-bank',
    );
    context.after(() => rm(path.join(debugRoot, result.batchId), { recursive: true, force: true }));
    assert.equal(result.source, 'hangseng-bank');
    assert.equal(result.transactions.length, count);
    assert.ok(result.transactions.every((row) => row.importDebug.errors.length === 0 && row.aiCategory.status === 'success'));
    assert.ok(result.transactions.every((row) => row.currencyMode === 'account' && row.accountId === null));
    assert.ok(result.transactions.every((row) => /\p{Script=Han}/u.test(row.notes)), JSON.stringify(result.transactions.map((row) => row.notes)));
    if (index === 0) {
      assert.equal(result.transactions[0].notes, 'CREDIT INTEREST (存款利息)');
      assert.equal(result.transactions[1].notes, 'ATM FCY WITHDRAWAL (06AUG26) (外幣提款)');
      assert.equal(result.transactions[2].notes, result.transactions[1].notes);
    }
    assert.ok(events.some((event) => event.stage === 'ocr' && event.status === 'complete'));
    const stored = JSON.parse(await readFile(path.join(debugRoot, result.batchId, 'result.json'), 'utf8'));
    assert.deepEqual(stored, JSON.parse(JSON.stringify(result)));
  }
});
