// Reputation Pilot: a small zero-dependency Node server.
// Admin can add, edit, delete and import review records and manage companies, posters and viewer logins.
// Posters can update the posting fields (poster name, review link, status) of their companies' records.
// Viewers can only read the records of the company assigned to them.

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

export const FIELDS = ['client', 'listing', 'postOn', 'review', 'imageUrl', 'postDate', 'posterName', 'reviewLink', 'status', 'paid'];
export const STATUSES = ['Pending', 'Posted', 'Live', 'Removed'];
// Each posted review is guaranteed for this many days from its post date.
const WARRANTY_DAYS = Number(process.env.WARRANTY_DAYS) || 30;

const isPosted = (status) => status === 'Posted' || status === 'Live';
const today = () => new Date().toLocaleDateString('en-CA');

// ---------- storage ----------

function loadDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.records ??= [];
    db.viewers ??= [];
    db.companies ??= [];
    db.posters ??= [];
    // "Pace" was replaced by a scheduled "Post on" date; carry over any pace that was a date.
    for (const r of db.records) {
      if (r.postOn === undefined) r.postOn = /^\d{4}-\d{2}-\d{2}$/.test(r.pace ?? '') ? r.pace : '';
    }
    // Older data allowed several companies per viewer; each viewer now has exactly one.
    for (const v of db.viewers) {
      if (!('companyId' in v)) v.companyId = v.companyIds?.[0] ?? '';
      delete v.companyIds;
    }
    return db;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { records: [], viewers: [], companies: [], posters: [] };
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
  const viewer = findByUsername(db.viewers, username);
  if (viewer && safeEqual(hashPassword(String(password), viewer.salt).hash, viewer.hash)) {
    return { username: viewer.username, role: 'viewer' };
  }
  const poster = findByUsername(db.posters, username);
  if (poster && safeEqual(hashPassword(String(password), poster.salt).hash, poster.hash)) {
    return { username: poster.username, role: 'poster' };
  }
  return null;
}

function findByUsername(list, username) {
  return list.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
}

// Usernames are shared across the admin, viewers and posters so a login always means one account.
function usernameTaken(username, ownList) {
  if (username.toLowerCase() === ADMIN_USER.toLowerCase()) return true;
  return [db.viewers, db.posters].some((list) => list !== ownList && findByUsername(list, username));
}

const USERNAME_RE = /^[\w.@-]{3,40}$/;
const USERNAME_ERROR = 'Username must be 3 to 40 letters, numbers, dots, dashes or underscores.';

