import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function userDirectory(userId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId)) {
    throw new Error('Invalid user storage identifier');
  }
  return path.join(path.dirname(process.env.DATABASE_URL ?? './data/accounting.db'), 'users', userId);
}

const storage = globalThis as typeof globalThis & {
  accountingUserDatabases?: Map<string, ReturnType<typeof drizzle>>;
};
export function openUserDatabase(userId: string): ReturnType<typeof drizzle> {
  const directory = userDirectory(userId);
  const databases = storage.accountingUserDatabases ??= new Map();
  const existing = databases.get(directory);
  if (existing) return existing;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const sqlite = new Database(path.join(directory, 'accounting.db'));
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: path.resolve('drizzle') });
    databases.set(directory, db);
    return db;
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
