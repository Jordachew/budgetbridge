// ===========================================================
// BudgetBridge server — SQLite storage (node:sqlite, built into
// Node 22+, zero npm dependencies). One file database that holds
// the whole team's shared budget: this is the "everyone rolls up
// into one" source of truth the browser-only version couldn't be.
// ===========================================================
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const DATA_DIR = process.env.BUDGETBRIDGE_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'budgetbridge.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','manager')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS manager_assignments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id TEXT PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  project_code TEXT NOT NULL,
  month INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  updated_at TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS plan_notes (
  id TEXT PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  project_code TEXT NOT NULL,
  text TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  ferc TEXT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  balance_type TEXT NOT NULL,
  doc_type TEXT,
  doc_no TEXT,
  description TEXT,
  vendor TEXT,
  amount REAL NOT NULL,
  posted_date TEXT,
  batch_id TEXT
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  date TEXT,
  filename TEXT,
  row_count INTEGER,
  type TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return { hash, salt: s };
}
function verifyPassword(password, hash, salt) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}
function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

// Seed a first admin account if the database is brand new, so there's
// always a way in without editing SQL by hand.
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
let seededAdmin = null;
if (userCount === 0) {
  const password = crypto.randomBytes(6).toString('base64url');
  const { hash, salt } = hashPassword(password);
  const id = newId('usr');
  db.prepare(
    'INSERT INTO users (id, name, username, password_hash, password_salt, role, active, created_at) VALUES (?,?,?,?,?,?,1,?)'
  ).run(id, 'Admin', 'admin', hash, salt, 'admin', new Date().toISOString());
  seededAdmin = { username: 'admin', password };
}

module.exports = { db, hashPassword, verifyPassword, newId, seededAdmin, DB_PATH };
