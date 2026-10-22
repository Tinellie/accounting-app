import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.includes('/src/')) {
      return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});
const { saveImportedBatch } = await import('../src/lib/wechat-import/save.ts');

async function fixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wechat-save-test-'));
  const databasePath = path.join(root, 'test.db');
  const sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  context.after(async () => { sqlite.close(); await rm(root, { recursive: true }); });
  sqlite.exec(`
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, code TEXT, name TEXT NOT NULL, icon TEXT, type TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'CNY', include_in_net_worth INTEGER NOT NULL DEFAULT 1,
      is_archived INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, code TEXT, name TEXT NOT NULL, type TEXT NOT NULL,
      parent_id INTEGER, icon TEXT, color TEXT, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, amount INTEGER NOT NULL,
      occurred_at INTEGER NOT NULL, account_id INTEGER NOT NULL REFERENCES accounts(id),
      to_account_id INTEGER REFERENCES accounts(id), category_id INTEGER REFERENCES categories(id), notes TEXT, created_at INTEGER NOT NULL);
    INSERT INTO accounts (id,name,type,balance) VALUES (1,'Test CNY account','cash',10000),(2,'Other account','checking',20000);
    INSERT INTO accounts (id,name,type,balance,currency) VALUES (3,'USD account','checking',30000,'USD');
    INSERT INTO categories (id,name,type) VALUES (1,'Food','expense'),(2,'Salary','income');
  `);
  const batchId = randomUUID();
  const directory = path.join(root, batchId);
  await mkdir(directory);
  const batch = {
    batchId,
    transactions: [
      { id: -2, type: 'expense', amount: 5500, occurredAt: '2026-09-14T06:00:00.000Z', categoryId: 1, notes: 'Test purchase', currency: 'CNY', importDebug: { errors: [] }, aiCategory: { status: 'success', errors: [] } },
      { id: -3, type: 'income', amount: 13226, occurredAt: '2026-09-12T13:26:00.000Z', categoryId: 2, notes: 'Test income', currency: 'CNY', importDebug: { errors: [] }, aiCategory: { status: 'warning', errors: [] } },
    ],
  };
  const file = path.join(directory, 'result.json');
  await writeFile(file, JSON.stringify(batch));
  return {
    root, sqlite, databasePath, db: drizzle(sqlite), batchId, batch, file,
    request: { batchId, accountId: 1 },
    write: () => writeFile(file, JSON.stringify(batch)),
    count: () => sqlite.prepare('SELECT count(*) AS n FROM transactions').get().n,
    balance: (id = 1) => sqlite.prepare('SELECT balance FROM accounts WHERE id=?').get(id).balance,
  };
}

test('save persists exact dates/minor units, descriptions, categories and net account balance', async (context) => {
  const f = await fixture(context);
  const result = await saveImportedBatch(f.db, f.request, f.root);
  assert.equal(result.success, true);
  assert.equal(result.count, 2);
  assert.equal(result.alreadySaved, false);
  assert.equal(f.balance(), 10000 - 5500 + 13226);
  assert.equal(f.balance(2), 20000);
  const rows = f.sqlite.prepare('SELECT * FROM transactions ORDER BY id').all();
  assert.deepEqual(rows.map((row) => row.amount), [5500, 13226]);
  assert.deepEqual(rows.map((row) => row.type), ['expense', 'income']);
  assert.deepEqual(rows.map((row) => row.category_id), [1, 2]);
  assert.ok(rows.every((row) => row.account_id === 1 && row.to_account_id === null));
  assert.equal(rows[0].occurred_at, new Date(f.batch.transactions[0].occurredAt).getTime() / 1000);
  assert.equal(rows[0].notes, 'Test purchase');
  assert.deepEqual(JSON.parse(await readFile(f.file, 'utf8')), f.batch);
});

test('batch deduplication survives reopening database and does not apply balance twice', async (context) => {
  const f = await fixture(context);
  await saveImportedBatch(f.db, f.request, f.root);
  const reopened = new Database(f.databasePath);
  try {
    const repeat = await saveImportedBatch(drizzle(reopened), f.request, f.root);
    assert.equal(repeat.alreadySaved, true);
    assert.equal(f.count(), 2);
    assert.equal(f.balance(), 17726);
    await assert.rejects(saveImportedBatch(drizzle(reopened), { ...f.request, accountId: 2 }, f.root), /其他账户/);
  } finally {
    reopened.close();
  }
});

