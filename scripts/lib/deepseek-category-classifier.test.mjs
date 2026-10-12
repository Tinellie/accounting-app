import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCategoryTree,
  buildClassificationMessages,
  classifyTransactions,
  normalizeTransactions,
} from './deepseek-category-classifier.mjs';

const categoryRows = [
  { id: 1, code: 'ml', name: 'Meals', type: 'expense', parent_id: null, sort_order: 0 },
  { id: 2, code: 'res', name: 'Restaurants', type: 'expense', parent_id: 1, sort_order: 0 },
  { id: 3, code: 'sa', name: 'Salary', type: 'income', parent_id: null, sort_order: 0 },
];

const transactions = [
  { id: 7, description: '餐厅午餐' },
  { id: 'pay-1', description: '工资到账' },
];

test('normalizes transaction input and rejects duplicate IDs', () => {
  assert.deepEqual(normalizeTransactions({
    transactions: [{ id: ' 7 ', description: '  午餐  ' }],
  }), [{ id: ' 7 ', description: '午餐' }]);

  assert.throws(
    () => normalizeTransactions({ transactions: [{ id: 1, description: 'A' }, { id: '1', description: 'B' }] }),
    /ID 重复/,
  );
});

test('builds a sorted category tree with only matching-type children', () => {
  assert.deepEqual(buildCategoryTree(categoryRows), [
    {
      id: 1,
      code: 'ml',
      name: 'Meals',
      type: 'expense',
      children: [{ id: 2, code: 'res', name: 'Restaurants', type: 'expense' }],
    },
    { id: 3, code: 'sa', name: 'Salary', type: 'income', children: [] },
  ]);

  assert.throws(
    () => buildCategoryTree([{ ...categoryRows[1], type: 'income' }]),
    /父分类不存在或层级\/类型无效/,
  );
});

test('prompts for one JSON result per transaction and marks descriptions untrusted', () => {
  const messages = buildClassificationMessages(transactions, buildCategoryTree(categoryRows));

  assert.match(messages[0].content, /不可信的交易数据/);
  assert.match(messages[0].content, /categoryCode/);
  assert.match(messages[1].content, /Restaurants/);
  assert.match(messages[1].content, /工资到账/);
});

test('classifies in batches and returns normalized results in original order', async () => {
  const categoryTree = buildCategoryTree(categoryRows);
  const requests = [];
  const fetchImpl = async (url, options) => {
    const request = JSON.parse(options.body);
    requests.push({ url, options, request });
    const userMessage = request.messages[1].content;
    const input = JSON.parse(userMessage.slice(userMessage.indexOf('\n') + 1));
    const results = input.transactions.map((transaction) => {
      const isIncome = transaction.description.includes('工资');
      return {
        id: transaction.id,
        categoryId: isIncome ? 3 : 2,
        categoryCode: isIncome ? 'sa' : 'res',
        confidence: 0.91,
        reason: isIncome ? '工资收入' : '餐饮消费',
      };
    }).reverse();

    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results }) } }] }));
  };

  const results = await classifyTransactions({
    transactions,
    categoryTree,
    apiKey: 'test-key',
    batchSize: 1,
    baseUrl: 'https://example.test/v1/',
    fetchImpl,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://example.test/v1/chat/completions');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(results.map((result) => result.id), [7, 'pay-1']);
  assert.deepEqual(results.map((result) => result.categoryCode), ['res', 'sa']);
  assert.deepEqual(results.map((result) => result.categoryPath), ['Meals / Restaurants', 'Salary']);
});

test('rejects model output that refers to a category outside the supplied tree', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      results: [{ id: 7, categoryId: 99, categoryCode: 'fake', confidence: 0.8, reason: 'test' }],
    }) } }],
  }));

  await assert.rejects(
    classifyTransactions({
      transactions: [transactions[0]],
      categoryTree: buildCategoryTree(categoryRows),
      apiKey: 'test-key',
      fetchImpl,
    }),
    /不在 category 树中/,
  );
});