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
const { parseStatementDate, parseStatementAmount, parseHangSengPages } = await import('../src/lib/wechat-import/hangseng.ts');
const { readStatementPages, importHangSengPdf } = await import('../src/lib/wechat-import/hangseng-pdf.ts');
const { debugRoot } = await import('../src/lib/wechat-import/server.ts');
const { assignPreviewAccount, editPreviewRow, serializePreviewRows } = await import('../src/lib/wechat-import/preview.ts');

const text = (value, x, y = 450) => ({ text: value, x, y, width: 30 });
const page = (number, items) => ({
  page: number, width: 595.44, height: 841.68,
  items: [text('TRANS DATE', 24.7, 493.6), ...items],
  horizontalLines: [{ left: 15.6, right: 587, y: 486.3 }, { left: 15.6, right: 587, y: 148.9 }],
});
const transaction = (y = 450, amount = '1,234.56') => [
  text('06 AUG 2026', 25.2, y), text('08 AUG 2026', 90.7, y),
  text('TEST SHOP', 156.2, y), text('TOKYO', 281, y), text('JP', 353, y), text(amount, 540, y),
];

test('statement dates and trailing-minus amounts parse exactly without guessing invalid values', () => {
  assert.equal(parseStatementDate('06 AUG 2026'), '2026-08-06');
  assert.equal(parseStatementDate('29 FEB 2024'), '2024-02-29');
  for (const invalid of ['29 FEB 2026', '31 APR 2026', '00 AUG 2026', '06 XXX 2026', '06 AUG 26']) {
    assert.equal(parseStatementDate(invalid), null);
  }
  assert.deepEqual(parseStatementAmount('3,000.00-'), { amount: 300000, type: 'income' });
  assert.deepEqual(parseStatementAmount('1,234.56'), { amount: 123456, type: 'expense' });
  for (const invalid of ['-3,000.00', '3,00.00', '1O.00', '1.0', '0.00', '9007199254740999.00']) {
    assert.equal(parseStatementAmount(invalid), null);
  }
});

test('parse only the bounded table, skip opening balance/footer, and combine address with description', () => {
  const rows = parseHangSengPages([page(1, [
    ...transaction(600), ...transaction(100), text('OPENING BALANCE', 156, 470), text('100.00', 540, 470),
    ...transaction(), text('***** FINANCE CHARGE RATES *****', 150, 300),
    ...transaction(280, '999.99'),
  ])]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'TEST SHOP (TOKYO)');
  assert.deepEqual(rows[0].data, { address: 'TOKYO', regionCode: 'JP', postingDate: '2026-08-08' });
  assert.deepEqual(rows[0].errors, []);
});

test('metadata belongs to the preceding transaction even across page boundaries', () => {
  const rows = parseHangSengPages([
    page(1, transaction()),
    page(2, [
      text('(FOREIGN CURRENCY AMOUNT: JPY 12,150)', 156, 470),
      text('(EXCHANGE RATE*: 0.050436)', 156, 458),
      text('CRI: A07626273', 156, 446), text('(PURCHASE ID: P94557498)', 156, 434),
      ...transaction(420, '100.00-'),
      text('(FOREIGN CURRENCY AMOUNT: USD 100.00)', 156, 408),
      text('(EXCHANGE RATE: 7.996600)', 156, 396),
    ]),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].data, {
    postingDate: '2026-08-08', address: 'TOKYO', regionCode: 'JP',
    foreignCurrencyAmount: { currency: 'JPY', amount: '12150' },
    exchangeRate: '0.050436', cri: 'A07626273', purchaseId: 'P94557498',
  });
  assert.equal(rows[0].lines.at(-1).page, 2);
  assert.equal(rows[1].type, 'income');
  assert.deepEqual(rows[1].data.foreignCurrencyAmount, { currency: 'USD', amount: '100.00' });
  assert.equal(rows[1].data.exchangeRate, '7.996600');
});

test('invalid primary/metadata lines remain explicit errors, while orphan metadata and missing boxes fail', () => {
  const items = transaction();
  items[0].text = '31 FEB 2026';
  items.at(-1).text = 'broken';
  const rows = parseHangSengPages([page(1, [...items, text('(EXCHANGE RATE*: broken)', 156, 430)])]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].errors.length, 3);
  assert.throws(() => parseHangSengPages([page(1, [text('CRI: orphan', 156)])]), /没有所属交易/);
  assert.throws(() => parseHangSengPages([{ ...page(1, transaction()), horizontalLines: [] }]), /边界/);
  assert.deepEqual(parseHangSengPages([{ ...page(1, transaction()), items: transaction() }]), []);
});

