/**
 * 数据库模块 - better-sqlite3 初始化与建表
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'webpackage.db');

let db = null;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL UNIQUE,
      phone         TEXT DEFAULT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_url    TEXT DEFAULT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      status        TEXT NOT NULL DEFAULT 'active',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      token_hash    TEXT NOT NULL,
      ip_address    TEXT DEFAULT NULL,
      expires_at    TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS categories (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      name          TEXT NOT NULL,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id                TEXT PRIMARY KEY,
      user_id           TEXT DEFAULT NULL,
      category_id       TEXT DEFAULT NULL,
      url               TEXT NOT NULL,
      app_name          TEXT NOT NULL,
      package_name      TEXT NOT NULL,
      display_name      TEXT DEFAULT NULL,
      icon_path         TEXT DEFAULT NULL,
      icon_original_name TEXT DEFAULT NULL,
      status            TEXT NOT NULL DEFAULT 'QUEUED',
      progress          INTEGER NOT NULL DEFAULT 0,
      current_step      TEXT DEFAULT NULL,
      error_message     TEXT DEFAULT NULL,
      apk_path          TEXT DEFAULT NULL,
      apk_size          INTEGER DEFAULT 0,
      apk_deleted       INTEGER NOT NULL DEFAULT 0,
      version_name      TEXT NOT NULL DEFAULT '1.0',
      version_code      INTEGER NOT NULL DEFAULT 1,
      download_token    TEXT NOT NULL,
      download_count    INTEGER NOT NULL DEFAULT 0,
      max_downloads     INTEGER NOT NULL DEFAULT 5,
      is_favorite       INTEGER NOT NULL DEFAULT 0,
      note              TEXT DEFAULT NULL,
      expires_at        TEXT DEFAULT NULL,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_expires ON tasks(expires_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_favorite ON tasks(user_id, is_favorite);

    CREATE TABLE IF NOT EXISTS quota_usage (
      id            TEXT PRIMARY KEY,
      user_id       TEXT DEFAULT NULL,
      ip_address    TEXT DEFAULT NULL,
      task_id       TEXT NOT NULL,
      used_at       TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_quota_user_date ON quota_usage(user_id, used_at);
    CREATE INDEX IF NOT EXISTS idx_quota_ip_date ON quota_usage(ip_address, used_at);

    CREATE TABLE IF NOT EXISTS operation_logs (
      id            TEXT PRIMARY KEY,
      user_id       TEXT DEFAULT NULL,
      task_id       TEXT DEFAULT NULL,
      action        TEXT NOT NULL,
      detail        TEXT DEFAULT NULL,
      ip_address    TEXT DEFAULT NULL,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_user ON operation_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_logs_task ON operation_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at);
  `);
}

module.exports = { getDB };
