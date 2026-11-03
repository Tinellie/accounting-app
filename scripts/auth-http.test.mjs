import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.includes('/src/')) {
      return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});

test('production HTTP guards isolate pages, actions, imports and private images', {
  skip: !process.env.AUTH_TEST_BASE_URL,
}, async () => {
  const base = new URL(process.env.AUTH_TEST_BASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Use an isolated local test server, never production');
  assert.ok(process.env.AUTH_TEST_DATA_DIR, 'Specify the isolated server data directory');
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(process.env.AUTH_TEST_DATA_DIR, 'accounting.db');
  const { createAuthStore, SESSION_COOKIE } = await import('../src/lib/auth-store.ts');
  const { openUserDatabase, userDirectory } = await import('../src/lib/user-storage.ts');
  const { accounts, categories, transactions, tags } = await import('../src/db/schema.ts');
  const store = createAuthStore(path.join(process.env.AUTH_TEST_DATA_DIR, 'auth.db'));
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const alpha = await store.register(`http_a_${suffix}`, 'Synthetic-test-password', 'Synthetic device A');
  const beta = await store.register(`http_b_${suffix}`, 'Synthetic-test-password', 'Synthetic device B');
  const first = openUserDatabase(alpha.user.id);
  const second = openUserDatabase(beta.user.id);
  const cookie = token => `${SESSION_COOKIE}=${token}`;
  const request = (url, token, options = {}) => fetch(new URL(url, base), {
    redirect: 'manual', ...options,
    headers: { ...(token ? { cookie: cookie(token) } : {}), ...options.headers },
  });
  try {
    for (const url of ['/', '/accounts', '/categories', '/transactions', '/profile', '/unknown-page']) {
      const response = await request(url);
      assert.equal(response.status, 303, url);
      assert.equal(new URL(response.headers.get('location'), base).pathname, '/login');
    }
    assert.equal((await request('/transactions', 'x'.repeat(43))).status, 303);
    for (const url of ['/api/wechat-import', '/api/alipay-import', '/api/alipay-hk-import',
      '/api/cmb-import', '/api/hangseng-import', '/api/hangseng-bank-import']) {
      assert.equal((await request(url, undefined, { method: 'POST' })).status, 401, url);
    }
    assert.equal((await request('/api/exchange-rates')).status, 401);
    assert.equal((await request('/api/health')).status, 200);
    const account = first.insert(accounts).values({ code: 'private_a', name: `PrivateAccount-${suffix}`, type: 'cash' }).returning().get();
    const category = first.insert(categories).values({ code: 'private_a', name: `PrivateCategory-${suffix}`, type: 'expense' }).returning().get();
    const tag = first.insert(tags).values({ code: 'private_a', name: `PrivateTag-${suffix}` }).returning().get();
    const transaction = first.insert(transactions).values({
      type: 'expense', amount: 12345, occurredAt: new Date(), accountId: account.id,
      categoryId: category.id, notes: `PrivateTransaction-${suffix}`,
    }).returning().get();
    for (const [url, label] of [['/accounts', account.name], ['/categories', category.name], ['/transactions', transaction.notes]]) {
      const own = await request(url, alpha.token);
      assert.equal(own.status, 200, url);
      assert.ok((await own.text()).includes(label), 'Owner can read private data');
      const other = await request(url, beta.token);
      assert.equal(other.status, 200, url);
      assert.ok(!(await other.text()).includes(label), 'Other user cannot read private data');
    }
    const batch = randomUUID();
    const imageName = `${randomUUID()}.png`;
    const root = userDirectory(alpha.user.id);
    await mkdir(path.join(root, 'icons'), { recursive: true });
    await mkdir(path.join(root, 'import-vx-debug', batch), { recursive: true });
    await writeFile(path.join(root, 'icons', imageName), 'synthetic image');
    await writeFile(path.join(root, 'import-vx-debug', batch, '1.png'), 'synthetic crop');
    for (const url of [`/account-icons/${imageName}?source=upload`, `/api/wechat-import/${batch}/1`]) {
      const own = await request(url, alpha.token);
      assert.equal(own.status, 200);
      assert.match(own.headers.get('cache-control'), /private.*no-store/);
      assert.equal((await request(url, beta.token)).status, 404);
    }
    const manifest = JSON.parse(await readFile(path.resolve('.next/server/server-reference-manifest.json'), 'utf8'));
    const actionId = Object.entries(manifest.node).find(([, value]) => value.exportedName === 'bulkUpdateTransactionTagsAction')?.[0];
    assert.ok(actionId);
    const actionOptions = {
      method: 'POST',
      headers: { 'next-action': actionId, origin: base.origin, 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify([{ transactionIds: [transaction.id], tagIds: [tag.id], operation: 'add' }]),
    };
    assert.equal((await request('/transactions', undefined, actionOptions)).status, 303);
    const foreignMutation = await request('/transactions', beta.token, actionOptions);
    assert.equal(foreignMutation.status, 200);
    assert.match(await foreignMutation.text(), /不存在/);
    assert.deepEqual(second.select().from(transactions).all(), []);
    assert.equal(first.select().from(transactions).all().length, 1);
    const saveId = Object.entries(manifest.node).find(([, value]) => value.exportedName === 'saveWechatImportAction')?.[0];
    assert.ok(saveId);
    const foreignSave = await request('/transactions', beta.token, {
      ...actionOptions,
      headers: { ...actionOptions.headers, 'next-action': saveId },
      body: JSON.stringify([{ batchId: batch, accountId: account.id }]),
    });
    assert.equal(foreignSave.status, 200);
    assert.match(await foreignSave.text(), /不存在|失败/);
    store.revoke(alpha.user.id, alpha.id);
    assert.equal((await request('/accounts', alpha.token)).status, 303);
  } finally {
    first.$client.close();
    second.$client.close();
    store.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
