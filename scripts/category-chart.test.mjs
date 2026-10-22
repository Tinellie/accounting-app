import assert from 'node:assert/strict';
import test from 'node:test';
import { groupCategoryChartEntries, sortCategoryChartEntries } from '../src/lib/category-chart.ts';

test('hierarchical legend has parent totals and sorted children matching slice order', () => {
  const entries = [
    { id: 21, groupId: 2, amount: 900 },
    { id: 11, groupId: 1, amount: 400 },
    { id: 12, groupId: 1, amount: 700 },
    { id: 22, groupId: 2, amount: 50 },
  ];
  const groups = groupCategoryChartEntries(entries);
  assert.deepEqual(groups.map((group) => ({
    total: group.total,
    ids: group.entries.map((entry) => entry.id),
  })), [{ total: 1100, ids: [12, 11] }, { total: 950, ids: [21, 22] }]);
  assert.deepEqual(groups.flatMap((group) => group.entries), sortCategoryChartEntries(entries));
});

test('sorts parent groups by combined amount, then children by amount', () => {
  const entries = [
    { id: 21, groupId: 2, amount: 900 },
    { id: 11, groupId: 1, amount: 400 },
    { id: 12, groupId: 1, amount: 700 },
    { id: 22, groupId: 2, amount: 50 },
  ];
  const result = sortCategoryChartEntries(entries);
  assert.deepEqual(result.map((entry) => entry.id), [12, 11, 21, 22]);
  assert.deepEqual(entries.map((entry) => entry.id), [21, 11, 12, 22]);
  assert.equal(result.reduce((total, entry) => total + entry.amount, 0), 2050);
});

test('includes direct parent transactions in their group and keeps uncategorized separate', () => {
  const entries = [
    { id: 'uncategorized', groupId: null, amount: 600 },
    { id: 1, groupId: 1, amount: 200 },
    { id: 11, groupId: 1, amount: 500 },
    { id: 2, groupId: 2, amount: 400 },
  ];
  assert.deepEqual(sortCategoryChartEntries(entries).map((entry) => entry.id), [
    11, 1, 'uncategorized', 2,
  ]);
});

test('retains source order for equal group totals and equal child amounts', () => {
  const entries = [
    { id: 21, groupId: 2, amount: 100 },
    { id: 11, groupId: 1, amount: 200 },
    { id: 22, groupId: 2, amount: 100 },
  ];
  assert.deepEqual(sortCategoryChartEntries(entries).map((entry) => entry.id), [21, 22, 11]);
});

test('handles empty data and a single category', () => {
  assert.deepEqual(sortCategoryChartEntries([]), []);
  const entry = { id: 1, groupId: 1, amount: 100 };
  assert.deepEqual(sortCategoryChartEntries([entry]), [entry]);
});
