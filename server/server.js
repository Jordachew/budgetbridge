#!/usr/bin/env node
'use strict';
// ===========================================================
// BudgetBridge local server — one process, one SQLite file,
// serves the app and its API over your local network. No
// external services, no npm install required (Node 22+ only).
// Run: node server/server.js   (see README "Running on your
// local network" for how to keep it running and reachable).
// ===========================================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword, newId, seededAdmin, DB_PATH } = require('./db.js');
const { createSession, destroySession, setSessionCookie, clearSessionCookie, currentUser, canEditCategory } = require('./auth.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- helpers

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
function nowIso() { return new Date().toISOString(); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.map': 'application/json',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------- row -> API shape mappers

const rowToCategory = (r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order });
const rowToProject = (r) => ({ code: r.code, name: r.name, categoryId: r.category_id, active: !!r.active });
const rowToBudgetLine = (r) => ({ id: r.id, fiscalYear: r.fiscal_year, projectCode: r.project_code, month: r.month, amount: r.amount });
const rowToNote = (r) => ({ id: r.id, fiscalYear: r.fiscal_year, projectCode: r.project_code, text: r.text });
const rowToTx = (r) => ({
  id: r.id, project: r.project, ferc: r.ferc, year: r.year, month: r.month, balanceType: r.balance_type,
  docType: r.doc_type, docNo: r.doc_no, desc: r.description, vendor: r.vendor, amount: r.amount,
  postedDate: r.posted_date, batchId: r.batch_id,
});
const rowToBatch = (r) => ({ id: r.id, date: r.date, filename: r.filename, rowCount: r.row_count, type: r.type });
const rowToUser = (r) => ({ id: r.id, name: r.name, username: r.username, role: r.role, active: !!r.active });

// ---------------------------------------------------------------- route table
// Each entry: [method, path-regex, handler(req,res,user,params,body)]
// requireAuth / requireAdmin wrap handlers that need it.

function requireAuth(handler) {
  return async (req, res, user, params, body) => {
    if (!user) return sendJson(res, 401, { error: 'Not signed in' });
    return handler(req, res, user, params, body);
  };
}
function requireAdmin(handler) {
  return requireAuth(async (req, res, user, params, body) => {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin only' });
    return handler(req, res, user, params, body);
  });
}

const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }

// ---- auth ----
route('POST', /^\/api\/login$/, async (req, res, _user, _params, body) => {
  const { username, password } = body || {};
  if (!username || !password) return sendJson(res, 400, { error: 'Username and password required' });
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim().toLowerCase());
  if (!row || !row.active || !verifyPassword(password, row.password_hash, row.password_salt)) {
    return sendJson(res, 401, { error: 'Incorrect username or password' });
  }
  const { token, expires } = createSession(row.id);
  setSessionCookie(res, token, expires);
  sendJson(res, 200, { user: rowToUser(row) });
});

route('POST', /^\/api\/logout$/, async (req, res, user) => {
  if (user) destroySession(user.sessionToken);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
});

route('GET', /^\/api\/me$/, async (req, res, user) => {
  if (!user) return sendJson(res, 401, { error: 'Not signed in' });
  sendJson(res, 200, { user: { id: user.id, name: user.name, username: user.username, role: user.role, assignedCategoryIds: user.assignedCategoryIds } });
});

route('POST', /^\/api\/me\/password$/, requireAuth(async (req, res, user, _params, body) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!body.oldPassword || !verifyPassword(body.oldPassword, row.password_hash, row.password_salt)) {
    return sendJson(res, 400, { error: 'Current password is incorrect' });
  }
  if (!body.newPassword || body.newPassword.length < 6) return sendJson(res, 400, { error: 'New password must be at least 6 characters' });
  const { hash, salt } = hashPassword(body.newPassword);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, user.id);
  sendJson(res, 200, { ok: true });
}));

