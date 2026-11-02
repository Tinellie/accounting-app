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
const { parseAlipayHkHeader, findAlipayHkHeader, parseAlipayHkAmount, parseAlipayHkDate,
  partitionAlipayHkFields } = await import('../src/lib/wechat-import/alipay-hk.ts');
const { assignPreviewAccount, editPreviewRow, serializePreviewRows } = await import('../src/lib/wechat-import/preview.ts');
const box = (text, x, y = 10, right = x + 100) => ({ text, confidence: 1, box: [x, y, right, y + 30] });

test('HK headers require explicit M/YYYY, ignore summaries and preserve title years', () => {
  assert.deepEqual(parseAlipayHkHeader('10/2026∨'), { year: 2026, month: 10 });
  assert.deepEqual(parseAlipayHkHeader('1 / 2025'), { year: 2025, month: 1 });
  for (const text of ['0/2026', '13/2026', '2026/10', '10月', 'HKD 33.00', '10/2026支出']) {
    assert.equal(parseAlipayHkHeader(text), null);
  }
  assert.deepEqual(findAlipayHkHeader([box('9/', 50), box('2026', 160),
    box('支出HKD284.60', 50, 60), box('收入HKD0.00', 350, 60)], 1000), { year: 2026, month: 9, text: '9/2026' });
});

test('HK amounts require a sign, HKD and exact cents; no currency conversion or digit guessing', () => {
  assert.deepEqual(parseAlipayHkAmount('-HKD 16.50'), { type: 'expense', amount: 1650 });
  assert.deepEqual(parseAlipayHkAmount('+ HKD 1,234.56'), { type: 'income', amount: 123456 });
  assert.deepEqual(parseAlipayHkAmount('−HKD 5.90'), { type: 'expense', amount: 590 });
  for (const text of ['HKD 16.50', '-16.50', '-CNY 16.50', '-HKD 0.00', '-HKD 16.5',
    '-HKD 1,23.45', '-HKD 1O.50', '-HKD 9007199254740999.00']) {
    assert.equal(parseAlipayHkAmount(text), null);
  }
});

test('DD/MM dates validate header month/year, leap day and clock without swapping day/month', () => {
  assert.equal(parseAlipayHkDate('31/10 15:23', { year: 2026, month: 10 })?.toISOString(), '2026-10-31T07:23:00.000Z');
  assert.equal(parseAlipayHkDate('03/09 00:01', { year: 2025, month: 9 })?.toISOString(), '2025-09-02T16:01:00.000Z');
  assert.equal(parseAlipayHkDate('29/02 12:00', { year: 2024, month: 2 })?.toISOString(), '2024-02-29T04:00:00.000Z');
  for (const text of ['31/09 15:23', '31/10 24:00', '31/10 15:60', '31/09 12:00', '10-31 12:00', '3/10 12:00']) {
    assert.equal(parseAlipayHkDate(text, { year: 2026, month: 10 }), null);
  }
  assert.equal(parseAlipayHkDate('31/10 15:23', null), null);
});

test('HK fields exclude avatar and split merged descriptions while preserving HKD signs and spaces', () => {
  const fields = partitionAlipayHkFields([
    box('avatar', 30), box('SEVEN ELEVEN', 190, 10, 620), box('-HKD 9.00', 700, 10, 950),
    box('19/09 14:17', 190, 60, 480),
  ], 1000);
  assert.equal(fields.description[0].text, 'SEVEN ELEVEN');
  assert.equal(fields.amount[0].text, '-HKD 9.00');
  assert.equal(fields.date[0].text, '19/09 14:17');
  assert.equal(fields.ignored[0].text, 'avatar');
  const merged = partitionAlipayHkFields([box('Project X Ray… -HKD 110.00', 190, 10, 950), box('21/09 14:04', 190, 60)], 1000);
  assert.equal(merged.description[0].text, 'Project X Ray… ');
  assert.equal(merged.amount[0].text, '-HKD 110.00');
  const split = partitionAlipayHkFields([box('TEST', 190), box('-', 700), box('HKD', 740), box('1.00', 830),
    box('01/01 12:00', 190, 60)], 1000);
  assert.equal(split.amount.length, 3);
});

