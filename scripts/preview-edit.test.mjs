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
const { updateRowSelection, assignPreviewAccount, assignPreviewCategory, editPreviewRow,
  activeOcrErrors, hasActiveAiError, hasActiveAiWarning, serializePreviewRows } = await import('../src/lib/wechat-import/preview.ts');

const accounts = [{ id: 1, name: 'Test', currency: 'CNY' }, { id: 2, name: 'Other', currency: 'USD' }];
const categories = [
  { id: 1, name: 'Food', type: 'expense', parentId: null, icon: null, color: '#123456' },
  { id: 2, name: 'Salary', type: 'income', parentId: null, icon: null, color: null },
];
function row() {
  return {
    id: -1, type: 'expense', amount: null, occurredAt: null, accountId: null, notes: 'Test',
    data: { future: { enabled: true } },
    importDebug: { errors: ['Invalid OCR date'] },
    aiCategory: { status: 'error', errors: ['Invalid AI category'], rawResponse: { result: 'bad' } },
  };
}

test('normal selection toggles; Alt selection keeps only the clicked item even if already checked', () => {
  const current = new Set([-1, -2]);
  assert.deepEqual([...updateRowSelection(current, -3, true)], [-1, -2, -3]);
  assert.deepEqual([...updateRowSelection(current, -1, false)], [-2]);
  assert.deepEqual([...updateRowSelection(current, -1, false, true)], [-1]);
  assert.deepEqual([...updateRowSelection(current, -3, true, true)], [-3]);
  assert.deepEqual([...current], [-1, -2]);
});

test('manual category confirmation clears AI errors only, preserving original OCR and raw AI', () => {
  const original = row();
  const updated = assignPreviewCategory(original, categories[0], categories);
  assert.equal(hasActiveAiError(updated), false);
  assert.deepEqual(activeOcrErrors(updated), ['Invalid OCR date']);
  assert.equal(updated.importDebug, original.importDebug);
  assert.equal(updated.aiCategory, original.aiCategory);
  assert.equal(updated.categoryId, 1);
  assert.throws(() => assignPreviewCategory(original, categories[1], categories), /分类/);
});

test('full edit validates account/category, resolves both error types and preserves debug data', () => {
  const original = row();
  const updated = editPreviewRow(original, {
    type: 'expense', amount: -4500, occurredAt: new Date('2025-12-31T02:29:00Z'),
    accountId: 1, categoryId: 1, notes: 'Manual refund',
  }, accounts, categories);
  assert.deepEqual(activeOcrErrors(updated), []);
  assert.equal(hasActiveAiError(updated), false);
  assert.equal(updated.isRefund, true);
  assert.equal(updated.importDebug, original.importDebug);
  assert.equal(updated.aiCategory, original.aiCategory);
  const serialized = serializePreviewRows([updated]);
  assert.equal(serialized[0].occurredAt, '2025-12-31T02:29:00.000Z');
  assert.deepEqual(serialized[0].data, original.data);
  assert.deepEqual(serialized[0].manualReview, { fields: true, category: true });
  assert.equal('importDebug' in serialized[0], false);
  assert.equal('aiCategory' in serialized[0], false);
  assert.throws(() => assignPreviewAccount(original, accounts[1]), /人民币/);
});

test('unreviewed rows cannot serialize and manually confirmed warnings are no longer active', () => {
  assert.throws(() => serializePreviewRows([row()]));
  const warning = { ...row(), aiCategory: { status: 'warning' } };
  assert.equal(hasActiveAiWarning(warning), true);
  assert.equal(hasActiveAiWarning(assignPreviewCategory(warning, categories[0], categories)), false);
});
