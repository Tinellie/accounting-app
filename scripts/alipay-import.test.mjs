import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { readFile, rm } from 'node:fs/promises';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.includes('/src/')) {
      return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});
const { parseAlipayHeader, findAlipayHeader, parseAlipayAmount, parseAlipayDate,
  partitionAlipayFields, parseAlipayStatus, reconcileAlipayRefunds } = await import('../src/lib/wechat-import/alipay.ts');
const { createTransactionSchema } = await import('../src/lib/validations.ts');

test('Alipay headers use explicit past year or supplied Chinese current year', () => {
  assert.deepEqual(parseAlipayHeader('10月', 2026), { year: 2026, month: 10 });
  assert.deepEqual(parseAlipayHeader('2025-12', 2026), { year: 2025, month: 12 });
  for (const text of ['13月', '2025-0', '10', '支出', '2025-12-01']) {
    assert.equal(parseAlipayHeader(text, 2026), null);
  }
  assert.deepEqual(findAlipayHeader([
    { text: '10', confidence: 1, box: [70, 50, 140, 130] },
    { text: '月', confidence: 1, box: [145, 75, 175, 120] },
    { text: '收入', confidence: 1, box: [500, 150, 600, 200] },
  ], 1260, 2026), { year: 2026, month: 10, text: '10月' });
});

test('amount signs and refund flags do not turn expense refunds into income', () => {
  assert.deepEqual(parseAlipayAmount('-32.19', false), { amount: 3219, type: 'expense' });
  assert.deepEqual(parseAlipayAmount('105.00', false), { amount: 10500, type: 'income' });
  assert.deepEqual(parseAlipayAmount('+105.00', true), { amount: -10500, type: 'expense' });
  assert.deepEqual(parseAlipayAmount('-105.00', true), { amount: -10500, type: 'expense' });
  for (const text of ['0.00', '105', '1O5.00', '105.0']) assert.equal(parseAlipayAmount(text, false), null);
});

test('Alipay dates preserve header year and validate month, leap year and clock', () => {
  assert.equal(parseAlipayDate('12-31 10:46', { year: 2025, month: 12 })?.toISOString(), '2025-12-31T02:46:00.000Z');
  for (const [text, header] of [
    ['12-31 10:46', null], ['11-31 10:46', { year: 2025, month: 12 }],
    ['02-29 10:46', { year: 2025, month: 2 }], ['12-31 24:46', { year: 2025, month: 12 }],
  ]) assert.equal(parseAlipayDate(text, header), null);
});

test('middle category/status text is not mixed into description, amount or date', () => {
  const boxes = [
    { text: '商品', confidence: 1, box: [0, 20, 400, 75] },
    { text: '-45.00', confidence: 1, box: [800, 20, 1000, 75] },
    { text: '退款', confidence: 1, box: [0, 130, 100, 170] },
    { text: '已全额退款', confidence: 1, box: [800, 130, 1000, 170] },
    { text: '12-31 10:46', confidence: 1, box: [0, 240, 300, 280] },
  ];
  const fields = partitionAlipayFields(boxes, 1000, 340);
  assert.deepEqual(fields.description, [boxes[0]]);
  assert.deepEqual(fields.amount, [boxes[1]]);
  assert.deepEqual(fields.date, [boxes[4]]);
  assert.deepEqual(fields.ignored, [boxes[2], boxes[3]]);
});

test('closed trades are detected only in the right status region, including separated OCR boxes', () => {
  const box = (text, left, top) => ({ text, confidence: 1, box: [left, top, left + 100, top + 30] });
  const status = (boxes) => parseAlipayStatus(partitionAlipayFields(boxes, 1000, 340), 1000);
  assert.equal(status([box('交易关闭', 800, 230)]).closed, true);
  assert.equal(status([box('交 易', 750, 140), box('关 闭', 860, 140)]).closed, true);
  assert.equal(status([box('交易关闭', 0, 20)]).closed, false);
  assert.equal(status([box('交易关闭', 0, 140)]).closed, false);
  assert.deepEqual(status([box('退款', 0, 140), box('已全额退款', 800, 140)]), {
    isRefund: true, fullyRefunded: true, closed: false,
  });
});

