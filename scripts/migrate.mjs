import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const filename = process.env.DATABASE_URL ?? './data/accounting.db';
mkdirSync(dirname(resolve(filename)), { recursive: true });
const sqlite = new Database(filename);
try {
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  const existing = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get();
  const managed = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get();
  if (existing && !managed) {
    throw new Error('Unmanaged existing database: back it up and explicitly baseline migrations before deployment. No tables were changed.');
  }
  migrate(drizzle(sqlite), { migrationsFolder: resolve('drizzle') });
  console.log('Database migrations complete.');
} finally {
  sqlite.close();
}
