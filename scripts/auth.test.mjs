import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.includes('/src/')) {
      return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});
const { createAuthStore, SESSION_DURATION } = await import('../src/lib/auth-store.ts');
const { openUserDatabase, userDirectory } = await import('../src/lib/user-storage.ts');
const { accounts, categories, transactions, tags, transactionTags, wechatImportBatches } = await import('../src/db/schema.ts');

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'accounting-auth-'));
  const filename = path.join(directory, 'auth.db');
  const store = createAuthStore(filename);
  context.after(async () => { store.close(); await rm(directory, { recursive: true }); });
  return { store, filename, directory };
}

test('registration/login use salted password hashes and hashed session secrets', async context => {
  const { store, filename } = await fixture(context);
  const first = await store.register('alpha', 'test-password-12345', 'Device A');
  const second = await store.register('beta', 'test-password-12345', 'Device B');
  const sqlite = new Database(filename);
  try {
    const users = sqlite.prepare('SELECT password_hash FROM auth_users').all();
    assert.notEqual(users[0].password_hash, users[1].password_hash);
    assert.ok(users.every(row => !row.password_hash.includes('test-password')));
    const hashes = sqlite.prepare('SELECT token_hash FROM auth_sessions').all();
    assert.ok(hashes.every(row => row.token_hash !== first.token && row.token_hash !== second.token));
  } finally { sqlite.close(); }
  assert.equal(store.session(first.token).user.id, first.user.id);
  assert.equal(store.session('forged'), null);
  assert.equal(store.session('x'.repeat(43)), null);
  await assert.rejects(store.login('alpha', 'wrong-password', 'Device C'), /用户名或密码/);
  await assert.rejects(store.login('unknown', 'wrong-password', 'Device C'), /用户名或密码/);
  const login = await store.login('alpha', 'test-password-12345', 'Device C');
  assert.equal(login.user.id, first.user.id);
  assert.equal(store.sessions(first.user.id).length, 2);
  await assert.rejects(store.register('alpha', 'different-password', 'Device A'), /用户名不可用/);
});

test('sessions are owner-scoped, revocable and expire', async context => {
  const { store, filename } = await fixture(context);
  const alpha = await store.register('alpha', 'test-password-12345', 'Device A');
  const beta = await store.register('beta', 'test-password-12345', 'Device B');
  const other = await store.login('alpha', 'test-password-12345', 'Device C');
  store.revoke(beta.user.id, alpha.id);
  assert.ok(store.session(alpha.token));
  store.revokeOthers(alpha.user.id, alpha.id);
  assert.equal(store.session(other.token), null);
  assert.ok(store.session(beta.token));
  const sqlite = new Database(filename);
  sqlite.prepare('UPDATE auth_sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 1, alpha.id);
  sqlite.close();
  assert.equal(store.session(alpha.token), null);
  assert.ok(store.sessions(beta.user.id)[0].expiresAt <= Date.now() + SESSION_DURATION);
  store.revoke(beta.user.id, beta.id);
  assert.equal(store.session(beta.token), null);
});

test('password change verifies old password, rotates current session and revokes other devices', async context => {
  const { store } = await fixture(context);
  const first = await store.register('alpha', 'test-password-12345', 'Device A');
  const other = await store.login('alpha', 'test-password-12345', 'Device B');
  await assert.rejects(store.changePassword(first.user.id, first.id, 'wrong-password', 'new-password-12345'), /当前密码/);
  const updated = await store.changePassword(first.user.id, first.id, 'test-password-12345', 'new-password-12345');
  assert.equal(store.session(first.token), null);
  assert.equal(store.session(other.token), null);
  assert.equal(store.session(updated.token).user.id, first.user.id);
  await assert.rejects(store.login('alpha', 'test-password-12345', 'Device A'), /用户名或密码/);
  assert.ok(await store.login('alpha', 'new-password-12345', 'Device A'));
  store.updateProfile(first.user.id, 'New name');
  assert.equal(store.session(updated.token).user.displayName, 'New name');
});

test('authentication rate limiting is persisted and scoped by key', async context => {
  const { store } = await fixture(context);
  store.rateLimit('login:a', 2, 900000);
  store.rateLimit('login:a', 2, 900000);
  assert.throws(() => store.rateLimit('login:a', 2, 900000), /次数过多/);
  assert.doesNotThrow(() => store.rateLimit('login:b', 2, 900000));
});

test('new ledgers isolate every data table, reused IDs/codes and private file namespaces', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'accounting-tenants-'));
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, 'legacy.db');
  const firstId = randomUUID();
  const secondId = randomUUID();
  const first = openUserDatabase(firstId);
  const second = openUserDatabase(secondId);
  context.after(async () => {
    first.$client.close();
    second.$client.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    await rm(directory, { recursive: true });
  });
  for (const table of [accounts, categories, transactions, tags, transactionTags, wechatImportBatches]) {
    assert.deepEqual(first.select().from(table).all(), []);
    assert.deepEqual(second.select().from(table).all(), []);
  }
  const account = first.insert(accounts).values({ code: 'cash', name: 'Private A', type: 'cash' }).returning().get();
  const category = first.insert(categories).values({ code: 'food', name: 'Private food', type: 'expense' }).returning().get();
  const tag = first.insert(tags).values({ code: 'travel', name: 'Private tag' }).returning().get();
  const transaction = first.insert(transactions).values({
    type: 'expense', amount: 100, accountId: account.id, categoryId: category.id, occurredAt: new Date(),
  }).returning().get();
  first.insert(transactionTags).values({ transactionId: transaction.id, tagId: tag.id }).run();
  first.insert(wechatImportBatches).values({ batchId: randomUUID(), accountId: account.id, transactionCount: 1 }).run();
  for (const table of [accounts, categories, transactions, tags, transactionTags, wechatImportBatches]) {
    assert.equal(first.select().from(table).all().length, 1);
    assert.equal(second.select().from(table).all().length, 0);
  }
  assert.equal(second.insert(accounts).values({ code: 'cash', name: 'Private B', type: 'cash' }).returning().get().id, account.id);
  assert.equal(second.insert(categories).values({ code: 'food', name: 'Private food', type: 'expense' }).returning().get().id, category.id);
  for (const name of ['icons', 'import-vx-debug']) {
    const own = path.join(userDirectory(firstId), name);
    await mkdir(own, { recursive: true });
    await writeFile(path.join(own, 'private.png'), 'Private A');
    await assert.rejects(readFile(path.join(userDirectory(secondId), name, 'private.png')), { code: 'ENOENT' });
  }
  assert.throws(() => userDirectory('../other-user'), /Invalid user/);
});
