import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { fieldErrors, joinBoxes, parseAmount, parseDate, parseHeader, partitionFields } from '../src/lib/wechat-import/parse.ts';
import { prepareSlice, splitScreenshot } from '../src/lib/wechat-import/image.ts';
import { readImportStream } from '../src/lib/wechat-import/stream.ts';
import {
  AI_CATEGORY_CONFIDENCE_THRESHOLD,
  buildCategoryRequest,
  classifyCategories,
  validateCategoryResponse,
} from '../src/lib/wechat-import/ai-category.ts';

const box = (text, bounds, confidence = 0.99) => ({ text, box: bounds, confidence });
const aiCategories = [
  { id: 1, name: '餐饮', type: 'expense', parentId: null, code: 'food', sortOrder: 0, icon: 'Restaurant', color: '#ff0000' },
  { id: 2, name: '午餐', type: 'expense', parentId: 1, code: 'lunch', sortOrder: 0, icon: null, color: null },
  { id: 3, name: '工资', type: 'income', parentId: null, code: 'salary', sortOrder: 0, icon: null, color: null },
];
const aiTransactions = [
  { id: -2, type: 'expense', notes: '虚构测试：午餐' },
  { id: -3, type: 'income', notes: '虚构测试：工资' },
];
const aiRow = (transactionId = -2, categoryId = 2, confidence = 0.9) => ({
  transactionId, categoryId, confidence, explanation: '虚构交易的分类理由',
});

function fakeDeepSeekKey(context) {
  const previous = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-secret-not-a-real-key';
  context.after(() => {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  });
}

test('AI request includes complete category hierarchy and descriptions, never amounts/dates/accounts', () => {
  const payload = buildCategoryRequest(aiCategories, aiTransactions.map((row) => ({
    ...row, amount: 123, occurredAt: 'private-date', accountName: 'private-account', importDebug: 'private-ocr',
  })));
  assert.equal(payload.categories.length, 3);
  assert.equal(payload.categories[1].parentId, 1);
  assert.deepEqual(Object.keys(payload.transactions[0]).sort(), ['description', 'transactionId', 'type']);
  assert.equal(payload.transactions[0].description, aiTransactions[0].notes);
  assert.ok(!JSON.stringify(payload).includes('private-'));
});

test('AI results match by ID and apply valid child categories; threshold is strictly below 0.5', () => {
  assert.equal(AI_CATEGORY_CONFIDENCE_THRESHOLD, 0.5);
  const result = validateCategoryResponse({ results: [aiRow(-3, 3, 0.5), aiRow(-2, 2, 0.499)] }, aiCategories, aiTransactions);
  assert.deepEqual(result.map(({ status }) => status), ['warning', 'success']);
  assert.deepEqual(result.map(({ categoryId }) => categoryId), [2, 3]);
  assert.equal(result[0].confidence, 0.499);
  assert.deepEqual(result[0].rawResponse, aiRow(-2, 2, 0.499));
  const zero = validateCategoryResponse({ results: [aiRow(-2, 2, 0)] }, aiCategories, [aiTransactions[0]]);
  assert.equal(zero[0].status, 'warning');
  assert.equal(zero[0].categoryId, 2);
});

test('AI rejects malformed batches, unknown IDs, duplicates and missing rows without positional guessing', () => {
  for (const raw of ['not JSON', {}, { results: null }, { results: [aiRow(999)] }, { results: [{ categoryId: 1 }] }]) {
    const result = validateCategoryResponse(raw, aiCategories, aiTransactions);
    assert.ok(result.every((row) => row.status === 'error' && row.categoryId === null));
    assert.deepEqual(result[0].rawResponse, raw);
  }
  const duplicate = validateCategoryResponse({ results: [aiRow(), aiRow(), aiRow(-3, 3)] }, aiCategories, aiTransactions);
  assert.equal(duplicate[0].status, 'error');
  assert.equal(duplicate[1].status, 'success');
  const missing = validateCategoryResponse({ results: [aiRow()] }, aiCategories, aiTransactions);
  assert.equal(missing[0].status, 'success');
  assert.equal(missing[1].status, 'error');
});

