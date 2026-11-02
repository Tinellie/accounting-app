import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
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
const { chinaToday, validScreenshotDate, parseCmbMonth, parseCmbDay, parseCmbCardTime,
  parseCmbTime, parseCmbAmount, partitionCmbFields, cmbCardGroups } = await import('../src/lib/wechat-import/cmb.ts');
const { splitCmbRows } = await import('../src/lib/wechat-import/image.ts');
const box = (text, bounds) => ({ text, confidence: 1, box: bounds });

test('CMB screenshot date uses Beijing today and rejects invalid calendar dates', () => {
  assert.equal(chinaToday(new Date('2026-12-31T16:05:00Z')), '2027-01-01');
  assert.equal(validScreenshotDate('2024-02-29'), true);
  for (const value of ['2025-02-29', '2026-13-01', '2026-10-32', '', '2026-1-01']) {
    assert.equal(validScreenshotDate(value), false);
  }
});

test('CMB month headers combine separate smaller year and ignore analysis at right', () => {
  assert.deepEqual(parseCmbMonth([
    box('10', [120, 20, 250, 150]), box('月', [250, 60, 320, 150]),
    box('分析', [1000, 100, 1100, 180]),
  ], 1260, '2026-10-24'), { year: 2026, month: 10, text: '10月' });
  assert.deepEqual(parseCmbMonth([
    box('8月', [120, 20, 270, 150]), box('/2025', [280, 100, 420, 150]),
  ], 1260, '2026-10-24'), { year: 2025, month: 8, text: '8月/2025' });
  assert.equal(parseCmbMonth([box('结余', [120, 20, 300, 80])], 1260, '2026-10-24'), null);
});

test('CMB dates associate day headers and handle relative dates across month/year boundaries', () => {
  const month = { year: 2026, month: 10 };
  assert.deepEqual(parseCmbDay('10.22', month, '2026-10-24'), { ...month, day: 22 });
  assert.deepEqual(parseCmbDay('今天', month, '2026-10-24'), { ...month, day: 24 });
  assert.deepEqual(parseCmbDay('昨天', { year: 2025, month: 12 }, '2026-01-01'), { year: 2025, month: 12, day: 31 });
  assert.equal(parseCmbDay('今天', month, '2026-11-01'), null);
  assert.equal(parseCmbDay('11.22', month, '2026-10-24'), null);
  assert.equal(parseCmbDay('2.29', { year: 2025, month: 2 }, '2026-10-24'), null);
  assert.equal(parseCmbDay('10.22', null, '2026-10-24'), null);
});

test('CMB card/time and signed currency amounts are parsed without guessing malformed digits', () => {
  assert.deepEqual(parseCmbCardTime('储蓄卡9089 18:25'), { card: '储蓄卡9089', time: '18:25' });
  assert.equal(parseCmbTime('储蓄卡9089 18:25', { year: 2025, month: 12, day: 31 }).toISOString(), '2025-12-31T10:25:00.000Z');
  assert.equal(parseCmbTime('储蓄卡9089 24:25', { year: 2025, month: 12, day: 31 }), null);
  assert.equal(parseCmbCardTime('储蓄卡9O89 18:25'), null);
  assert.deepEqual(parseCmbAmount('-¥1,234.56'), { amount: 123456, type: 'expense' });
  assert.deepEqual(parseCmbAmount('￥+1,234.56'), { amount: 123456, type: 'income' });
  assert.deepEqual(parseCmbAmount('￥+1,2,34.56'), { amount: 123456, type: 'income' });
  assert.equal(parseCmbAmount('-¥1O.00'), null);
});

test('CMB field partition removes icons and balance, retaining description, amount and card/time', () => {
  const boxes = [
    box('icon', [100, 20, 170, 75]), box('商户', [200, 20, 600, 75]),
    box('-￥10.00', [960, 20, 1150, 75]), box('储蓄卡9089 18:25', [200, 100, 550, 150]),
    box('余额:￥123.00', [900, 100, 1150, 150]),
  ];
  const fields = partitionCmbFields(boxes, 1260);
  assert.deepEqual(fields.description, [boxes[1]]);
  assert.deepEqual(fields.amount, [boxes[2]]);
  assert.deepEqual(fields.date, [boxes[3]]);
  assert.deepEqual(fields.ignored, [boxes[0], boxes[4]]);
  const merged = box('美团平台商户', [101, 20, 502, 80]);
  assert.deepEqual(partitionCmbFields([merged, boxes[2], boxes[3]], 1260).description, [merged]);
});