test('merged description and amount boxes retain the exact sign and split both fields', () => {
  for (const [text, description, amount] of [
    ['商品...-51.30', '商品...', '-51.30'],
    ['退款-TAITO梦梦·贝莉16.80', '退款-TAITO梦梦·贝莉', '16.80'],
  ]) {
    const fields = partitionAlipayFields([{ text, confidence: 1, box: [0, 20, 1000, 75] }], 1000, 340);
    assert.equal(fields.amount[0].text, amount);
    assert.equal(fields.description[0].text, description);
    assert.deepEqual(fields.ignored, []);
  }
  const invalid = partitionAlipayFields([{ text: '商品1O5.00', confidence: 1, box: [0, 20, 1000, 75] }], 1000, 340);
  assert.equal(invalid.amount.length, 0, 'Do not guess digits from malformed OCR');
});

function row(id, minute, amount, extra = {}) {
  return { id, type: 'expense', amount, occurredAt: `2026-10-04T10:${minute}:00.000Z`,
    notes: 'Test', importDebug: { errors: [] }, ...extra };
}

test('nearest equal-amount refunds match once; missing refunds inserted one minute later', () => {
  const rows = [
    row(-1, '05', 100, { fullyRefunded: true }),
    row(-2, '10', 100, { fullyRefunded: true }),
    row(-3, '09', -100, { isRefund: true }),
    row(-4, '20', -200, { isRefund: true }),
  ];
  const result = reconcileAlipayRefunds(rows);
  assert.equal(result.length, 5);
  assert.equal(result.find((r) => r.id === -3).refundOfId, -2);
  assert.equal(result.find((r) => r.id === -4).refundOfId, undefined);
  const synthetic = result.find((r) => r.syntheticRefund);
  assert.equal(synthetic.refundOfId, -1);
  assert.equal(synthetic.occurredAt, '2026-10-04T10:06:00.000Z');
  assert.equal(synthetic.amount, -100);
  assert.equal(synthetic.type, 'expense');
  assert.equal(synthetic.isRefund, true);
  assert.equal(new Set(result.map((r) => r.id)).size, result.length);
});

test('invalid dates/amounts do not produce guessed refunds and midnight rolls over', () => {
  assert.equal(reconcileAlipayRefunds([row(-1, '00', null, { fullyRefunded: true })]).length, 1);
  assert.equal(reconcileAlipayRefunds([row(-1, '00', 100, { fullyRefunded: true, occurredAt: 'invalid' })]).length, 1);
  const result = reconcileAlipayRefunds([row(-1, '00', 100, {
    fullyRefunded: true, occurredAt: '2025-12-31T23:59:00.000Z',
  })]);
  assert.equal(result[1].occurredAt, '2026-01-01T00:00:00.000Z');
});

test('transaction validation allows negative expenses, not negative income or transfers', () => {
  const input = { type: 'expense', amount: '-45.00', occurredAt: '2025-12-31T00:00:00Z',
    accountId: 1, toAccountId: null, categoryId: 1 };
  assert.equal(createTransactionSchema.parse(input).amount, -4500);
  assert.equal(createTransactionSchema.safeParse({ ...input, type: 'income' }).success, false);
  assert.equal(createTransactionSchema.safeParse({ ...input, type: 'transfer', categoryId: null, toAccountId: 2 }).success, false);
  assert.equal(createTransactionSchema.safeParse({ ...input, amount: '0' }).success, false);
});