test('AI rejects nonexistent/wrong-direction categories and invalid confidence/explanations', () => {
  for (const patch of [
    { categoryId: 999 }, { categoryId: 3 }, { categoryId: '2' },
    { confidence: -0.1 }, { confidence: 1.1 }, { confidence: '0.9' },
    { explanation: '' }, { explanation: '  ' }, { explanation: null },
  ]) {
    const raw = { ...aiRow(), ...patch };
    const result = validateCategoryResponse({ results: [raw] }, aiCategories, [aiTransactions[0]])[0];
    assert.equal(result.status, 'error', JSON.stringify(patch));
    assert.equal(result.categoryId, null);
    assert.deepEqual(result.rawResponse, raw);
  }
  for (const patch of [{ type: null }, { notes: null }, { notes: ' ' }]) {
    const result = validateCategoryResponse({ results: [aiRow()] }, aiCategories, [{ ...aiTransactions[0], ...patch }])[0];
    assert.equal(result.status, 'error');
  }
});

test('DeepSeek client uses JSON mode and returns validated categories', async (context) => {
  fakeDeepSeekKey(context);
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.response_format.type, 'json_object');
    assert.equal(body.thinking.type, 'disabled');
    assert.deepEqual(JSON.parse(body.messages[1].content), buildCategoryRequest(aiCategories, aiTransactions));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ results: [aiRow(), aiRow(-3, 3)] }) } }] });
  });
  const result = await classifyCategories(aiCategories, aiTransactions, new AbortController().signal);
  assert.ok(result.every((row) => row.status === 'success'));
});

test('DeepSeek client explicitly reports HTTP errors and redacts the API key from raw feedback', async (context) => {
  fakeDeepSeekKey(context);
  context.mock.method(globalThis, 'fetch', async () => Response.json(
    { error: { message: `Rejected ${process.env.DEEPSEEK_API_KEY}` } }, { status: 401 },
  ));
  const result = await classifyCategories(aiCategories, aiTransactions, new AbortController().signal);
  assert.equal(result[0].status, 'error');
  assert.match(result[0].errors[0], /401/);
  assert.ok(!JSON.stringify(result).includes(process.env.DEEPSEEK_API_KEY));
  assert.match(JSON.stringify(result[0].rawResponse), /REDACTED/);
});

test('DeepSeek client reports malformed JSON and truncated completions, preserving raw data', async (context) => {
  fakeDeepSeekKey(context);
  for (const response of [
    'bad API envelope',
    { choices: [{ finish_reason: 'length', message: { content: '{"results":[' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'not JSON content' } }] },
  ]) {
    const mock = context.mock.method(globalThis, 'fetch', async () => new Response(typeof response === 'string' ? response : JSON.stringify(response)));
    const result = await classifyCategories(aiCategories, aiTransactions, new AbortController().signal);
    assert.ok(result.every((row) => row.status === 'error'));
    assert.ok(result[0].rawResponse);
    mock.mock.restore();
  }
});

test('DeepSeek network errors preserve OCR preview feedback, but cancellation propagates', async (context) => {
  fakeDeepSeekKey(context);
  const mock = context.mock.method(globalThis, 'fetch', async () => { throw new DOMException('timeout', 'TimeoutError'); });
  const result = await classifyCategories(aiCategories, aiTransactions, new AbortController().signal);
  assert.ok(result.every((row) => row.status === 'error' && row.rawResponse === null));
  mock.mock.restore();
  context.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  const abort = new AbortController();
  const pending = classifyCategories(aiCategories, aiTransactions, abort.signal);
  abort.abort();
  await assert.rejects(pending, /abort/i);
});

