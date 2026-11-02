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
      to_account_id INTEGER REFERENCES accounts(id), category_id INTEGER REFERENCES categories(id), notes TEXT,
      data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
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

test('expense refunds remain negative expenses and offset account balance exactly once', async (context) => {
  const f = await fixture(context);
  f.batch.transactions = [
    { ...f.batch.transactions[0], amount: 4500 },
    { ...f.batch.transactions[0], id: -4, amount: -4500, isRefund: true },
  ];
  await f.write();
  await saveImportedBatch(f.db, f.request, f.root);
  assert.deepEqual(f.sqlite.prepare('SELECT type,amount FROM transactions ORDER BY id').all(), [
    { type: 'expense', amount: 4500 }, { type: 'expense', amount: -4500 },
  ]);
  assert.equal(f.balance(), 10000);
  await saveImportedBatch(f.db, f.request, f.root);
  assert.equal(f.count(), 2);
  assert.equal(f.balance(), 10000);
});

function edits(f) {
  return {
    batchId: f.batchId,
    editedRows: f.batch.transactions.map((row) => ({
      id: row.id, type: row.type, amount: row.amount, occurredAt: row.occurredAt,
      accountId: 1, categoryId: row.categoryId, notes: row.notes,
      manualReview: { fields: false, category: false },
    })),
  };
}

test('legacy and edited import saves persist JSON data, default old rows and reject non-object data', async (context) => {
  const f = await fixture(context);
  const data = { future: { labels: ['test'], enabled: true }, value: null };
  f.batch.transactions[0].data = data;
  await f.write();
  await saveImportedBatch(f.db, f.request, f.root);
  assert.deepEqual(f.sqlite.prepare('SELECT data FROM transactions ORDER BY id').all().map((row) => JSON.parse(row.data)), [data, {}]);

  const other = await fixture(context);
  const input = edits(other);
  input.editedRows[0].data = [];
  await assert.rejects(saveImportedBatch(other.db, input, other.root), /有效账户/);
  assert.equal(other.count(), 0);
  input.editedRows[0].data = data;
  await saveImportedBatch(other.db, input, other.root);
  assert.deepEqual(other.sqlite.prepare('SELECT data FROM transactions ORDER BY id').all().map((row) => JSON.parse(row.data)), [data, {}]);
});

test('Hang Seng batches follow any selected account currency and persist metadata atomically', async (context) => {
  const f = await fixture(context);
  f.batch.source = 'hangseng';
  f.batch.transactions[0].data = {
    address: 'TOKYO', regionCode: 'JP', postingDate: '2026-09-15',
    foreignCurrencyAmount: { currency: 'JPY', amount: '12150' }, exchangeRate: '0.050436',
    cri: 'A07626273', purchaseId: 'P94557498',
  };
  f.batch.transactions.forEach((row) => { row.currency = ''; });
  await f.write();
  const input = edits(f);
  input.editedRows.forEach((row, i) => { row.accountId = 3; row.data = f.batch.transactions[i].data ?? {}; });
  await saveImportedBatch(f.db, input, f.root);
  assert.equal(f.balance(3), 30000 - 5500 + 13226);
  assert.equal(f.balance(1), 10000);
  assert.deepEqual(JSON.parse(f.sqlite.prepare('SELECT data FROM transactions ORDER BY id').get().data), f.batch.transactions[0].data);
  assert.equal((await saveImportedBatch(f.db, input, f.root)).alreadySaved, true);
  assert.equal(f.count(), 2);
  const legacy = await fixture(context);
  legacy.batch.source = 'hangseng';
  legacy.batch.transactions.forEach((row) => { row.currency = ''; });
  legacy.batch.transactions[0].data = f.batch.transactions[0].data;
  await legacy.write();
  await saveImportedBatch(legacy.db, { ...legacy.request, accountId: 3 }, legacy.root);
  assert.equal(legacy.balance(3), 30000 - 5500 + 13226);
  assert.deepEqual(JSON.parse(legacy.sqlite.prepare('SELECT data FROM transactions ORDER BY id').get().data), f.batch.transactions[0].data);
});

