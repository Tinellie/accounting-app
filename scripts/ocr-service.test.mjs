import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.includes('/src/')) {
      return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});
const { importScreenshot, recognize, debugRoot } = await import('../src/lib/wechat-import/server.ts');

for (const workers of [1, 4]) {
  test(`screenshot OCR concurrency follows the service's ${workers} workers`, async (context) => {
    let active = 0;
    let maximum = 0;
    let requests = 0;
    context.mock.method(globalThis, 'fetch', async (url) => {
      if (url.pathname === '/health') return Response.json({ ready: true, workers });
      if (url.pathname !== '/ocr') throw new Error('Unexpected external request in OCR test');
      active++;
      requests++;
      maximum = Math.max(maximum, active);
      try {
        await new Promise(resolve => setTimeout(resolve, 25));
        return Response.json({ boxes: [] });
      } finally { active--; }
    });
    const svg = `<svg width="1000" height="800">
      <rect width="1000" height="800" fill="#ffffff"/>
      <rect y="200" width="1000" height="3" fill="#dddddd"/>
      <rect y="400" width="1000" height="3" fill="#dddddd"/>
      <rect y="600" width="1000" height="3" fill="#dddddd"/>
    </svg>`;
    const previousKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    context.after(() => {
      if (previousKey !== undefined) process.env.DEEPSEEK_API_KEY = previousKey;
    });
    const progress = [];
    const result = await importScreenshot(
      await sharp(Buffer.from(svg)).png().toBuffer(), [], new AbortController().signal,
      event => progress.push(event),
    );
    context.after(() => rm(path.join(debugRoot, result.batchId), { recursive: true }));
    assert.equal(result.transactions.length, 4);
    assert.ok(requests >= 4);
    assert.equal(maximum, workers);
    assert.ok(progress.some(event => event.message.includes(`最多 ${workers} 行并发`)));
  });
}

test('invalid worker counts and unready health never start OCR', async (context) => {
  for (const health of [{ ready: false, workers: 1 }, { ready: true, workers: 0 },
    { ready: true, workers: 5 }, { ready: true }, { ready: true, workers: '1' }]) {
    const mock = context.mock.method(globalThis, 'fetch', async url => {
      assert.equal(url.pathname, '/health');
      return Response.json(health);
    });
    await assert.rejects(importScreenshot(Buffer.alloc(0), [], new AbortController().signal), /健康检查/);
    mock.mock.restore();
  }
});

test('connection errors retain their cause for server diagnostics', async (context) => {
  const cause = new TypeError('fetch failed', { cause: new Error('socket closed') });
  context.mock.method(globalThis, 'fetch', async () => { throw cause; });
  await assert.rejects(recognize(Buffer.alloc(0), new AbortController().signal), error => {
    assert.equal(error.status, 503);
    assert.equal(error.cause, cause);
    assert.match(error.message, /内存不足/);
    return true;
  });
});

test('recognition timeout is distinguished from a disconnected service', async (context) => {
  const reason = new DOMException('Timed out', 'TimeoutError');
  const previous = process.env.WECHAT_OCR_TIMEOUT_MS;
  process.env.WECHAT_OCR_TIMEOUT_MS = '300000';
  context.after(() => {
    if (previous === undefined) delete process.env.WECHAT_OCR_TIMEOUT_MS;
    else process.env.WECHAT_OCR_TIMEOUT_MS = previous;
  });
  context.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 300000);
    return AbortSignal.abort(reason);
  });
  context.mock.method(globalThis, 'fetch', async () => { throw reason; });
  await assert.rejects(recognize(Buffer.alloc(0), new AbortController().signal), error => {
    assert.equal(error.status, 504);
    assert.equal(error.cause, reason);
    assert.match(error.message, /300 秒/);
    return true;
  });
});

test('invalid timeout configuration fails before contacting the service', async (context) => {
  const previous = process.env.WECHAT_OCR_TIMEOUT_MS;
  context.after(() => {
    if (previous === undefined) delete process.env.WECHAT_OCR_TIMEOUT_MS;
    else process.env.WECHAT_OCR_TIMEOUT_MS = previous;
  });
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not contact OCR'); });
  for (const value of ['0', '', 'NaN', '600001', '1.5']) {
    process.env.WECHAT_OCR_TIMEOUT_MS = value;
    await assert.rejects(recognize(Buffer.alloc(0), new AbortController().signal), /WECHAT_OCR_TIMEOUT_MS/);
  }
});

test('caller cancellation preserves the original error', async (context) => {
  const reason = new Error('Import cancelled');
  context.mock.method(globalThis, 'fetch', async () => { throw reason; });
  await assert.rejects(recognize(Buffer.alloc(0), AbortSignal.abort(reason)), error => error === reason);
});
