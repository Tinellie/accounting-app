import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const databaseUrl = process.env.DATABASE_URL ?? "./data/accounting.db";

type DrizzleDatabase = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
	__sqlite?: Database.Database;
	__db?: DrizzleDatabase;
};

const sqlite = globalForDb.__sqlite ?? new Database(databaseUrl);

if (!globalForDb.__sqlite) {
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
}

const db = globalForDb.__db ?? drizzle(sqlite);

if (process.env.NODE_ENV !== "production") {
	globalForDb.__sqlite = sqlite;
	globalForDb.__db = db;
}

export { db };