test('missing DeepSeek key makes no external request and produces explicit per-row errors', async (context) => {
  fakeDeepSeekKey(context);
  delete process.env.DEEPSEEK_API_KEY;
  const fetchMock = context.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call'); });
  const result = await classifyCategories(aiCategories, aiTransactions, new AbortController().signal);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.ok(result.every((row) => row.status === 'error' && row.errors[0].includes('DEEPSEEK_API_KEY')));
});

test('stream parser delivers progress before result and handles fragmented UTF-8', async () => {
  const progress = { stage: 'ocr', status: 'running', completed: 1, total: 10, message: '第一行识别完成' };
  const result = { batchId: 'test', transactions: [], headers: [] };
  const encoder = new TextEncoder();
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const received = [];
  const stream = new ReadableStream({
    async start(controller) {
      const bytes = encoder.encode(`${JSON.stringify({ type: 'progress', progress })}\n`);
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      await gate;
      controller.enqueue(encoder.encode(`\n${JSON.stringify({ type: 'result', result })}`));
      controller.close();
    },
  });
  const pending = readImportStream(new Response(stream), (value) => {
    received.push(value);
    finish();
  });
  assert.deepEqual(await pending, result);
  assert.deepEqual(received, [progress]);
});

test('stream parser rejects errors, truncated responses, unknown events and malformed JSON', async () => {
  for (const [body, expected] of [
    ['{"type":"error","error":"本地 OCR 失败"}\n', /本地 OCR 失败/],
    ['', /未收到完整识别结果/],
    ['{"type":"unknown"}\n', /未知/],
    ['{"type":', /JSON/],
  ]) await assert.rejects(readImportStream(new Response(body), () => {}), expected);
});

test('stream parser propagates connection failure instead of showing success', async () => {
  const stream = new ReadableStream({
    start(controller) { controller.error(new Error('connection lost')); },
  });
  await assert.rejects(readImportStream(new Response(stream), () => {}), /connection lost/);
});

test('signed amounts use integer minor units; malformed digits are never guessed', () => {
  assert.deepEqual(parseAmount('−55.00'), { amount: 5500, type: 'expense' });
  assert.deepEqual(parseAmount('＋１３２.２６'), { amount: 13226, type: 'income' });
  assert.deepEqual(parseAmount('-1,234.56'), { amount: 123456, type: 'expense' });
  for (const text of ['55.00', '-5O.00', '-5.0', '+1.234', '-1,23.45', '零钱余额 90.78', '-2.00+3.00']) {
    assert.equal(parseAmount(text), null, text);
  }
});

test('headers and dates require the nearest valid year/month and a real calendar date', () => {
  assert.deepEqual(parseHeader('2026年 9月'), { year: 2026, month: 9 });
  assert.equal(parseHeader('2026年13月'), null);
  assert.equal(parseHeader('9月'), null);
  assert.equal(parseDate('9月14日 14:00', { year: 2026, month: 9 })?.toISOString(), '2026-09-14T06:00:00.000Z');
  assert.equal(parseDate('12月31日 23:59', { year: 2025, month: 12 })?.toISOString(), '2025-12-31T15:59:00.000Z');
  assert.equal(parseDate('2月29日 12:00', { year: 2024, month: 2 })?.toISOString(), '2024-02-29T04:00:00.000Z');
  for (const [text, header] of [
    ['9月14日 14:00', null],
    ['8月14日 14:00', { year: 2026, month: 9 }],
    ['2月29日 12:00', { year: 2026, month: 2 }],
    ['9月31日 12:00', { year: 2026, month: 9 }],
    ['9月14日 24:00', { year: 2026, month: 9 }],
    ['9月14日 14:60', { year: 2026, month: 9 }],
  ]) assert.equal(parseDate(text, header), null);
  assert.equal(fieldErrors(null, null, null).length, 3);
});

