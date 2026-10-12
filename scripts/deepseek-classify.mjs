#!/usr/bin/env node

import Database from 'better-sqlite3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCategoryTree,
  classifyTransactions,
  normalizeTransactions,
} from './lib/deepseek-category-classifier.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `
用 DeepSeek 根据数据库 category 树为 txn description 预测分类。

用法:
  npm run deepseek:classify -- --input <transactions.json> [options]

必需环境变量:
  DEEPSEEK_API_KEY       DeepSeek API key（不会从命令行参数读取）

选项:
  --input <path>         输入 JSON，格式为 {"transactions":[{"id":1,"description":"..."}]}
  --output <path>        输出 JSON（默认 data/deepseek-category-predictions.json）
  --db <path>            SQLite 数据库路径（默认 DATABASE_URL 或 data/accounting.db）
  --model <name>         DeepSeek 模型（默认 deepseek-chat）
  --batch-size <number>  每次 API 请求的交易数量，1-100（默认 20）
  --base-url <url>       API 基础 URL（默认 https://api.deepseek.com）
  --help                 显示帮助

只生成分类建议，不会写入或修改数据库。
`;

function parseArguments(args) {
  const options = {};
  const valueOptions = new Set(['--input', '--output', '--db', '--model', '--batch-size', '--base-url']);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!valueOptions.has(argument)) {
      throw new Error(`未知参数: ${argument}\n${HELP}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`参数 ${argument} 缺少值`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }

  return options;
}

function resolveFromRoot(filePath) {
  return isAbsolute(filePath) ? filePath : resolve(ROOT, filePath);
}

function readCategoryTree(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const categoryRows = database.prepare(`
      SELECT
        id,
        code,
        name,
        type,
        parent_id AS parentId,
        sort_order AS sortOrder
      FROM categories
      ORDER BY sort_order, name
    `).all();
    return buildCategoryTree(categoryRows);
  } finally {
    database.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP.trimStart());
    return;
  }

  if (!options.input) {
    throw new Error(`请提供 --input 文件\n${HELP}`);
  }
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    throw new Error('请先设置 DEEPSEEK_API_KEY 环境变量；key 不要放在命令行参数或输入文件中');
  }

  const inputPath = resolveFromRoot(options.input);
  const outputPath = resolveFromRoot(options.output ?? 'data/deepseek-category-predictions.json');
  const configuredDatabasePath = options.db ?? process.env.DATABASE_URL ?? 'data/accounting.db';
  const databasePath = resolveFromRoot(configuredDatabasePath);
  const model = options.model ?? 'deepseek-chat';
  const batchSize = Number(options['batch-size'] ?? 20);

  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError('--batch-size 必须是 1 到 100 之间的整数');
  }

  const inputPayload = JSON.parse(await readFile(inputPath, 'utf8'));
  const transactions = normalizeTransactions(inputPayload);
  const categoryTree = readCategoryTree(databasePath);
  const results = await classifyTransactions({
    transactions,
    categoryTree,
    apiKey: process.env.DEEPSEEK_API_KEY,
    model,
    batchSize,
    baseUrl: options['base-url'] ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  });

  const output = {
    source: inputPath,
    database: databasePath,
    model,
    generatedAt: new Date().toISOString(),
    categoryTree,
    results,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`已分类 ${results.length} 笔交易，结果写入 ${outputPath}\n数据库未被修改。\n`);
}

main().catch((error) => {
  process.stderr.write(`DeepSeek 分类失败: ${error.message}\n`);
  process.exitCode = 1;
});