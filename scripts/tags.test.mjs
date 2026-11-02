import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { backfillTagHierarchy } from './backfill-tag-hierarchy.mjs';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.includes('/src/')) {
      return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});
const { saveTag, deleteTag } = await import('../src/lib/tags.ts');
const { updateTransactionTags } = await import('../src/lib/transaction-tags.ts');
const { getTagSelectionState } = await import('../src/lib/tag-selection.ts');
function fixture(context) {
  const sqlite = new Database(':memory:');
  context.after(() => sqlite.close());
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`CREATE TABLE tags(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT);
    CREATE TABLE transaction_tags(transaction_id INTEGER, tag_id INTEGER REFERENCES tags(id), PRIMARY KEY(transaction_id,tag_id));
    INSERT INTO tags VALUES(1,'Existing','#123456');
    INSERT INTO transaction_tags VALUES(123,1);`);
  backfillTagHierarchy(sqlite);
  return { sqlite, db: drizzle(sqlite) };
}
const input = (name, patch = {}) => ({ code: name.trim().replaceAll(' ', '-').toLowerCase(), name, parentId: '', icon: 'Label', color: '', ...patch });

test('additive tag migration is repeatable and preserves existing tag/link records', (context) => {
  const { sqlite } = fixture(context);
  backfillTagHierarchy(sqlite);
  assert.deepEqual(sqlite.prepare('SELECT * FROM tags').get(), {
    id: 1, name: 'Existing', color: '#123456', icon: null, parent_id: null, sort_order: 0, code: 'tag-1',
  });
  assert.deepEqual(sqlite.prepare('SELECT * FROM transaction_tags').all(), [{ transaction_id: 123, tag_id: 1 }]);
  assert.equal(sqlite.pragma('foreign_key_check').length, 0);
});