test('concurrent same-batch submissions only save once', async (context) => {
  const f = await fixture(context);
  const results = await Promise.all([saveImportedBatch(f.db, f.request, f.root), saveImportedBatch(f.db, f.request, f.root)]);
  assert.equal(results.filter((result) => !result.alreadySaved).length, 1);
  assert.equal(f.count(), 2);
  assert.equal(f.balance(), 17726);
});

test('reject all red OCR/AI errors and invalid required fields before any writes', async (context) => {
  const f = await fixture(context);
  const original = structuredClone(f.batch.transactions[0]);
  for (const patch of [
    { importDebug: { errors: ['bad date'] } },
    { aiCategory: { status: 'error', errors: ['bad category'] } },
    { amount: null }, { amount: 0 }, { amount: -100 }, { amount: 1.5 },
    { amount: Number.MAX_SAFE_INTEGER + 1 }, { type: null }, { type: 'transfer' },
    { occurredAt: null }, { occurredAt: 'invalid' }, { occurredAt: '2026-02-30T00:00:00.000Z' },
    { categoryId: null }, { notes: 'a'.repeat(1001) }, { currency: 'USD' },
  ]) {
    f.batch.transactions[0] = { ...original, ...patch };
    await f.write();
    await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /错误|无效/);
    assert.equal(f.count(), 0);
    assert.equal(f.balance(), 10000);
  }
});

test('reject missing/archived/non-CNY account and stale category/type', async (context) => {
  const f = await fixture(context);
  await assert.rejects(saveImportedBatch(f.db, { ...f.request, accountId: 999 }, f.root), /不存在/);
  await assert.rejects(saveImportedBatch(f.db, { ...f.request, accountId: 3 }, f.root), /人民币/);
  f.sqlite.exec('UPDATE accounts SET is_archived=1 WHERE id=1');
  await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /归档/);
  f.sqlite.exec("UPDATE accounts SET is_archived=0 WHERE id=1; UPDATE categories SET type='income' WHERE id=1");
  await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /分类/);
  f.sqlite.exec('DELETE FROM categories WHERE id=1');
  await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /分类/);
  assert.equal(f.count(), 0);
  assert.equal(f.balance(), 10000);
});

test('database failure midway rolls back rows, balance and batch claim, allowing a safe retry', async (context) => {
  const f = await fixture(context);
  f.sqlite.exec("CREATE TRIGGER fail_test BEFORE INSERT ON transactions WHEN NEW.type='income' BEGIN SELECT RAISE(ABORT, 'test insert failure'); END");
  await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /test insert failure/);
  assert.equal(f.count(), 0);
  assert.equal(f.balance(), 10000);
  f.sqlite.exec('DROP TRIGGER fail_test');
  const retry = await saveImportedBatch(f.db, f.request, f.root);
  assert.equal(retry.alreadySaved, false);
  assert.equal(f.count(), 2);
});

test('reject balance overflow, unsafe batches, missing or corrupt files', async (context) => {
  const f = await fixture(context);
  f.sqlite.prepare('UPDATE accounts SET balance=? WHERE id=1').run(Number.MAX_SAFE_INTEGER);
  await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /余额/);
  assert.equal(f.count(), 0);
  await assert.rejects(saveImportedBatch(f.db, { batchId: '..\\outside', accountId: 1 }, f.root), /有效/);
  await assert.rejects(saveImportedBatch(f.db, { batchId: randomUUID(), accountId: 1 }, f.root), /不存在/);
  await writeFile(f.file, 'broken json');
  await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /损坏/);
  await writeFile(f.file, JSON.stringify({ ...f.batch, batchId: randomUUID() }));
  await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /无效/);
  await writeFile(f.file, JSON.stringify({ ...f.batch, transactions: [f.batch.transactions[0], f.batch.transactions[0]] }));
  await assert.rejects(saveImportedBatch(f.db, f.request, f.root), /无效/);
  assert.equal(f.count(), 0);
});