// ---- bootstrap: everything the app needs to render, for any signed-in user ----
route('GET', /^\/api\/bootstrap$/, requireAuth(async (req, res, user) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all().map(rowToCategory);
  const projects = db.prepare('SELECT * FROM projects').all().map(rowToProject);
  const budgetLines = db.prepare('SELECT * FROM budget_lines').all().map(rowToBudgetLine);
  const planNotes = db.prepare('SELECT * FROM plan_notes').all().map(rowToNote);
  const transactions = db.prepare('SELECT * FROM transactions').all().map(rowToTx);
  const importBatches = db.prepare('SELECT * FROM import_batches').all().map(rowToBatch);
  sendJson(res, 200, {
    categories, projects, budgetLines, planNotes, transactions, importBatches,
    me: { id: user.id, name: user.name, username: user.username, role: user.role, assignedCategoryIds: user.assignedCategoryIds },
  });
}));

// ---- categories (cost item groups) — admin manages the structure ----
route('POST', /^\/api\/categories$/, requireAdmin(async (req, res, user, _params, body) => {
  if (!body.name || !body.name.trim()) return sendJson(res, 400, { error: 'Name required' });
  const id = body.id || newId('cat');
  const sortOrder = body.sortOrder ?? db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name')
    .run(id, body.name.trim(), sortOrder);
  sendJson(res, 200, { category: rowToCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(id)) });
}));
route('PATCH', /^\/api\/categories\/([^/]+)$/, requireAdmin(async (req, res, user, [id], body) => {
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(body.name.trim(), id);
  sendJson(res, 200, { ok: true });
}));
route('DELETE', /^\/api\/categories\/([^/]+)$/, requireAdmin(async (req, res, user, [id]) => {
  const inUse = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE category_id = ?').get(id).n;
  if (inUse > 0) return sendJson(res, 400, { error: 'Cost item group still has cost items assigned. Reassign them first.' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  db.prepare('DELETE FROM manager_assignments WHERE category_id = ?').run(id);
  sendJson(res, 200, { ok: true });
}));

// ---- projects (cost items) — admin, or the manager assigned to that group ----
route('POST', /^\/api\/projects$/, requireAuth(async (req, res, user, _params, body) => {
  if (!body.code || !body.name || !body.categoryId) return sendJson(res, 400, { error: 'Code, name and cost item group required' });
  if (!canEditCategory(user, body.categoryId)) return sendJson(res, 403, { error: 'You can only add cost items to a group you manage' });
  const existing = db.prepare('SELECT code FROM projects WHERE code = ?').get(body.code);
  if (existing) return sendJson(res, 400, { error: 'That code is already in use' });
  db.prepare('INSERT INTO projects (code, name, category_id, active) VALUES (?,?,?,1)').run(body.code.trim(), body.name.trim(), body.categoryId);
  sendJson(res, 200, { project: rowToProject(db.prepare('SELECT * FROM projects WHERE code = ?').get(body.code.trim())) });
}));
route('PATCH', /^\/api\/projects\/([^/]+)$/, requireAuth(async (req, res, user, [code], body) => {
  const row = db.prepare('SELECT * FROM projects WHERE code = ?').get(code);
  if (!row) return sendJson(res, 404, { error: 'Not found' });
  if (!canEditCategory(user, row.category_id)) return sendJson(res, 403, { error: 'Not your cost item group' });
  if (body.categoryId && !canEditCategory(user, body.categoryId)) return sendJson(res, 403, { error: 'You cannot move a cost item into a group you do not manage' });
  const name = body.name != null ? body.name.trim() : row.name;
  const categoryId = body.categoryId != null ? body.categoryId : row.category_id;
  db.prepare('UPDATE projects SET name = ?, category_id = ? WHERE code = ?').run(name, categoryId, code);
  sendJson(res, 200, { ok: true });
}));
route('DELETE', /^\/api\/projects\/([^/]+)$/, requireAuth(async (req, res, user, [code]) => {
  const row = db.prepare('SELECT * FROM projects WHERE code = ?').get(code);
  if (!row) return sendJson(res, 404, { error: 'Not found' });
  if (!canEditCategory(user, row.category_id)) return sendJson(res, 403, { error: 'Not your cost item group' });
  db.prepare('DELETE FROM projects WHERE code = ?').run(code);
  db.prepare('DELETE FROM budget_lines WHERE project_code = ?').run(code);
  db.prepare('DELETE FROM plan_notes WHERE project_code = ?').run(code);
  sendJson(res, 200, { ok: true });
}));

// ---- budget lines ----
function projectCategory(code) {
  const row = db.prepare('SELECT category_id FROM projects WHERE code = ?').get(code);
  return row ? row.category_id : null;
}
route('POST', /^\/api\/budget-lines$/, requireAuth(async (req, res, user, _params, body) => {
  const { fiscalYear, projectCode, month, amount } = body;
  if (!fiscalYear || !projectCode || !month) return sendJson(res, 400, { error: 'fiscalYear, projectCode and month required' });
  if (!canEditCategory(user, projectCategory(projectCode))) return sendJson(res, 403, { error: 'Not your cost item group' });
  const id = `${fiscalYear}:${projectCode}:${month}`;
  db.prepare(`INSERT INTO budget_lines (id, fiscal_year, project_code, month, amount, updated_at, updated_by) VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(id, fiscalYear, projectCode, month, Number(amount) || 0, nowIso(), user.id);
  sendJson(res, 200, { ok: true });
}));
route('POST', /^\/api\/budget-lines\/bulk$/, requireAuth(async (req, res, user, _params, body) => {
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const stmt = db.prepare(`INSERT INTO budget_lines (id, fiscal_year, project_code, month, amount, updated_at, updated_by) VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at, updated_by = excluded.updated_by`);
  let applied = 0;
  const tx = db.exec.bind(db);
  tx('BEGIN');
  try {
    for (const l of lines) {
      if (!canEditCategory(user, projectCategory(l.projectCode))) continue;
      const id = `${l.fiscalYear}:${l.projectCode}:${l.month}`;
      stmt.run(id, l.fiscalYear, l.projectCode, l.month, Number(l.amount) || 0, nowIso(), user.id);
      applied++;
    }
    tx('COMMIT');
  } catch (e) { tx('ROLLBACK'); throw e; }
  sendJson(res, 200, { applied, skipped: lines.length - applied });
}));

// ---- plan notes ----
route('POST', /^\/api\/plan-notes$/, requireAuth(async (req, res, user, _params, body) => {
  const { fiscalYear, projectCode, text } = body;
  if (!canEditCategory(user, projectCategory(projectCode))) return sendJson(res, 403, { error: 'Not your cost item group' });
  const id = `${fiscalYear}:${projectCode}`;
  const trimmed = (text || '').trim();
  if (!trimmed) { db.prepare('DELETE FROM plan_notes WHERE id = ?').run(id); return sendJson(res, 200, { ok: true, deleted: true }); }
  db.prepare(`INSERT INTO plan_notes (id, fiscal_year, project_code, text, updated_at, updated_by) VALUES (?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(id, fiscalYear, projectCode, trimmed, nowIso(), user.id);
  sendJson(res, 200, { ok: true });
}));

// ---- transactions import (admin: this is the technical GL-export step) ----
route('POST', /^\/api\/transactions\/import$/, requireAdmin(async (req, res, user, _params, body) => {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return sendJson(res, 400, { error: 'No rows to import' });
  const batchId = newId('batch');
  const stmt = db.prepare(`INSERT INTO transactions (id, project, ferc, year, month, balance_type, doc_type, doc_no, description, vendor, amount, posted_date, batch_id)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, posted_date = excluded.posted_date`);
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      stmt.run(r.id, r.project, r.ferc || null, r.year, r.month, r.balanceType || 'A', r.docType || null, r.docNo || null, r.desc || null, r.vendor || null, Number(r.amount) || 0, r.postedDate || null, r.batchId || batchId);
    }
    db.prepare('INSERT INTO import_batches (id, date, filename, row_count, type) VALUES (?,?,?,?,?)')
      .run(batchId, nowIso(), body.filename || null, rows.length, body.type || null);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  sendJson(res, 200, { batch: rowToBatch(db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId)) });
}));
route('DELETE', /^\/api\/transactions\/batch\/([^/]+)$/, requireAdmin(async (req, res, user, [id]) => {
  db.prepare('DELETE FROM transactions WHERE batch_id = ?').run(id);
  db.prepare('DELETE FROM import_batches WHERE id = ?').run(id);
  sendJson(res, 200, { ok: true });
}));

// ---- danger zone (admin) ----
route('POST', /^\/api\/admin\/clear-transactions$/, requireAdmin(async (req, res) => {
  db.exec('DELETE FROM transactions; DELETE FROM import_batches;');
  sendJson(res, 200, { ok: true });
}));
route('POST', /^\/api\/admin\/wipe-all$/, requireAdmin(async (req, res) => {
  db.exec('DELETE FROM transactions; DELETE FROM import_batches; DELETE FROM budget_lines; DELETE FROM plan_notes; DELETE FROM projects; DELETE FROM manager_assignments; DELETE FROM categories;');
  sendJson(res, 200, { ok: true });
}));

// ---- user & assignment management (admin) ----
route('GET', /^\/api\/admin\/users$/, requireAdmin(async (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at').all().map((r) => {
    const assignedCategoryIds = db.prepare('SELECT category_id FROM manager_assignments WHERE user_id = ?').all(r.id).map((a) => a.category_id);
    return { ...rowToUser(r), assignedCategoryIds };
  });
  sendJson(res, 200, { users });
}));
route('POST', /^\/api\/admin\/users$/, requireAdmin(async (req, res, admin, _params, body) => {
  const { name, username, password, role } = body;
  if (!name || !username || !password || !['admin', 'manager'].includes(role)) return sendJson(res, 400, { error: 'Name, username, password and role required' });
  const uname = String(username).trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(uname)) return sendJson(res, 400, { error: 'That username is already taken' });
  if (password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters' });
  const id = newId('usr');
  const { hash, salt } = hashPassword(password);
  db.prepare('INSERT INTO users (id, name, username, password_hash, password_salt, role, active, created_at) VALUES (?,?,?,?,?,?,1,?)')
    .run(id, name.trim(), uname, hash, salt, role, nowIso());
  sendJson(res, 200, { user: rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
}));
route('PATCH', /^\/api\/admin\/users\/([^/]+)$/, requireAdmin(async (req, res, admin, [id], body) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return sendJson(res, 404, { error: 'Not found' });
  const name = body.name != null ? body.name.trim() : row.name;
  const role = body.role != null ? body.role : row.role;
  const active = body.active != null ? (body.active ? 1 : 0) : row.active;
  db.prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(name, role, active, id);
  if (body.password) {
    if (body.password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters' });
    const { hash, salt } = hashPassword(body.password);
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id);
  }
  sendJson(res, 200, { ok: true });
}));
route('DELETE', /^\/api\/admin\/users\/([^/]+)$/, requireAdmin(async (req, res, admin, [id]) => {
  if (id === admin.id) return sendJson(res, 400, { error: "You can't delete your own account" });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM manager_assignments WHERE user_id = ?').run(id);
  sendJson(res, 200, { ok: true });
}));
route('PUT', /^\/api\/admin\/users\/([^/]+)\/assignments$/, requireAdmin(async (req, res, admin, [id], body) => {
  const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM manager_assignments WHERE user_id = ?').run(id);
    const stmt = db.prepare('INSERT OR IGNORE INTO manager_assignments (user_id, category_id) VALUES (?,?)');
    for (const catId of categoryIds) stmt.run(id, catId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  sendJson(res, 200, { ok: true });
}));

// ---------------------------------------------------------------- dispatch

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  const matched = routes.find((r) => r.method === req.method && r.pattern.test(pathname));
  if (!matched) return sendJson(res, 404, { error: 'No such endpoint' });

  try {
    const body = (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') ? await readBody(req) : {};
    const user = currentUser(req);
    const groups = matched.pattern.exec(pathname).slice(1);
    await matched.handler(req, res, user, groups, body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BudgetBridge server running at http://localhost:${PORT}`);
  console.log(`On your local network, other machines can reach it at http://<this-machine's-IP>:${PORT}`);
  console.log(`Database file: ${DB_PATH}`);
  if (seededAdmin) {
    console.log('');
    console.log('First run — an admin account was created:');
    console.log(`  Username: ${seededAdmin.username}`);
    console.log(`  Password: ${seededAdmin.password}`);
    console.log('Sign in and change this password (or create named accounts) right away.');
    console.log('');
  }
});
