import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { backfillTransactionData } from './backfill-transaction-data.mjs';
import { transactions } from '../src/db/schema.ts';
import { transactionDataSchema } from '../src/lib/transaction-data.ts';

test('additive migration defaults existing/new transactions and is repeatable without changing balances', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER);
      INSERT INTO accounts VALUES (1, 12345);
      CREATE TABLE transactions (id INTEGER PRIMARY KEY, type TEXT, amount INTEGER,
        occurred_at INTEGER, account_id INTEGER, to_account_id INTEGER, category_id INTEGER,
        notes TEXT, created_at INTEGER);
      INSERT INTO transactions (id, type, amount, account_id) VALUES (1, 'expense', 500, 1);
    `);
    backfillTransactionData(sqlite);
    assert.equal(sqlite.prepare('SELECT data FROM transactions WHERE id=1').get().data, '{}');
    const column = sqlite.pragma('table_info(transactions)').find((c) => c.name === 'data');
    assert.equal(column.notnull, 1);
    assert.equal(column.dflt_value, "'{}'");
    const db = drizzle(sqlite);
    const data = { source: 'test', nested: { flag: true, entries: [null, 1, '中文'] } };
    db.update(transactions).set({ data }).where(eq(transactions.id, 1)).run();
    backfillTransactionData(sqlite);
    assert.deepEqual(db.select().from(transactions).get().data, data);
    db.update(transactions).set({ notes: 'Updated', amount: 700 }).where(eq(transactions.id, 1)).run();
    assert.deepEqual(db.select().from(transactions).get().data, data);
    db.insert(transactions).values({
      type: 'income', amount: 100, accountId: 1, occurredAt: new Date('2026-01-01T00:00:00Z'),
    }).run();
    const rows = db.select().from(transactions).all();
    assert.deepEqual(rows[1].data, {});
    assert.equal(sqlite.prepare('SELECT balance FROM accounts').get().balance, 12345);
  } finally {
    sqlite.close();
  }
});

test('transaction data accepts JSON objects, not arrays, primitives or non-JSON values', () => {
  assert.deepEqual(transactionDataSchema.parse({}), {});
  assert.deepEqual(transactionDataSchema.parse({ list: [1, null, { ok: true }] }), { list: [1, null, { ok: true }] });
  for (const invalid of [null, [], 1, 'text', { value: undefined }, { value: Infinity }, { value: new Date() }]) {
    assert.equal(transactionDataSchema.safeParse(invalid).success, false);
  }
});

test('migration fails explicitly for an uninitialized database', () => {
  const sqlite = new Database(':memory:');
  try {
    assert.throws(() => backfillTransactionData(sqlite), /does not exist/);
  } finally {
    sqlite.close();
  }
});
