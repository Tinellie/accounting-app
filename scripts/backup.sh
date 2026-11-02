#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
docker compose -f compose.production.yaml exec -T app node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const filename = process.env.DATABASE_URL;
const directory = path.join(path.dirname(filename), 'backups');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const destination = path.join(directory, `accounting-${new Date().toISOString().replaceAll(':', '-')}.db`);
const database = new Database(filename, { readonly: true });
database.backup(destination).then(() => {
  database.close();
  fs.chmodSync(destination, 0o600);
  console.log(`Consistent SQLite backup saved: ${destination}`);
}).catch((error) => {
  database.close();
  console.error(error);
  process.exitCode = 1;
});
NODE