test('client metadata cannot turn a screenshot batch into an unrestricted-currency PDF batch', async (context) => {
  const f = await fixture(context);
  const input = edits(f);
  input.editedRows.forEach((row) => { row.accountId = 3; row.data = { source: 'hangseng-bank' }; });
  await assert.rejects(saveImportedBatch(f.db, input, f.root), /人民币/);
  assert.equal(f.count(), 0);
});

test('bank PDF source supports legacy and edited saves in the chosen account currency', async (context) => {
  for (const edited of [false, true]) {
    const f = await fixture(context);
    f.batch.source = 'hangseng-bank';
    f.batch.transactions.forEach((row) => { row.currency = ''; row.data = {}; });
    await f.write();
    const input = edited ? edits(f) : { ...f.request, accountId: 3 };
    if (edited) input.editedRows.forEach((row) => { row.accountId = 3; });
    await saveImportedBatch(f.db, input, f.root);
    assert.equal(f.balance(3), 30000 - 5500 + 13226);
    assert.equal(f.balance(1), 10000);
    assert.equal(f.count(), 2);
    assert.equal((await saveImportedBatch(f.db, input, f.root)).alreadySaved, true);
  }
});

test('Alipay HK legacy and edited batches require HKD accounts and preserve balances/idempotency', async (context) => {
  for (const edited of [false, true]) {
    const f = await fixture(context);
    f.sqlite.prepare("UPDATE accounts SET currency='HKD' WHERE id=3").run();
    f.batch.source = 'alipay-hk';
    f.batch.transactions.forEach((row) => { row.currency = 'HKD'; });
    await f.write();
    const input = edited ? edits(f) : { ...f.request, accountId: 3 };
    if (edited) input.editedRows.forEach((row) => { row.accountId = 3; });
    await saveImportedBatch(f.db, input, f.root);
    assert.equal(f.balance(3), 30000 - 5500 + 13226);
    assert.equal(f.balance(), 10000);
    assert.equal((await saveImportedBatch(f.db, input, f.root)).alreadySaved, true);
    assert.equal(f.count(), 2);
  }
  const invalid = await fixture(context);
  invalid.batch.source = 'alipay-hk';
  invalid.batch.transactions.forEach((row) => { row.currency = 'HKD'; });
  await invalid.write();
  await assert.rejects(saveImportedBatch(invalid.db, invalid.request, invalid.root), /港币/);
  await assert.rejects(saveImportedBatch(invalid.db, edits(invalid), invalid.root), /港币/);
  assert.equal(invalid.count(), 0);
  const forged = await fixture(context);
  forged.sqlite.prepare("UPDATE accounts SET currency='HKD' WHERE id=3").run();
  const input = edits(forged);
  input.editedRows.forEach((row) => { row.accountId = 3; row.data = { source: 'alipay-hk' }; });
  await assert.rejects(saveImportedBatch(forged.db, input, forged.root), /人民币/);
});

test('save rejects ambiguous account and edited-preview requests without changing balances', async (context) => {
  const f = await fixture(context);
  await assert.rejects(saveImportedBatch(f.db, { ...edits(f), accountId: 2 }, f.root), /有效账户/);
  assert.equal(f.count(), 0);
  assert.equal(f.balance(), 10000);
  assert.equal(f.balance(2), 20000);
});