test('create/update parent-child tags persist icons/colors, defaults and trimmed names', (context) => {
  const { sqlite, db } = fixture(context);
  const root = saveTag(db, input('  Travel  ', { icon: 'Flight', color: '#abcdef' }));
  const child = saveTag(db, input('Hotel', { parentId: root }));
  assert.deepEqual(sqlite.prepare('SELECT name,icon,color,parent_id FROM tags WHERE id=?').get(root), {
    name: 'Travel', icon: 'Flight', color: '#abcdef', parent_id: null,
  });
  assert.equal(sqlite.prepare('SELECT color FROM tags WHERE id=?').get(child).color, null);
  saveTag(db, input('Hotel edited', { parentId: root, color: '#123123', icon: 'Hotel' }), child);
  assert.deepEqual(sqlite.prepare('SELECT name,icon,color,parent_id FROM tags WHERE id=?').get(child), {
    name: 'Hotel edited', icon: 'Hotel', color: '#123123', parent_id: root,
  });
  saveTag(db, input('Hotel promoted'), child);
  assert.match(sqlite.prepare('SELECT color FROM tags WHERE id=?').get(child).color, /^#[\da-f]{6}$/i);
});

test('hierarchy rejects self-parenting, three levels, missing parents and moving a parent with children', (context) => {
  const { db } = fixture(context);
  const root = saveTag(db, input('Root'));
  const child = saveTag(db, input('Child', { parentId: root }));
  assert.throws(() => saveTag(db, input('Self', { parentId: root }), root), /一级标签/);
  assert.throws(() => saveTag(db, input('Third', { parentId: child })), /一级标签/);
  assert.throws(() => saveTag(db, input('Missing', { parentId: 999 })), /一级标签/);
  assert.throws(() => saveTag(db, input('Moved', { parentId: 1 }), root), /含有子标签/);
  assert.throws(() => saveTag(db, input('Not found'), 999), /不存在/);
});

test('duplicate/invalid names and colors reject without inserting', (context) => {
  const { db, sqlite } = fixture(context);
  for (const bad of [input('Existing'), input(''), input('x'.repeat(101)), input('Bad', { color: 'red' }), input('Bad', { parentId: 'abc' })]) {
    assert.throws(() => saveTag(db, bad));
  }
  assert.equal(sqlite.prepare('SELECT count(*) n FROM tags').get().n, 1);
});

test('tag codes are required, normalized and globally unique on create/update', (context) => {
  const { db, sqlite } = fixture(context);
  const root = saveTag(db, input('Root', { code: '  Travel_HK-1  ' }));
  assert.equal(sqlite.prepare('SELECT code FROM tags WHERE id=?').get(root).code, 'travel_hk-1');
  saveTag(db, input('Root renamed', { code: 'TRAVEL_HK-1' }), root);
  assert.throws(() => saveTag(db, input('Other', { code: 'TRAVEL_HK-1', parentId: root })), /代码已被使用/);
  const other = saveTag(db, input('Other'));
  assert.throws(() => saveTag(db, input('Other', { code: 'travel_hk-1' }), other), /代码已被使用/);
  for (const code of ['', ' ', '中文', 'a b', 'a'.repeat(51), undefined, null]) {
    assert.throws(() => saveTag(db, input('Invalid', { code })));
  }
  saveTag(db, input('Root renamed', { code: 'new-code' }), root);
  assert.equal(sqlite.prepare('SELECT code FROM tags WHERE id=?').get(root).code, 'new-code');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM tags').get().n, 3);
  assert.throws(() => sqlite.prepare('INSERT INTO tags(name,code) VALUES(?,?)').run('Direct duplicate', 'new-code'), /UNIQUE/);
});

test('code backfill preserves assigned codes and avoids collisions without changing hierarchy or links', (context) => {
  const { sqlite } = fixture(context);
  sqlite.prepare('UPDATE tags SET code=? WHERE id=1').run('tag-2');
  sqlite.exec("INSERT INTO tags(id,name,parent_id,icon,color) VALUES(2,'Child',1,'Hotel','#abcdef')");
  backfillTagHierarchy(sqlite);
  assert.deepEqual(sqlite.prepare('SELECT id,code,parent_id,icon,color FROM tags ORDER BY id').all(), [
    { id: 1, code: 'tag-2', parent_id: null, icon: null, color: '#123456' },
    { id: 2, code: 'tag-2-2', parent_id: 1, icon: 'Hotel', color: '#abcdef' },
  ]);
  backfillTagHierarchy(sqlite);
  assert.equal(sqlite.prepare('SELECT code FROM tags WHERE id=2').get().code, 'tag-2-2');
  assert.deepEqual(sqlite.prepare('SELECT * FROM transaction_tags').all(), [{ transaction_id: 123, tag_id: 1 }]);
});

test('delete guards linked tags and parents, removes only unused leaf tags', (context) => {
  const { db, sqlite } = fixture(context);
  const root = saveTag(db, input('Root'));
  const child = saveTag(db, input('Child', { parentId: root }));
  assert.throws(() => deleteTag(db, 1), /已有流水/);
  assert.throws(() => deleteTag(db, root), /子标签/);
  assert.throws(() => deleteTag(db, 999), /不存在/);
  assert.throws(() => deleteTag(db, 'bad'), /编号/);
  deleteTag(db, child);
  deleteTag(db, root);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM tags').get().n, 1);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM transaction_tags').get().n, 1);
});

function transactionFixture(context) {
  const result = fixture(context);
  result.sqlite.exec(`CREATE TABLE accounts(id INTEGER PRIMARY KEY, balance INTEGER);
    INSERT INTO accounts VALUES(1,123456);
    CREATE TABLE transactions(id INTEGER PRIMARY KEY, type TEXT, amount INTEGER, account_id INTEGER, data TEXT);
    INSERT INTO transactions VALUES(123,'expense',100,1,'{}'),(124,'income',200,1,'{}'),(125,'transfer',300,1,'{}'),(126,'adjustment',-400,1,'{}');`);
  const parent = saveTag(result.db, input('Parent'));
  const child = saveTag(result.db, input('Child', { parentId: parent }));
  return { ...result, parent, child };
}

test('bulk add/remove is idempotent and preserves unrelated tags, transactions and balances', (context) => {
  const { db, sqlite, parent, child } = transactionFixture(context);
  const before = sqlite.prepare('SELECT * FROM transactions').all();
  const balances = sqlite.prepare('SELECT * FROM accounts').all();
  const request = { transactionIds: [123, 124, 125, 126], tagIds: [parent, child], operation: 'add' };
  updateTransactionTags(db, request);
  updateTransactionTags(db, request);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM transaction_tags').get().n, 9);
  assert.throws(() => deleteTag(db, child), /已有流水/);
  updateTransactionTags(db, { transactionIds: [123, 124], tagIds: [child], operation: 'remove' });
  updateTransactionTags(db, { transactionIds: [123, 124], tagIds: [child], operation: 'remove' });
  assert.equal(sqlite.prepare('SELECT count(*) n FROM transaction_tags').get().n, 7);
  assert.ok(sqlite.prepare('SELECT 1 FROM transaction_tags WHERE transaction_id=123 AND tag_id=1').get());
  assert.ok(sqlite.prepare('SELECT 1 FROM transaction_tags WHERE transaction_id=125 AND tag_id=?').get(child));
  assert.deepEqual(sqlite.prepare('SELECT * FROM transactions').all(), before);
  assert.deepEqual(sqlite.prepare('SELECT * FROM accounts').all(), balances);
});

