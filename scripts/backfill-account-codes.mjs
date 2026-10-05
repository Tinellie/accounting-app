import nextEnv from '@next/env';
import Database from 'better-sqlite3';

nextEnv.loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL ?? './data/accounting.db';
const database = new Database(databaseUrl);

try {
  const columns = database.pragma('table_info(accounts)');
  if (!columns.some((column) => column.name === 'code')) {
    database.exec('ALTER TABLE accounts ADD COLUMN code TEXT');
  }

  const backfill = database.transaction(() => {
    const rows = database.prepare(
      "SELECT id FROM accounts WHERE code IS NULL OR length(trim(code)) = 0 ORDER BY id",
    ).all();
    const update = database.prepare('UPDATE accounts SET code = ? WHERE id = ?');

    for (const row of rows) {
      update.run(`account-${row.id}`, row.id);
    }

    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_unique ON accounts(code)');
    return rows.length;
  });

  const backfilledCount = backfill();
  console.log(`Account codes ready; backfilled ${backfilledCount} account(s).`);
} finally {
  database.close();
}