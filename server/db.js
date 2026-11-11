import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function createDatabase(filename) {
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS mods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'General',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS votes (
      mod_id INTEGER NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mod_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar TEXT,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO settings (key, value) VALUES ('voting_open', 'true');
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  return db;
}

export function modResults(db, userId) {
  return db.prepare(`
    SELECT m.*, COUNT(v.user_id) AS votes,
      MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS voted
    FROM mods m LEFT JOIN votes v ON v.mod_id = m.id
    GROUP BY m.id ORDER BY votes DESC, m.name COLLATE NOCASE ASC
  `).all(userId || '');
}