test('bulk tags reject missing/stale/duplicate/oversized input atomically', (context) => {
  const { db, sqlite, child } = transactionFixture(context);
  const initial = sqlite.prepare('SELECT * FROM transaction_tags').all();
  const valid = { transactionIds: [123, 124], tagIds: [child], operation: 'add' };
  for (const patch of [
    { transactionIds: [] }, { tagIds: [] }, { tagIds: [child, child] }, { transactionIds: [123, 123] },
    { transactionIds: [123, 999] }, { tagIds: [child, 999] }, { operation: 'replace' },
    { tagIds: [-1] }, { transactionIds: ['bad'] }, { transactionIds: Array.from({ length: 501 }, (_, i) => i + 1) },
    { tagIds: Array.from({ length: 501 }, (_, i) => i + 1) },
  ]) {
    assert.throws(() => updateTransactionTags(db, { ...valid, ...patch }));
    assert.deepEqual(sqlite.prepare('SELECT * FROM transaction_tags').all(), initial);
  }
  assert.throws(() => updateTransactionTags(db, { ...valid, tagIds: [child, 999], operation: 'remove' }));
  assert.deepEqual(sqlite.prepare('SELECT * FROM transaction_tags').all(), initial);
});

test('database failures roll back every link in the batch', (context) => {
  const { db, sqlite, child } = transactionFixture(context);
  sqlite.exec(`CREATE TRIGGER reject_test_tag BEFORE INSERT ON transaction_tags WHEN NEW.transaction_id=124
    BEGIN SELECT RAISE(ABORT,'test failure'); END;`);
  assert.throws(() => updateTransactionTags(db, { transactionIds: [123, 124], tagIds: [child], operation: 'add' }), /test failure/);
  assert.deepEqual(sqlite.prepare('SELECT * FROM transaction_tags').all(), [{ transaction_id: 123, tag_id: 1 }]);
});

test('tag selection distinguishes none, all and partial without inheriting parent tags', () => {
  const rows = [{ id: 1, tags: [{ id: 10 }, { id: 11 }] }, { id: 2, tags: [{ id: 10 }] }];
  assert.equal(getTagSelectionState([], 10), 'none');
  assert.equal(getTagSelectionState(rows, 10), 'all');
  assert.equal(getTagSelectionState(rows, 11), 'some');
  assert.equal(getTagSelectionState(rows, 99), 'none');
  assert.equal(getTagSelectionState([{ id: 3 }, { id: 4, tags: [] }], 10), 'none');
  assert.equal(getTagSelectionState([rows[0]], 11), 'all');
  assert.equal(getTagSelectionState([rows[1]], 11), 'none');
  assert.equal(getTagSelectionState([{ id: 1, tags: [{ id: 11 }] }], 10), 'none');
});

test('partial click adds to all, checked click removes from all, and empty click adds to all', (context) => {
  const { db, sqlite, child } = transactionFixture(context);
  updateTransactionTags(db, { transactionIds: [123], tagIds: [child], operation: 'add' });
  const selected = () => [123, 124].map((id) => ({
    id, tags: sqlite.prepare('SELECT tag_id AS id FROM transaction_tags WHERE transaction_id=?').all(id),
  }));
  const click = () => updateTransactionTags(db, {
    transactionIds: [123, 124], tagIds: [child],
    operation: getTagSelectionState(selected(), child) === 'all' ? 'remove' : 'add',
  });
  assert.equal(getTagSelectionState(selected(), child), 'some');
  click();
  assert.equal(getTagSelectionState(selected(), child), 'all');
  click();
  assert.equal(getTagSelectionState(selected(), child), 'none');
  click();
  assert.equal(getTagSelectionState(selected(), child), 'all');
  assert.ok(sqlite.prepare('SELECT 1 FROM transaction_tags WHERE transaction_id=123 AND tag_id=1').get());
});
