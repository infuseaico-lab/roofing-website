// Review Tracker: a small zero-dependency Node server.
// Admin can add, edit, delete and import review records and manage viewer logins.
// Viewers can only read records.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 3000;

const ADMIN_USER = process.env.ADMIN_USER || 'edygal';
const ADMIN_PASS = process.env.ADMIN_PASS || '55555';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export const FIELDS = ['client', 'listing', 'pace', 'review', 'postDate', 'posterName', 'reviewLink', 'status', 'paid'];
export const STATUSES = ['Pending', 'Posted', 'Live', 'Removed'];

// ---------- storage ----------

function loadDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.records ??= [];
    db.viewers ??= [];
    db.companies ??= [];
    return db;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { records: [], viewers: [], companies: [] };
  }
}

let db = loadDb();

function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---------- auth ----------

const sessions = new Map(); // token -> { username, role, expires }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function checkCredentials(username, password) {
  if (safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASS)) {
    return { username: ADMIN_USER, role: 'admin' };
  }
  const viewer = db.viewers.find((v) => v.username.toLowerCase() === String(username).toLowerCase());
  if (viewer && safeEqual(hashPassword(String(password), viewer.salt).hash, viewer.hash)) {
    return { username: viewer.username, role: 'viewer' };
  }
  return null;
}

// Basic brute-force protection: 10 failed attempts per IP per 15 minutes.
const failedLogins = new Map();
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

function isLocked(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > LOCK_WINDOW_MS) return false;
  return entry.count >= MAX_FAILS;
}

function recordFail(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > LOCK_WINDOW_MS) {
    failedLogins.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count++;
  }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function getSession(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...s };
}