test('CMB card selectors follow remaining groups and do not merge mixed account assignments', () => {
  const rows = [
    { sourceCard: '储蓄卡9089', accountId: 1 }, { sourceCard: '信用卡1234', accountId: 2 },
    { sourceCard: '储蓄卡9089', accountId: 1 }, { sourceCard: null, accountId: null },
  ];
  assert.deepEqual(cmbCardGroups(rows), [
    { card: '储蓄卡9089', count: 2, accountId: 1 }, { card: '信用卡1234', count: 1, accountId: 2 },
    { card: '未识别卡号', count: 1, accountId: null },
  ]);
  assert.equal(cmbCardGroups([{ ...rows[0], accountId: 2 }, rows[2]])[0].accountId, null);
  assert.equal(cmbCardGroups(rows.filter((row) => row.sourceCard !== '信用卡1234')).length, 2);
});

test('CMB whitespace segmentation retains two-line rows in light and dark mode', async () => {
  const sharp = (await import('sharp')).default;
  const image = await sharp(Buffer.from('<svg width="1260" height="900"><rect width="1260" height="900" fill="white"/><path d="M130 20h140v100H130z M130 300h100v40H130z M200 500h400v50H200z M200 580h350v40H200z" fill="black"/></svg>')).png().toBuffer();
  const light = await splitCmbRows(image, 1260, 900);
  const dark = await splitCmbRows(await sharp(image).negate({ alpha: false }).png().toBuffer(), 1260, 900);
  assert.equal(light.length, 3);
  assert.deepEqual(dark, light);
  assert.ok(light[2].top < 500 && light[2].top + light[2].height > 620);
});

test('CMB sample segmentation separates month, summary, day and two-line transaction blocks', {
  skip: process.env.RUN_CMB_OCR_SAMPLES !== '1',
}, async () => {
  const sharp = (await import('sharp')).default;
  const image = await sharp(await readFile(path.join('data', 'bkcn.jpg'))).png().toBuffer();
  const { width, height } = await sharp(image).metadata();
  const slices = await splitCmbRows(image, width, height);
  assert.equal(slices.length, 138);
  assert.ok(slices[3].top < 802 && slices[3].top + slices[3].height > 857);
  assert.ok(slices[4].top < 922 && slices[4].top + slices[4].height > 1050);
  for (let i = 1; i < slices.length; i++) assert.ok(slices[i].top >= slices[i - 1].top + slices[i - 1].height);
});

test('real CMB sample preserves relative dates, card groups and exact first amounts (local OCR, mocked AI)', {
  skip: process.env.RUN_CMB_OCR_SAMPLES !== '1', timeout: 1_200_000,
}, async (context) => {
  const { importScreenshot, debugRoot } = await import('../src/lib/wechat-import/server.ts');
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'local-test-key';
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.deepseek.com/')) {
      const payload = JSON.parse(JSON.parse(options.body).messages.at(-1).content);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        results: payload.transactions.map((row) => ({
          transactionId: row.transactionId, categoryId: row.type === 'income' ? 2 : 1,
          confidence: 0.9, explanation: 'Local test',
        })),
      }) } }] });
    }
    assert.equal(new URL(url).hostname, '127.0.0.1', 'Do not send screenshot data externally');
    return originalFetch(url, options);
  };
  const result = await importScreenshot(await readFile(path.join('data', 'bkcn.jpg')), [
    { id: 1, name: 'Expense', type: 'expense', parentId: null, sortOrder: 0 },
    { id: 2, name: 'Income', type: 'income', parentId: null, sortOrder: 0 },
  ], new AbortController().signal, (p) => {
    if (p.stage === 'ocr' && p.completed % 20 === 0) console.log(`CMB OCR ${p.completed}/${p.total}`);
  }, 'cmb', '2026-10-24');
  try {
    console.log(JSON.stringify({ count: result.transactions.length,
      headers: result.headers.map(({ year, month }) => ({ year, month })),
      cards: [...new Set(result.transactions.map((r) => r.sourceCard))],
      invalid: result.transactions.filter((r) => r.importDebug.errors.length).map((r) => ({
        sequence: r.importDebug.sequence, errors: r.importDebug.errors, boxes: r.importDebug.primary.boxes,
      })),
    }));
    assert.deepEqual(result.transactions.slice(0, 6).map((r) => r.amount), [3300, 5740, 1500, 1200, 1900, 2290]);
    assert.equal(result.transactions[0].occurredAt, '2026-10-23T23:10:00.000Z');
    assert.equal(result.transactions[1].occurredAt, '2026-10-23T07:02:00.000Z');
    assert.equal(result.transactions.length, 94);
    assert.ok(result.transactions.every((r) => r.sourceCard && r.amount !== null && r.occurredAt && !r.importDebug.errors.length));
  } finally {
    await rm(path.join(debugRoot, result.batchId), { recursive: true });
  }
});