test('edited preview persists corrections to separate accounts and leaves original OCR JSON unchanged', async (context) => {
  const f = await fixture(context);
  f.batch.transactions[0].amount = null;
  f.batch.transactions[0].importDebug.errors = ['Invalid OCR'];
  f.batch.transactions[0].aiCategory = { status: 'error', errors: ['Invalid AI'] };
  await f.write();
  const originalJson = await readFile(f.file, 'utf8');
  const input = edits(f);
  input.editedRows[0] = { ...input.editedRows[0], amount: 2000, notes: 'Corrected',
    manualReview: { fields: true, category: true } };
  input.editedRows[1].accountId = 2;
  const result = await saveImportedBatch(f.db, input, f.root);
  assert.equal(result.count, 2);
  assert.equal(f.balance(), 8000);
  assert.equal(f.balance(2), 33226);
  assert.deepEqual(f.sqlite.prepare('SELECT account_id, amount, notes FROM transactions ORDER BY id').all(), [
    { account_id: 1, amount: 2000, notes: 'Corrected' },
    { account_id: 2, amount: 13226, notes: 'Test income' },
  ]);
  assert.equal(await readFile(f.file, 'utf8'), originalJson);
  assert.equal((await saveImportedBatch(f.db, input, f.root)).alreadySaved, true);
  assert.equal(f.balance(), 8000);
  assert.equal(f.balance(2), 33226);
});

test('preview deletions omit rows and cannot introduce unknown or duplicate IDs', async (context) => {
  const f = await fixture(context);
  const input = edits(f);
  await assert.rejects(saveImportedBatch(f.db, {
    ...input, editedRows: [{ ...input.editedRows[0], id: -999 }],
  }, f.root), /编号/);
  await assert.rejects(saveImportedBatch(f.db, {
    ...input, editedRows: [input.editedRows[0], input.editedRows[0]],
  }, f.root), /编号/);
  await assert.rejects(saveImportedBatch(f.db, { batchId: f.batchId, editedRows: [] }, f.root));
  await saveImportedBatch(f.db, { ...input, editedRows: [input.editedRows[0]] }, f.root);
  assert.equal(f.count(), 1);
  assert.equal(f.balance(), 4500);
  assert.equal(f.balance(2), 20000);
});

test('unconfirmed OCR/AI errors cannot be bypassed by posting edited values', async (context) => {
  const f = await fixture(context);
  f.batch.transactions[0].importDebug.errors = ['Bad OCR'];
  f.batch.transactions[0].aiCategory = { status: 'error', errors: ['Bad AI'] };
  await f.write();
  const input = edits(f);
  await assert.rejects(saveImportedBatch(f.db, input, f.root), /错误|无效/);
  input.editedRows[0].manualReview.category = true;
  await assert.rejects(saveImportedBatch(f.db, input, f.root), /错误|无效/);
  input.editedRows[0].manualReview = { fields: true, category: false };
  await assert.rejects(saveImportedBatch(f.db, input, f.root), /错误|无效/);
  input.editedRows[0].manualReview.category = true;
  input.editedRows[0].amount = 0;
  await assert.rejects(saveImportedBatch(f.db, input, f.root));
  assert.equal(f.count(), 0);
  assert.equal(f.balance(), 10000);
});

test('invalid per-row accounts and midway failures roll back every account in edited batch', async (context) => {
  const f = await fixture(context);
  const input = edits(f);
  for (const accountId of [3, 999]) {
    input.editedRows[1].accountId = accountId;
    await assert.rejects(saveImportedBatch(f.db, input, f.root), /人民币|不存在/);
  }
  input.editedRows[1].accountId = 2;
  f.sqlite.exec("CREATE TRIGGER fail_edited BEFORE INSERT ON transactions WHEN NEW.account_id=2 BEGIN SELECT RAISE(ABORT, 'edited failure'); END");
  await assert.rejects(saveImportedBatch(f.db, input, f.root), /edited failure/);
  assert.equal(f.count(), 0);
  assert.equal(f.balance(), 10000);
  assert.equal(f.balance(2), 20000);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='wechat_import_batches'").get().n, 0);
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
    { amount: -100, type: 'income', isRefund: true }, { amount: 100, isRefund: true },
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