function endSessions(username) {
  for (const [t, s] of sessions) if (s.username === username && s.role !== 'admin') sessions.delete(t);
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

// A money amount in dollars, or null when blank or invalid.
function money(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number.parseFloat(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// Fields only the admin sees: whether the poster was paid, and the review's prices.
const stripPrivate = ({ paid, clientPrice, posterPay, ...rest }) => rest;

function cleanRecord(input) {
  const r = {};
  for (const f of FIELDS) {
    if (f === 'paid') continue;
    r[f] = String(input?.[f] ?? '').trim().slice(0, f === 'review' ? 10000 : 2000);
  }
  if (!STATUSES.includes(r.status)) {
    r.status = STATUSES.find((s) => s.toLowerCase() === r.status.toLowerCase()) || 'Pending';
  }
  // A posted review needs a post date for its warranty to start.
  if (isPosted(r.status) && !r.postDate) r.postDate = today();
  r.clientPrice = money(input?.clientPrice);
  r.posterPay = money(input?.posterPay);
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

// When a review is posted, lock in the current client price and poster rate so later
// price changes don't rewrite past figures. Blank prices keep following the current rates.
function stampPrices(r) {
  if (!isPosted(r.status)) return r;
  if (r.clientPrice == null) {
    const price = db.companies.find((c) => sameName(c.name, r.client))?.pricePerReview;
    if (price != null) r.clientPrice = price;
  }
  if (r.posterPay == null) {
    const rate = db.posters.find((p) => sameName(p.name, r.posterName))?.ratePerReview;
    if (rate != null) r.posterPay = rate;
  }
  return r;
}

const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// The company name a viewer may see (as a 0- or 1-item list), read fresh on every
// request so assignment changes apply at once.
function viewerCompanies(username) {
  const viewer = db.viewers.find((v) => v.username === username);
  const company = db.companies.find((c) => c.id === viewer?.companyId);
  return company ? [company.name] : [];
}

// Company names a poster may work on.
function posterCompanies(username) {
  const ids = new Set(db.posters.find((p) => p.username === username)?.companyIds ?? []);
  return db.companies.filter((c) => ids.has(c.id)).map((c) => c.name);
}

function sessionCompanies(session) {
  return session.role === 'poster' ? posterCompanies(session.username) : viewerCompanies(session.username);
}

function me(session) {
  const out = { username: session.username, role: session.role };
  if (session.role === 'poster') out.name = db.posters.find((p) => p.username === session.username)?.name || session.username;
  if (session.role !== 'admin') out.companies = sessionCompanies(session);
  return out;
}

function cleanCompanyIds(ids) {
  const known = new Set(db.companies.map((c) => c.id));
  return [...new Set(Array.isArray(ids) ? ids.map(String) : [])].filter((id) => known.has(id));
}

function cleanCompanyId(id) {
  return db.companies.some((c) => c.id === String(id ?? '')) ? String(id) : '';
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
    return send(res, 200, me(user), { 'Set-Cookie': sessionCookie(req, token, SESSION_TTL_MS / 1000) });
  }

  const session = getSession(req);

  if (pathname === '/api/logout' && method === 'POST') {
    if (session) sessions.delete(session.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (!session) return send(res, 401, { error: 'Not logged in.' });
  const isAdmin = session.role === 'admin';

  if (pathname === '/api/me' && method === 'GET') {
    return send(res, 200, me(session));
  }

  if (pathname === '/api/records' && method === 'GET') {
    if (isAdmin) return send(res, 200, { records: db.records, statuses: STATUSES, warrantyDays: WARRANTY_DAYS });
    const names = sessionCompanies(session);
    let records = db.records.filter((r) => names.some((n) => sameName(n, r.client)));
    // Whether the poster was paid is for the admin only.
    records = records.map(stripPrivate);
    return send(res, 200, { records, statuses: STATUSES, warrantyDays: WARRANTY_DAYS });
  }

  // Posters update only the posting fields, and only on their companies' records.
  const patchMatch = pathname.match(/^\/api\/records\/([\w-]+)$/);
  if (patchMatch && method === 'PATCH' && session.role === 'poster') {
    const record = db.records.find((r) => r.id === patchMatch[1]);
    const names = posterCompanies(session.username);
    if (!record || !names.some((n) => sameName(n, record.client))) return send(res, 404, { error: 'Record not found.' });
    const body = await readJson(req);
    const next = cleanRecord({ ...record, posterName: body.posterName, reviewLink: body.reviewLink, status: body.status });
    // Marking a review posted starts its warranty today.
    const postDate = !isPosted(record.status) && isPosted(next.status) ? today() : record.postDate || next.postDate;
    Object.assign(record, { posterName: next.posterName, reviewLink: next.reviewLink, status: next.status, postDate, updatedAt: new Date().toISOString() });
    stampPrices(record);
    saveDb();
    return send(res, 200, stripPrivate(record));
  }

  if (!isAdmin) return send(res, 403, { error: 'Your login can’t do that.' });

  if (pathname === '/api/records' && method === 'POST') {
    const body = await readJson(req);
    const now = new Date().toISOString();
    const record = stampPrices({ id: crypto.randomUUID(), ...cleanRecord(body), createdAt: now, updatedAt: now });
    db.records.push(record);
    saveDb();
    return send(res, 201, record);
  }

  if (pathname === '/api/records/import' && method === 'POST') {
    const { records } = await readJson(req);
    if (!Array.isArray(records)) return send(res, 400, { error: 'Expected a list of records.' });
    const now = new Date().toISOString();
    const added = records.map((r) => stampPrices({ id: crypto.randomUUID(), ...cleanRecord(r), createdAt: now, updatedAt: now }));
    db.records.push(...added);
    saveDb();
    return send(res, 201, { added: added.length });
  }

  if (pathname === '/api/records/bulk' && method === 'POST') {
    const { ids, changes } = await readJson(req);
    if (!Array.isArray(ids) || !ids.length) return send(res, 400, { error: 'Select at least one record.' });
    const update = {};
    if (typeof changes?.paid === 'boolean') update.paid = changes.paid;
    if (changes?.status !== undefined) {
      if (!STATUSES.includes(changes.status)) return send(res, 400, { error: 'Unknown status.' });
      update.status = changes.status;
    }
    if (!Object.keys(update).length) return send(res, 400, { error: 'Nothing to change.' });
    const wanted = new Set(ids.map(String));
    const now = new Date().toISOString();
    let updated = 0;
    for (const r of db.records) {
      if (wanted.has(r.id)) {
        const startsWarranty = update.status && !isPosted(r.status) && isPosted(update.status);
        Object.assign(r, update, { updatedAt: now }, startsWarranty || (isPosted(r.status) && !r.postDate) ? { postDate: today() } : {});
        stampPrices(r);
        updated++;
      }
    }
    saveDb();
    return send(res, 200, { updated });
  }

  const recordMatch = pathname.match(/^\/api\/records\/([\w-]+)$/);
  if (recordMatch) {
    const idx = db.records.findIndex((r) => r.id === recordMatch[1]);
    if (idx === -1) return send(res, 404, { error: 'Record not found.' });
    if (method === 'PUT') {
      const body = await readJson(req);
      db.records[idx] = stampPrices({ ...db.records[idx], ...cleanRecord(body), updatedAt: new Date().toISOString() });
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
      // Keep existing records attached to the company when it is renamed.
      const oldName = db.companies[idx].name;
      if (!sameName(oldName, company.name)) {
        for (const r of db.records) if (sameName(r.client, oldName)) r.client = company.name;
      }
      db.companies[idx] = { ...db.companies[idx], ...company, updatedAt: new Date().toISOString() };
      saveDb();
      return send(res, 200, db.companies[idx]);
    }
    if (method === 'DELETE') {
      const [removed] = db.companies.splice(idx, 1);
      for (const v of db.viewers) if (v.companyId === removed.id) v.companyId = '';
      for (const p of db.posters) p.companyIds = (p.companyIds ?? []).filter((id) => id !== removed.id);
      saveDb();
      return send(res, 200, { ok: true });
    }
  }

  // Prices: what each company is charged per review and what each poster is paid per review.
  if (pathname === '/api/prices' && method === 'PUT') {
    const { companies = {}, posters = {}, applyToPosted = false } = await readJson(req);
    for (const c of db.companies) if (c.id in companies) c.pricePerReview = money(companies[c.id]);
    for (const p of db.posters) if (p.id in posters) p.ratePerReview = money(posters[p.id]);
    let updated = 0;
    if (applyToPosted) {
      for (const r of db.records) {
        if (!isPosted(r.status)) continue;
        const company = db.companies.find((c) => c.id in companies && sameName(c.name, r.client));
        const poster = db.posters.find((p) => p.id in posters && sameName(p.name, r.posterName));
        if (company) r.clientPrice = company.pricePerReview;
        if (poster) r.posterPay = poster.ratePerReview;
        if (company || poster) updated++;
      }
    }
    saveDb();
    return send(res, 200, { ok: true, updated });
  }

  if (pathname === '/api/viewers' && method === 'GET') {
    return send(res, 200, {
      viewers: db.viewers.map((v) => ({ username: v.username, companyId: cleanCompanyId(v.companyId), createdAt: v.createdAt })),
    });
  }

  if (pathname === '/api/viewers' && method === 'POST') {
    const body = await readJson(req);
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    if (!USERNAME_RE.test(username)) return send(res, 400, { error: USERNAME_ERROR });
    if (usernameTaken(username, db.viewers)) return send(res, 400, { error: 'That username is taken.' });
    const existing = db.viewers.find((v) => v.username.toLowerCase() === username.toLowerCase());
    // A blank password on an existing login keeps its current password.
    if ((!existing || password) && password.length < 5) {
      return send(res, 400, { error: 'Password must be at least 5 characters.' });
    }
    const companyId = cleanCompanyId(body.companyId);
    if (!companyId) return send(res, 400, { error: 'Choose the company this login can see.' });
    if (existing) {
      existing.companyId = companyId;
      if (password) {
        Object.assign(existing, hashPassword(password));
        // Changing a password signs that viewer out everywhere.
        endSessions(existing.username);
      }
    } else {
      db.viewers.push({ username, ...hashPassword(password), companyId, createdAt: new Date().toISOString() });
    }
    saveDb();
    return send(res, existing ? 200 : 201, { username: existing?.username ?? username, updated: Boolean(existing) });
  }

  const viewerMatch = pathname.match(/^\/api\/viewers\/([^/]+)$/);
  if (viewerMatch && method === 'DELETE') {
    const name = decodeURIComponent(viewerMatch[1]);
    const before = db.viewers.length;
    db.viewers = db.viewers.filter((v) => v.username !== name);
    if (db.viewers.length === before) return send(res, 404, { error: 'Viewer not found.' });
    endSessions(name);
    saveDb();
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/posters' && method === 'GET') {
    return send(res, 200, {
      posters: db.posters.map(({ id, name, username, companyIds, ratePerReview, createdAt }) => ({
        id, name, username, companyIds: cleanCompanyIds(companyIds), ratePerReview: ratePerReview ?? null, createdAt,
      })),
    });
  }

  const posterMatch = pathname.match(/^\/api\/posters(?:\/([\w-]+))?$/);
  if (posterMatch && (method === 'POST' || method === 'PUT')) {
    const body = await readJson(req);
    const existing = posterMatch[1] ? db.posters.find((p) => p.id === posterMatch[1]) : null;
    if (method === 'PUT' && !existing) return send(res, 404, { error: 'Poster not found.' });
    if (method === 'POST' && posterMatch[1]) return send(res, 404, { error: 'Not found.' });
    const name = String(body.name ?? '').trim().slice(0, 100);
    const password = String(body.password ?? '');
    const companyIds = cleanCompanyIds(body.companyIds);
    if (!name) return send(res, 400, { error: 'Poster name is required.' });
    if (!existing) {
      const username = String(body.username ?? '').trim();
      if (!USERNAME_RE.test(username)) return send(res, 400, { error: USERNAME_ERROR });
      if (usernameTaken(username, null) || findByUsername(db.posters, username)) {
        return send(res, 400, { error: 'That username is taken.' });
      }
      if (password.length < 5) return send(res, 400, { error: 'Password must be at least 5 characters.' });
      const poster = { id: crypto.randomUUID(), name, username, ...hashPassword(password), companyIds, createdAt: new Date().toISOString() };
      db.posters.push(poster);
      saveDb();
      return send(res, 201, { id: poster.id, username });
    }
    // A blank password keeps the current one.
    if (password && password.length < 5) return send(res, 400, { error: 'Password must be at least 5 characters.' });
    Object.assign(existing, { name, companyIds });
    if (password) {
      Object.assign(existing, hashPassword(password));
      endSessions(existing.username);
    }
    saveDb();
    return send(res, 200, { id: existing.id, username: existing.username });
  }

  if (posterMatch?.[1] && method === 'DELETE') {
    const idx = db.posters.findIndex((p) => p.id === posterMatch[1]);
    if (idx === -1) return send(res, 404, { error: 'Poster not found.' });
    const [removed] = db.posters.splice(idx, 1);
    endSessions(removed.username);
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
  console.log(`Reputation Pilot running at http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASS) console.log('Using the default admin login. Set ADMIN_USER and ADMIN_PASS to change it.');
});