test('coordinate partition excludes balances and joins split signs/date tokens', () => {
  const fields = partitionFields([
    box('零', [10, 24, 30, 58]),
    box('售 Shop', [32, 24, 270, 58]),
    box('-', [720, 24, 740, 58]),
    box('55.00', [742, 24, 850, 58]),
    box('9月14日', [10, 110, 120, 142]),
    box('14:00', [130, 110, 220, 142]),
    box('零钱余额 90.78', [600, 110, 850, 142]),
  ], 900, 190);
  assert.equal(joinBoxes(fields.description), '零售 Shop');
  assert.equal(joinBoxes(fields.amount), '-55.00');
  assert.equal(joinBoxes(fields.date), '9月14日14:00');
  assert.equal(joinBoxes(fields.ignored), '零钱余额 90.78');
});

test('image validation rejects unsupported content and undersized screenshots', async () => {
  await assert.rejects(splitScreenshot(Buffer.from('<svg width="1000" height="1000"></svg>')), /JPG/);
  await assert.rejects(splitScreenshot(await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).png().toBuffer()), /图片尺寸/);
});

for (const dark of [true, false]) {
  test(`separator slicing and preprocessing in ${dark ? 'dark' : 'light'} mode`, async () => {
    const background = dark ? '#181818' : '#ffffff';
    const header = dark ? '#202020' : '#eeeeee';
    const line = dark ? '#303030' : '#dddddd';
    const foreground = dark ? '#ffffff' : '#000000';
    const svg = `<svg width="1000" height="540">
      <rect width="1000" height="540" fill="${background}"/>
      <rect width="1000" height="140" fill="${header}"/>
      <rect y="140" width="1000" height="3" fill="${line}"/>
      <rect y="340" width="1000" height="3" fill="${line}"/>
      <circle cx="110" cy="240" r="55" fill="${foreground}"/>
      <circle cx="110" cy="440" r="55" fill="${foreground}"/>
      <rect x="220" y="180" width="300" height="28" fill="${foreground}"/>
      <rect x="220" y="380" width="300" height="28" fill="${foreground}"/>
    </svg>`;
    const split = await splitScreenshot(await sharp(Buffer.from(svg)).png().toBuffer());
    assert.equal(split.slices.length, 3);
    assert.ok(Math.abs(split.slices[1].top - 140) <= 6);
    const slice = split.slices[1];
    const original = await sharp(split.image).extract({ left: 0, top: slice.top, width: split.width, height: slice.height }).png().toBuffer();
    const prepared = await prepareSlice(original, split.width, slice.height);
    assert.equal(prepared.inverted, dark);
    assert.ok(prepared.avatarCropLeft >= 155 && prepared.avatarCropLeft < 220, String(prepared.avatarCropLeft));
    const pixels = await sharp(prepared.binary).greyscale().raw().toBuffer();
    assert.ok(pixels.every((value) => value === 0 || value === 255));
    assert.ok(pixels[10 * split.width + 900] > 200);
  });
}

test('sample screenshot has two headers and eight transactions, with avatars removed', async (context) => {
  let sample;
  try {
    sample = await readFile(new URL('../data/1.jpg', import.meta.url));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    context.skip('Optional local sample data/1.jpg is not present');
    return;
  }
  const split = await splitScreenshot(sample);
  assert.equal(split.slices.length, 10);
  for (const [index, slice] of split.slices.entries()) {
    const original = await sharp(split.image).extract({ left: 0, top: slice.top, width: split.width, height: slice.height }).png().toBuffer();
    const prepared = await prepareSlice(original, split.width, slice.height);
    assert.equal(prepared.inverted, true);
    if (index === 0 || index === 6) assert.equal(prepared.avatarCropLeft, 0);
    else assert.ok(prepared.avatarCropLeft > split.width * 0.14 && prepared.avatarCropLeft < split.width * 0.215, `${index}: ${prepared.avatarCropLeft}`);
  }
});
