#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
docker compose -f compose.production.yaml exec -T app node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const root = path.dirname(process.env.DATABASE_URL);
const directory = path.join(root, 'backups', new Date().toISOString().replaceAll(':', '-'));
async function backup(filename, relative = path.relative(root, filename)) {
  const destination = path.join(directory, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const database = new Database(filename, { readonly: true });
  try {
    await database.backup(destination);
    fs.chmodSync(destination, 0o600);
    console.log(`Consistent SQLite backup saved: ${destination}`);
  } finally { database.close(); }
}
async function main() {
  if (fs.existsSync(process.env.DATABASE_URL)) await backup(process.env.DATABASE_URL, 'accounting.db');
  const authFilename = process.env.AUTH_DATABASE_URL || path.join(root, 'auth.db');
  if (fs.existsSync(authFilename)) await backup(authFilename, 'auth.db');
  const users = path.join(root, 'users');
  if (fs.existsSync(users)) {
    for (const entry of fs.readdirSync(users, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const filename = path.join(users, entry.name, 'accounting.db');
      if (fs.existsSync(filename)) await backup(filename);
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
NODE
