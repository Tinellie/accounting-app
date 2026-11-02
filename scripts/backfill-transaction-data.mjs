import nextEnv from '@next/env';
import Database from 'better-sqlite3';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function backfillTransactionData(database) {
  return database.transaction(() => {
    const columns = database.pragma('table_info(transactions)');
    if (!columns.length) throw new Error('Transactions table does not exist; initialize the database first.');
    if (!columns.some((column) => column.name === 'data')) {
      database.exec("ALTER TABLE transactions ADD COLUMN data TEXT NOT NULL DEFAULT '{}'");
    }
    return database.prepare("UPDATE transactions SET data = '{}' WHERE data IS NULL").run().changes;
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  nextEnv.loadEnvConfig(process.cwd());
  const database = new Database(process.env.DATABASE_URL ?? './data/accounting.db');
  try {
    const count = backfillTransactionData(database);
    console.log(`Transaction data ready; backfilled ${count} null value(s). Existing rows default to {}.`);
  } finally {
    database.close();
  }
}
