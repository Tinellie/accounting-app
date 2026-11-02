import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
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
const { amountFilterExtent, exchangeRateSchema, filterTransactions, initialTransactionFilters, signedFilterAmount } =
  await import('../src/lib/transaction-filters.ts');
const rates = { base: 'CNY', date: '2026-11-02', rates: { CNY: 1, HKD: 1.1, USD: 0.14 } };
const row = (id, patch = {}) => ({
  id, type: 'expense', amount: 10000, currency: 'CNY', notes: 'Coffee TEST', accountId: 1,
  toAccountId: null, categoryId: 1, occurredAt: new Date(2026, 10, 2, 12), ...patch,
});
const ids = (rows, patch, exchange = rates) => filterTransactions(rows, { ...initialTransactionFilters, ...patch }, exchange).map((row) => row.id);

test('default filters preserve ordering and all currencies without needing exchange rates', () => {
  const rows = [row(3, { currency: 'UNKNOWN' }), row(1), row(2, { type: 'adjustment' })];
  assert.deepEqual(ids(rows, {}, null), [3, 1, 2]);
  assert.equal(filterTransactions(rows, initialTransactionFilters, null)[0], rows[0]);
});

test('description is case-insensitive trimmed substring matching; empty descriptions are safe', () => {
  const rows = [row(1), row(2, { notes: 'coffee refund' }), row(3, { notes: null }), row(4, { notes: '中文描述' })];
  assert.deepEqual(ids(rows, { description: ' COFFEE ' }), [1, 2]);
  assert.deepEqual(ids(rows, { description: '文描' }), [4]);
  assert.deepEqual(ids(rows, { description: 'missing' }), []);
});

test('type/account multi-selection ORs within fields, ANDs between fields and matches both sides of transfers', () => {
  const rows = [row(1), row(2, { type: 'income', accountId: 2 }),
    row(3, { type: 'transfer', accountId: 2, toAccountId: 3 }), row(4, { type: 'adjustment', accountId: 3 })];
  assert.deepEqual(ids(rows, { types: ['expense', 'adjustment'] }), [1, 4]);
  assert.deepEqual(ids(rows, { accountIds: ['1', '3'] }), [1, 3, 4]);
  assert.deepEqual(ids(rows, { types: ['income', 'transfer'], accountIds: ['3'] }), [3]);
});

test('signed amounts use final display signs for expenses, refunds, incomes, transfers and adjustments', () => {
  const rows = [row(1), row(2, { amount: -10000 }), row(3, { type: 'income' }),
    row(4, { type: 'transfer' }), row(5, { type: 'adjustment', amount: -5000 })];
  assert.deepEqual(rows.map((row) => signedFilterAmount(row, 'CNY', true, null)), [-10000, 10000, 10000, 10000, -5000]);
  assert.deepEqual(ids(rows, { minimum: '-100.00', maximum: '-50' }, null), [1, 5]);
  assert.deepEqual(ids(rows, { minimum: '100', maximum: '100' }, null), [2, 3, 4]);
  assert.deepEqual(ids(rows, { maximum: '-100.01' }, null), []);
});

test('category multi-selection matches exact categories, combines with other filters and resets to all', () => {
  const rows = [row(1), row(2, { categoryId: 2, type: 'income' }),
    row(3, { categoryId: 3 }), row(4, { categoryId: null, type: 'transfer' })];
  assert.deepEqual(ids(rows, { categoryIds: ['1', '2'] }), [1, 2]);
  assert.deepEqual(ids(rows, { categoryIds: ['1', '2'], types: ['expense'] }), [1]);
  assert.deepEqual(ids(rows, { categoryIds: ['3'], accountIds: ['2'] }), []);
  assert.deepEqual(ids(rows, { categoryIds: ['999'] }), []);
  assert.deepEqual(ids(rows, { categoryIds: [] }), [1, 2, 3, 4]);
});