test('HK account policy applies to unified/bulk/single edits and retains JSON metadata', () => {
  const row = {
    id: -1, type: 'expense', amount: 1650, occurredAt: new Date('2026-10-31T07:23:00Z'),
    currencyMode: 'HKD', currency: 'HKD', notes: 'TEST', data: {}, importDebug: { errors: [] },
  };
  const accounts = [{ id: 1, name: 'HK wallet', currency: 'HKD' }, { id: 2, name: 'CNY wallet', currency: 'CNY' }];
  const categories = [{ id: 1, name: 'Test', type: 'expense', parentId: null }];
  assert.equal(assignPreviewAccount(row, accounts[0]).currency, 'HKD');
  assert.throws(() => assignPreviewAccount(row, accounts[1]), /港币/);
  const edited = editPreviewRow(row, { type: 'expense', amount: 1650, occurredAt: row.occurredAt, notes: 'Edited',
    accountId: 1, categoryId: 1 }, accounts, categories);
  assert.equal(serializePreviewRows([edited])[0].accountId, 1);
  assert.deepEqual(serializePreviewRows([edited])[0].data, {});
  assert.throws(() => editPreviewRow(row, { type: 'expense', amount: 1650, occurredAt: row.occurredAt,
    accountId: 2, categoryId: 1 }, accounts, categories), /港币/);
});

test('real HK screenshot imports all 26 rows, ignores summaries, preserves 4 months and exact totals (local OCR, mocked AI)', {
  skip: process.env.RUN_ALIPAY_HK_OCR !== '1' || !existsSync(path.join('data', '.example', 'alihk.jpg')), timeout: 600_000,
}, async (context) => {
  const { importScreenshot, debugRoot } = await import('../src/lib/wechat-import/server.ts');
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'mock-key';
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:8765/')) return originalFetch(url, options);
    assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
    const request = JSON.parse(JSON.parse(options.body).messages[1].content);
    assert.ok(request.transactions.every((row) => Object.keys(row).sort().join(',') === 'description,transactionId,type'));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      results: request.transactions.map((row) => ({
        transactionId: row.transactionId, categoryId: row.type === 'expense' ? 1 : 2, confidence: 0.9, explanation: 'Mock category',
      })),
    }) } }] });
  };
  const categories = [
    { id: 1, name: 'Expense', type: 'expense', parentId: null, sortOrder: 0 },
    { id: 2, name: 'Income', type: 'income', parentId: null, sortOrder: 0 },
  ];
  const result = await importScreenshot(await readFile(path.join('data', '.example', 'alihk.jpg')),
    categories, new AbortController().signal, undefined, 'alipay-hk');
  context.after(() => rm(path.join(debugRoot, result.batchId), { recursive: true, force: true }));
  assert.equal(result.source, 'alipay-hk');
  assert.equal(result.transactions.length, 26, JSON.stringify(result.transactions.map((row) => ({
    notes: row.notes, amount: row.amount, date: row.occurredAt, errors: row.importDebug.errors,
  }))));
  assert.ok(result.transactions.every((row) => row.importDebug.errors.length === 0),
    JSON.stringify(result.transactions.filter((row) => row.importDebug.errors.length).map((row) => ({
      notes: row.notes, errors: row.importDebug.errors, raw: row.importDebug.primary.boxes,
    }))));
  assert.ok(result.transactions.every((row) => row.currency === 'HKD' && row.currencyMode === 'HKD' && row.aiCategory.status === 'success'));
  const totals = {};
  for (const row of result.transactions) {
    const month = row.importDebug.header.month;
    totals[month] = (totals[month] ?? 0) + row.amount;
    assert.equal(row.type, 'expense');
    assert.ok(row.notes);
    assert.deepEqual(row.data, {});
  }
  assert.deepEqual(totals, { 10: 3300, 9: 28460, 8: 19600, 7: 83127 });
  const expected = [
    [10, 31, '15:23', 1650], [10, 13, '22:39', 1650],
    [9, 21, '14:04', 11000], [9, 19, '22:37', 2210], [9, 19, '18:49', 590],
    [9, 19, '18:04', 5300], [9, 19, '15:13', 2210], [9, 19, '14:20', 500],
    [9, 19, '14:17', 900], [9, 18, '13:03', 800], [9, 14, '17:33', 1650],
    [9, 14, '13:01', 1650], [9, 7, '18:08', 1650],
    [8, 19, '12:07', 12000], [8, 6, '22:37', 5950], [8, 5, '21:12', 1650],
    [7, 30, '11:47', 8050], [7, 28, '17:35', 13900], [7, 21, '12:12', 5150],
    [7, 16, '14:16', 12200], [7, 16, '08:50', 2500], [7, 16, '06:33', 9737],
    [7, 16, '06:23', 3850], [7, 14, '13:36', 13700], [7, 1, '11:14', 4550], [7, 1, '10:52', 9490],
  ];
  assert.deepEqual(result.transactions.map((row) => [row.occurredAt, row.amount]), expected.map(([month, day, time, amount]) => [
    new Date(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${time}:00+08:00`).toISOString(), amount,
  ]));
  assert.equal(result.transactions[0].occurredAt, '2026-10-31T07:23:00.000Z');
  assert.equal(result.transactions.at(-1).occurredAt, '2026-07-01T02:52:00.000Z');
});