test('PDF preview accepts any account currency in mapping/editing and preserves metadata in save DTO', () => {
  const original = {
    id: -1, type: 'expense', amount: 123456, occurredAt: new Date('2026-08-06T00:00:00+08:00'),
    currencyMode: 'account', notes: 'TEST', data: { exchangeRate: '7.996600', purchaseId: 'P123' },
    importDebug: { errors: [] },
  };
  const accounts = [{ id: 1, currency: 'USD', name: 'USD card' }];
  const categories = [{ id: 1, name: 'Test', type: 'expense', parentId: null }];
  const assigned = assignPreviewAccount(original, accounts[0]);
  assert.equal(assigned.currency, 'USD');
  const edited = editPreviewRow(assigned, {
    type: 'expense', amount: 200, occurredAt: original.occurredAt,
    accountId: 1, categoryId: 1, notes: 'Edited',
  }, accounts, categories);
  assert.deepEqual(serializePreviewRows([edited])[0].data, original.data);
  assert.throws(() => assignPreviewAccount({ ...original, currencyMode: undefined }, accounts[0]), /人民币/);
});

test('invalid PDF content and pre-aborted reads fail explicitly', async () => {
  await assert.rejects(readStatementPages(new TextEncoder().encode('not a PDF'), new AbortController().signal), /有效 PDF/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(readStatementPages(new TextEncoder().encode('%PDF-1.7'), abort.signal), /abort/i);
});

const sampleRoot = existsSync(path.join('data', 'visa0.pdf')) ? 'data' : path.join('data', '.example');
const samplesAvailable = ['visa0.pdf', 'visa1.pdf', 'visa2.pdf'].every((file) => existsSync(path.join(sampleRoot, file)));
test('three real PDFs preserve exact row totals, trailing-minus incomes and cross-page attachments', {
  skip: !samplesAvailable, timeout: 120_000,
}, async () => {
  for (const [file, count, net, pagesCount] of [
    ['visa0.pdf', 65, 766892, 6], ['visa1.pdf', 24, -911190, 4], ['visa2.pdf', 14, 123843, 3],
  ]) {
    const pages = await readStatementPages(await readFile(path.join(sampleRoot, file)), new AbortController().signal);
    assert.equal(pages.length, pagesCount);
    const rows = parseHangSengPages(pages);
    assert.equal(rows.length, count);
    assert.ok(rows.every((row) => row.errors.length === 0), file);
    assert.equal(rows.reduce((sum, row) => sum + (row.type === 'expense' ? row.amount : -row.amount), 0), net);
    if (file === 'visa0.pdf') {
      const crossPage = rows.filter((row) => new Set(row.lines.map((line) => line.page)).size > 1);
      assert.equal(crossPage.length, 3);
      assert.deepEqual(crossPage[0].data.foreignCurrencyAmount, { currency: 'USD', amount: '16.95' });
      assert.equal(crossPage[0].data.purchaseId, 'c50aa23e-d337-41cb-a009-6');
      assert.equal(crossPage[1].data.purchaseId, '7862730579446928303008');
      assert.equal(crossPage[2].data.exchangeRate, '0.050433');
      const jpy = rows.find((row) => row.data.foreignCurrencyAmount?.amount === '12150');
      assert.equal(jpy.data.foreignCurrencyAmount.currency, 'JPY');
      assert.equal(jpy.description, 'JR EAST SHOPPING CENTER (SIBUYAKU)');
    }
  }
});

test('real PDF import builds editable metadata preview with AI mocked; no PDF/private data leaves the process', {
  skip: !samplesAvailable, timeout: 120_000,
}, async (context) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-not-a-real-key';
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('https://api.deepseek.com/'));
    requests++;
    const payload = JSON.parse(JSON.parse(options.body).messages.at(-1).content);
    assert.ok(payload.transactions.every((row) => Object.keys(row).sort().join() === 'description,transactionId,type'));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      results: payload.transactions.map((row) => ({
        transactionId: row.transactionId, categoryId: row.type === 'income' ? 2 : 1,
        confidence: 0.9, explanation: 'Local test only',
      })),
    }) } }] });
  };
  const result = await importHangSengPdf(await readFile(path.join(sampleRoot, 'visa1.pdf')), [
    { id: 1, name: 'Expense', type: 'expense', parentId: null, sortOrder: 0 },
    { id: 2, name: 'Income', type: 'income', parentId: null, sortOrder: 0 },
  ], new AbortController().signal);
  try {
    assert.ok(requests > 0);
    assert.equal(result.source, 'hangseng');
    assert.equal(result.transactions.length, 24);
    assert.ok(result.transactions.every((row) => row.currencyMode === 'account' && !row.importDebug.errors.length && row.aiCategory.status === 'success'));
    assert.ok(result.transactions.some((row) => row.data.cri && row.data.purchaseId));
    const stored = JSON.parse(await readFile(path.join(debugRoot, result.batchId, 'result.json'), 'utf8'));
    assert.deepEqual(stored, result);
  } finally {
    await rm(path.join(debugRoot, result.batchId), { recursive: true });
  }
});
