'use strict';
const crypto = require('node:crypto');
const { db, newId } = require('./db.js');

const SESSION_DAYS = 30;
const COOKIE_NAME = 'bb_session';

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(token, userId, now.toISOString(), expires.toISOString());
  return { token, expires };
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token, expires) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Resolves the logged-in user for a request, or null. */
function currentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.id, u.name, u.username, u.role, u.active, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).get(token);
  if (!row || !row.active) return null;
  if (new Date(row.expires_at) < new Date()) { destroySession(token); return null; }
  const assignments = db.prepare('SELECT category_id FROM manager_assignments WHERE user_id = ?').all(row.id).map((r) => r.category_id);
  return { id: row.id, name: row.name, username: row.username, role: row.role, assignedCategoryIds: assignments, sessionToken: token };
}

/** Can this user edit budget lines / notes / add cost items under this category? */
function canEditCategory(user, categoryId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.assignedCategoryIds.includes(categoryId);
}

module.exports = { createSession, destroySession, parseCookies, setSessionCookie, clearSessionCookie, currentUser, canEditCategory, COOKIE_NAME };