function sessionCookie(req, token, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
  return `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

// ---------- records ----------

function cleanRecord(input) {
  const r = {};
  for (const f of FIELDS) {
    if (f === 'paid') continue;
    r[f] = String(input?.[f] ?? '').trim().slice(0, f === 'review' ? 10000 : 1000);
  }
  if (!STATUSES.includes(r.status)) {
    r.status = STATUSES.find((s) => s.toLowerCase() === r.status.toLowerCase()) || 'Pending';
  }
  const paid = input?.paid;
  r.paid = paid === true || /^(yes|y|true|1|paid)$/i.test(String(paid ?? '').trim());
  return r;
}

function cleanCompany(input) {
  const text = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(text(v)) ? text(v) : '');
  const count = Number.parseInt(text(input?.reviewCount), 10);
  const amount = Number.parseFloat(text(input?.amountPaid).replace(/[$,\s]/g, ''));
  return {
    name: text(input?.name, 200),
    listingUrl: text(input?.listingUrl, 2000),
    reviewCount: Number.isFinite(count) && count >= 0 ? count : null,
    paymentDate: date(input?.paymentDate),
    amountPaid: Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null,
    startDate: date(input?.startDate),
  };
}

// ---------- http helpers ----------

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, 'Not found');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:",
    });
    res.end(data);
  });
}

// ---------- routes ----------

async function handleApi(req, res, pathname) {
  const method = req.method;

  // Reject cross-site writes (cookie is SameSite=Strict too; this is belt and braces).
  if (method !== 'GET' && req.headers['content-type']?.split(';')[0] !== 'application/json') {
    return send(res, 415, { error: 'Expected application/json' });
  }

  if (pathname === '/api/login' && method === 'POST') {
    const ip = req.socket.remoteAddress;
    if (isLocked(ip)) return send(res, 429, { error: 'Too many failed attempts. Try again in 15 minutes.' });
    const { username, password } = await readJson(req);
    const user = checkCredentials(String(username ?? '').trim(), String(password ?? ''));
    if (!user) {
      recordFail(ip);
      return send(res, 401, { error: 'Wrong username or password.' });
    }
    failedLogins.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { ...user, expires: Date.now() + SESSION_TTL_MS });
    return send(res, 200, user, { 'Set-Cookie': sessionCookie(req, token, SESSION_TTL_MS / 1000) });
  }

  const session = getSession(req);

  if (pathname === '/api/logout' && method === 'POST') {
    if (session) sessions.delete(session.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (!session) return send(res, 401, { error: 'Not logged in.' });
  const isAdmin = session.role === 'admin';

  if (pathname === '/api/me' && method === 'GET') {
    return send(res, 200, { username: session.username, role: session.role });
  }

  if (pathname === '/api/records' && method === 'GET') {
    return send(res, 200, { records: db.records, statuses: STATUSES });
  }

  if (!isAdmin) return send(res, 403, { error: 'View-only account.' });

  if (pathname === '/api/records' && method === 'POST') {
    const body = await readJson(req);
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), ...cleanRecord(body), createdAt: now, updatedAt: now };
    db.records.push(record);
    saveDb();
    return send(res, 201, record);
  }

  if (pathname === '/api/records/import' && method === 'POST') {
    const { records } = await readJson(req);
    if (!Array.isArray(records)) return send(res, 400, { error: 'Expected a list of records.' });
    const now = new Date().toISOString();
    const added = records.map((r) => ({ id: crypto.randomUUID(), ...cleanRecord(r), createdAt: now, updatedAt: now }));
    db.records.push(...added);
    saveDb();
    return send(res, 201, { added: added.length });
  }

  const recordMatch = pathname.match(/^\/api\/records\/([\w-]+)$/);
  if (recordMatch) {
    const idx = db.records.findIndex((r) => r.id === recordMatch[1]);
    if (idx === -1) return send(res, 404, { error: 'Record not found.' });
    if (method === 'PUT') {
      const body = await readJson(req);
      db.records[idx] = { ...db.records[idx], ...cleanRecord(body), updatedAt: new Date().toISOString() };
      saveDb();
      return send(res, 200, db.records[idx]);
    }
    if (method === 'DELETE') {
      db.records.splice(idx, 1);
      saveDb();
      return send(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/companies' && method === 'GET') {
    return send(res, 200, { companies: db.companies });
  }

  if (pathname === '/api/companies' && method === 'POST') {
    const company = cleanCompany(await readJson(req));
    if (!company.name) return send(res, 400, { error: 'Company name is required.' });
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), ...company, createdAt: now, updatedAt: now };
    db.companies.push(record);
    saveDb();
    return send(res, 201, record);
  }

  const companyMatch = pathname.match(/^\/api\/companies\/([\w-]+)$/);
  if (companyMatch) {
    const idx = db.companies.findIndex((c) => c.id === companyMatch[1]);
    if (idx === -1) return send(res, 404, { error: 'Company not found.' });
    if (method === 'PUT') {
      const company = cleanCompany(await readJson(req));
      if (!company.name) return send(res, 400, { error: 'Company name is required.' });
      db.companies[idx] = { ...db.companies[idx], ...company, updatedAt: new Date().toISOString() };
      saveDb();
      return send(res, 200, db.companies[idx]);
    }
    if (method === 'DELETE') {
      db.companies.splice(idx, 1);
      saveDb();
      return send(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/viewers' && method === 'GET') {
    return send(res, 200, { viewers: db.viewers.map((v) => ({ username: v.username, createdAt: v.createdAt })) });
  }

  if (pathname === '/api/viewers' && method === 'POST') {
    const body = await readJson(req);
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    if (!/^[\w.@-]{3,40}$/.test(username)) {
      return send(res, 400, { error: 'Username must be 3 to 40 letters, numbers, dots, dashes or underscores.' });
    }
    if (password.length < 5) return send(res, 400, { error: 'Password must be at least 5 characters.' });
    if (username.toLowerCase() === ADMIN_USER.toLowerCase()) return send(res, 400, { error: 'That username is taken.' });
    const existing = db.viewers.find((v) => v.username.toLowerCase() === username.toLowerCase());
    const { salt, hash } = hashPassword(password);
    if (existing) {
      Object.assign(existing, { salt, hash });
      // Changing a password signs that viewer out everywhere.
      for (const [t, s] of sessions) if (s.username === existing.username) sessions.delete(t);
    } else {
      db.viewers.push({ username, salt, hash, createdAt: new Date().toISOString() });
    }
    saveDb();
    return send(res, existing ? 200 : 201, { username, updated: Boolean(existing) });
  }

  const viewerMatch = pathname.match(/^\/api\/viewers\/([^/]+)$/);
  if (viewerMatch && method === 'DELETE') {
    const name = decodeURIComponent(viewerMatch[1]);
    const before = db.viewers.length;
    db.viewers = db.viewers.filter((v) => v.username !== name);
    if (db.viewers.length === before) return send(res, 404, { error: 'Viewer not found.' });
    for (const [t, s] of sessions) if (s.username === name && s.role === 'viewer') sessions.delete(t);
    saveDb();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found.' });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`Review Tracker running at http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASS) console.log('Using the default admin login. Set ADMIN_USER and ADMIN_PASS to change it.');
});
