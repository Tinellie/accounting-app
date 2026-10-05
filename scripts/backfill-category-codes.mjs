import nextEnv from '@next/env';
import Database from 'better-sqlite3';

nextEnv.loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL ?? './data/accounting.db';
const database = new Database(databaseUrl);

try {
  const columns = database.pragma('table_info(categories)');
  if (!columns.some((column) => column.name === 'code')) {
    database.exec('ALTER TABLE categories ADD COLUMN code TEXT');
  }

  const backfill = database.transaction(() => {
    const rows = database.prepare(
      "SELECT id FROM categories WHERE code IS NULL OR length(trim(code)) = 0 ORDER BY id",
    ).all();
    const update = database.prepare('UPDATE categories SET code = ? WHERE id = ?');

    for (const row of rows) {
      update.run(`category-${row.id}`, row.id);
    }

    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS categories_code_unique ON categories(code)');
    return rows.length;
  });

  const backfilledCount = backfill();
  console.log(`Category codes ready; backfilled ${backfilledCount} categor${backfilledCount === 1 ? 'y' : 'ies'}.`);
} finally {
  database.close();
}