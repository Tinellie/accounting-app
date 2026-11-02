import nextEnv from '@next/env';
import Database from 'better-sqlite3';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function backfillTagHierarchy(database) {
  database.transaction(() => {
    const columns = database.pragma('table_info(tags)');
    if (!columns.length) throw new Error('Tags table does not exist; initialize the database first.');
    for (const [name, definition] of [
      ['icon', 'TEXT'],
      ['parent_id', 'INTEGER REFERENCES tags(id) ON DELETE RESTRICT'],
      ['sort_order', 'INTEGER NOT NULL DEFAULT 0'],
      ['code', 'TEXT'],
    ]) {
      if (!columns.some((column) => column.name === name)) database.exec(`ALTER TABLE tags ADD COLUMN ${name} ${definition}`);
    }
    const rows = database.prepare('SELECT id, code FROM tags ORDER BY id').all();
    const used = new Set(rows.filter((row) => row.code?.trim()).map((row) => row.code.toLowerCase()));
    const update = database.prepare('UPDATE tags SET code = ? WHERE id = ?');
    for (const row of rows) {
      if (row.code?.trim()) continue;
      const base = `tag-${row.id}`;
      let code = base;
      let suffix = 2;
      while (used.has(code)) code = `${base}-${suffix++}`;
      update.run(code, row.id);
      used.add(code);
    }
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS tags_code_unique ON tags(code)');
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  nextEnv.loadEnvConfig(process.cwd());
  const database = new Database(process.env.DATABASE_URL ?? './data/accounting.db');
  try {
    backfillTagHierarchy(database);
    console.log('Tag hierarchy ready; existing tags and transaction links preserved.');
  } finally {
    database.close();
  }
}
