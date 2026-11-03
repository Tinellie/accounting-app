import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-accounting_session' : 'accounting_session';
export const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
export type AuthUser = { id: string; username: string; displayName: string };
export type AuthSession = {
  id: string; userId: string; userAgent: string; createdAt: number; lastSeenAt: number; expiresAt: number;
};
type StoredUser = AuthUser & { passwordHash: string };
export class AuthError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{64}$/.test(expected ?? '')) {
    throw new Error('Invalid stored password hash');
  }
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function createAuthStore(filename: string) {
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, user_agent TEXT NOT NULL,
      created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
  `);
  const publicUser = (row: StoredUser): AuthUser => ({ id: row.id, username: row.username, displayName: row.displayName });
  const userByName = sqlite.prepare('SELECT id, username, display_name AS displayName, password_hash AS passwordHash FROM auth_users WHERE username = ?');
  const sessionByHash = sqlite.prepare(`
    SELECT s.id, s.user_id AS userId, s.user_agent AS userAgent, s.created_at AS createdAt,
      s.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt,
      u.username, u.display_name AS displayName
    FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `);
  function newSession(userId: string, userAgent: string) {
    const now = Date.now();
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    sqlite.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);
    sqlite.prepare(`INSERT INTO auth_sessions
      (id,user_id,token_hash,user_agent,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, userId, digest(token), userAgent.slice(0, 512), now, now, now + SESSION_DURATION);
    return { id, token };
  }
  return {
    close: () => sqlite.close(),
    rateLimit(key: string, maximum: number, duration: number) {
      const now = Date.now();
      const row = sqlite.prepare(`INSERT INTO auth_rate_limits (key,attempts,expires_at) VALUES (?,1,?)
        ON CONFLICT(key) DO UPDATE SET
        attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
        expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
        RETURNING attempts`).get(digest(key), now + duration, now, now) as { attempts: number };
      sqlite.prepare('DELETE FROM auth_rate_limits WHERE expires_at <= ?').run(now);
      if (row.attempts > maximum) throw new AuthError('尝试次数过多，请稍后重试');
    },
    async register(username: string, password: string, userAgent: string) {
      const passwordHash = await hashPassword(password);
      return sqlite.transaction(() => {
        if (userByName.get(username)) throw new AuthError('该用户名不可用');
        const user = { id: randomUUID(), username, displayName: username };
        sqlite.prepare('INSERT INTO auth_users (id,username,display_name,password_hash,created_at) VALUES (?,?,?,?,?)')
          .run(user.id, username, username, passwordHash, Date.now());
        return { user, ...newSession(user.id, userAgent) };
      })();
    },
    async login(username: string, password: string, userAgent: string) {
      const user = userByName.get(username) as StoredUser | undefined;
      const fallback = `scrypt$${'0'.repeat(32)}$${'0'.repeat(64)}`;
      const valid = await verifyPassword(password, user?.passwordHash ?? fallback);
      if (!user || !valid) throw new AuthError('用户名或密码不正确');
      // Re-read after hashing so a concurrent password change cannot revive old credentials.
      if ((userByName.get(username) as StoredUser | undefined)?.passwordHash !== user.passwordHash) {
        throw new AuthError('用户名或密码不正确');
      }
      return { user: publicUser(user), ...newSession(user.id, userAgent) };
    },
    session(token: string | undefined) {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const row = sessionByHash.get(digest(token), Date.now()) as
        (AuthSession & { username: string; displayName: string }) | undefined;
      if (!row) return null;
      if (Date.now() - row.lastSeenAt > 60_000) {
        sqlite.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(Date.now(), row.id);
      }
      return {
        user: { id: row.userId, username: row.username, displayName: row.displayName },
        session: { id: row.id, userId: row.userId, userAgent: row.userAgent, createdAt: row.createdAt,
          lastSeenAt: row.lastSeenAt, expiresAt: row.expiresAt },
      };
    },
    sessions(userId: string) {
      return sqlite.prepare(`SELECT id, user_id AS userId, user_agent AS userAgent, created_at AS createdAt,
        last_seen_at AS lastSeenAt, expires_at AS expiresAt FROM auth_sessions
        WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`).all(userId, Date.now()) as AuthSession[];
    },
    revoke(userId: string, sessionId: string) {
      sqlite.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND id = ?').run(userId, sessionId);
    },
    revokeOthers(userId: string, currentId: string) {
      sqlite.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND id <> ?').run(userId, currentId);
    },
    updateProfile(userId: string, displayName: string) {
      sqlite.prepare('UPDATE auth_users SET display_name = ? WHERE id = ?').run(displayName, userId);
    },
    async changePassword(userId: string, sessionId: string, currentPassword: string, password: string) {
      const user = sqlite.prepare('SELECT password_hash AS passwordHash FROM auth_users WHERE id = ?')
        .get(userId) as { passwordHash: string } | undefined;
      if (!user || !await verifyPassword(currentPassword, user.passwordHash)) throw new AuthError('当前密码不正确');
      const passwordHash = await hashPassword(password);
      return sqlite.transaction(() => {
        const updated = sqlite.prepare('UPDATE auth_users SET password_hash = ? WHERE id = ? AND password_hash = ?')
          .run(passwordHash, userId, user.passwordHash);
        const session = sqlite.prepare('SELECT user_agent AS userAgent FROM auth_sessions WHERE id = ? AND user_id = ? AND expires_at > ?')
          .get(sessionId, userId, Date.now()) as { userAgent: string } | undefined;
        if (!updated.changes || !session) throw new AuthError('登录状态已变化，请重新登录');
        sqlite.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
        return newSession(userId, session.userAgent);
      })();
    },
  };
}

type AuthStore = ReturnType<typeof createAuthStore>;
const globalAuth = globalThis as typeof globalThis & { accountingAuthStore?: AuthStore };
export function getAuthStore() {
  return globalAuth.accountingAuthStore ??= createAuthStore(
    process.env.AUTH_DATABASE_URL ?? path.join(path.dirname(process.env.DATABASE_URL ?? './data/accounting.db'), 'auth.db'),
  );
}