test('real Alipay screenshots preserve every amount/date and reconcile refunds (local OCR, mocked AI)', {
  skip: process.env.RUN_ALIPAY_OCR_SAMPLES !== '1', timeout: 600_000,
}, async () => {
  const { importScreenshot, debugRoot } = await import('../src/lib/wechat-import/server.ts');
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'local-test-key';
  const categories = [
    { id: 1, name: 'Test expense', type: 'expense', parentId: null, sortOrder: 0 },
    { id: 2, name: 'Test income', type: 'income', parentId: null, sortOrder: 0 },
  ];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.deepseek.com/')) {
      const payload = JSON.parse(JSON.parse(options.body).messages.at(-1).content);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        results: payload.transactions.map((row) => ({
          transactionId: row.transactionId, categoryId: row.type === 'income' ? 2 : 1,
          confidence: 0.9, explanation: 'Local mock only',
        })),
      }) } }] });
    }
    assert.equal(new URL(url).hostname, '127.0.0.1', 'Tests must not send screenshot data externally');
    return originalFetch(url, options);
  };
  try {
    for (const [file, expected] of [
      ['ali-0.jpg', [3219, 5130, 6100, 62471, 2000, 5600, 13000, -10500, 10500, 10500, 84000, 32900, -32900, 32900, 3650, 25600, 1880]],
      ['ali-1.jpg', [-4500, 4500, -1680, 1680, 21900, 1680, 8500, 30000, -30000, 8800, 8800, 95000, 1290, -1290, 5700]],
    ]) {
      const result = await importScreenshot(await readFile(path.join('data', file)), categories, new AbortController().signal, undefined, 'alipay');
      try {
        assert.deepEqual(result.transactions.map((row) => row.amount), expected,
          JSON.stringify(result.transactions.map((row) => ({
            amount: row.amount, date: row.occurredAt, refund: row.isRefund,
            text: row.importDebug.primary.boxes.map((box) => box.text),
            errors: row.importDebug.errors,
          }))));
        assert.ok(result.transactions.every((row) => row.occurredAt && row.importDebug.errors.length === 0 && row.aiCategory.status === 'success'));
        const originals = result.transactions.filter((row) => !row.syntheticRefund);
        const dates = file === 'ali-0.jpg' ? [
          '10-16 05:32', '10-09 16:57', '10-06 18:05', '10-06 18:03', '10-06 13:06',
          '10-04 18:12', '10-04 18:08', '10-04 18:08', '10-04 18:05', '10-03 16:50',
          '09-27 23:50', '09-23 05:47', '09-23 05:45', '09-22 05:45', '09-14 19:13',
          '08-21 05:02', '08-02 18:14',
        ] : [
          '12-31 10:46', '12-31 10:28', '12-29 10:45', '12-29 10:37', '12-19 18:42',
          '12-15 08:52', '12-14 13:08', '12-05 18:48', '12-04 22:59', '12-04 22:57',
          '12-04 20:58', '12-03 03:10', '12-03 03:10',
        ];
        const year = file === 'ali-0.jpg' ? new Date(Date.now() + 28_800_000).getUTCFullYear() : 2025;
        assert.deepEqual(originals.map((row) => row.occurredAt), dates.map((text) =>
          parseAlipayDate(text, { year, month: Number(text.slice(0, 2)) }).toISOString()));
        assert.deepEqual(originals.map((row, index) => [index, row.type]).filter(([, type]) => type === 'income'),
          [[9, 'income']], 'Only the explicitly positive closed transaction is income in these samples');
        assert.ok(originals.every((row) => row.importDebug.avatarCropLeft > 0));
        assert.equal(result.transactions.filter((row) => row.syntheticRefund).length, file === 'ali-0.jpg' ? 0 : 2);
        assert.deepEqual(result.headers.map(({ year, month }) => [year, month]),
          file === 'ali-0.jpg' ? [[new Date(Date.now() + 28_800_000).getUTCFullYear(), 10],
            [new Date(Date.now() + 28_800_000).getUTCFullYear(), 9],
            [new Date(Date.now() + 28_800_000).getUTCFullYear(), 8]] : [[2025, 12]]);
        for (const refund of result.transactions.filter((row) => row.refundOfId)) {
          assert.equal(refund.categoryId, result.transactions.find((row) => row.id === refund.refundOfId).categoryId);
        }
      } finally {
        await rm(path.join(debugRoot, result.batchId), { recursive: true });
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});