test('latest-rate conversion crosses via CNY, rounds symmetrically to cents and never mutates original data', () => {
  const hkd = row(1, { currency: 'HKD', amount: 11000 });
  assert.equal(signedFilterAmount(hkd, 'CNY', true, rates), -10000);
  assert.equal(signedFilterAmount(hkd, 'USD', true, rates), -1400);
  assert.equal(signedFilterAmount(row(2), 'HKD', true, rates), -11000);
  assert.equal(signedFilterAmount(row(3, { type: 'income', amount: 1 }), 'USD', true, rates), 0);
  assert.equal(signedFilterAmount(row(4, { amount: 1 }), 'HKD', true, rates), -1);
  assert.equal(hkd.amount, 11000);
  assert.equal(hkd.currency, 'HKD');
  assert.deepEqual(ids([hkd, row(5)], { currency: 'USD', minimum: '-14', maximum: '-14' }), [1, 5]);
});

test('disabling conversion shows only the chosen original currency even without an amount range', () => {
  const rows = [row(1), row(2, { currency: 'HKD' }), row(3, { currency: 'USD' })];
  assert.deepEqual(ids(rows, { convert: false, currency: 'HKD' }, null), [2]);
  assert.deepEqual(ids(rows, { convert: false, currency: 'HKD', maximum: '-100' }, null), [2]);
  assert.equal(signedFilterAmount(rows[0], 'HKD', false, null), null);
});

test('missing/invalid rates and out-of-range converted amounts fail explicitly, never assume parity', () => {
  assert.throws(() => ids([row(1, { currency: 'HKD' })], { maximum: '100' }, null), /缺少 HKD/);
  assert.throws(() => signedFilterAmount(row(1), 'UNKNOWN', true, rates), /缺少/);
  assert.throws(() => signedFilterAmount(row(1, { amount: Number.MAX_SAFE_INTEGER }), 'HKD', true, rates), /安全范围/);
  assert.equal(exchangeRateSchema.safeParse({ ...rates, rates: { HKD: 0 } }).success, false);
  assert.equal(exchangeRateSchema.safeParse({ ...rates, date: 'bad' }).success, false);
});

test('amount extent respects signed conversion/currency mode, equal endpoints and empty results', () => {
  const rows = [row(1), row(2, { type: 'income', currency: 'HKD', amount: 22000 }), row(3, { type: 'adjustment', amount: 0 })];
  assert.deepEqual(amountFilterExtent(rows, initialTransactionFilters, rates), [-10000, 20000]);
  assert.deepEqual(amountFilterExtent(rows, { ...initialTransactionFilters, currency: 'HKD', convert: false }, null), [22000, 22000]);
  assert.deepEqual(amountFilterExtent([], initialTransactionFilters, null), [0, 0]);
});

test('date endpoints include the entire local calendar day and combine with other filters', () => {
  const rows = [row(1, { occurredAt: new Date(2026, 10, 1, 23, 59, 59, 999) }),
    row(2, { occurredAt: new Date(2026, 10, 2, 0) }),
    row(3, { occurredAt: new Date(2026, 10, 2, 23, 59, 59, 999) }),
    row(4, { occurredAt: new Date(2026, 10, 3, 0) })];
  assert.deepEqual(ids(rows, { startDate: '2026-11-02', endDate: '2026-11-02' }), [2, 3]);
  assert.deepEqual(ids(rows, { endDate: '2026-11-01' }), [1]);
  assert.deepEqual(ids(rows, { startDate: '2026-11-03', description: 'TEST' }), [4]);
});

test('malformed bounds, reversed ranges and invalid calendar dates report errors', () => {
  for (const patch of [
    { minimum: 'a' }, { maximum: '1.001' }, { minimum: '2', maximum: '1' },
    { startDate: '2026-11-03', endDate: '2026-11-02' }, { startDate: 'invalid' },
    { endDate: '2026-02-29' }, { startDate: '2026-13-01' },
  ]) assert.throws(() => ids([row(1)], patch));
});
