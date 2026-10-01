// Tiny zero-dependency server: serves the UI and proxies rank checks so the
// SERP API key never has to live in the browser.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRank, normalizeDomain, PROVIDERS } from './rank.js';

const PORT = Number(process.env.PORT) || 3000;
const PROVIDER = (process.env.SERP_PROVIDER || 'serper').toLowerCase();
const API_KEY = process.env.SERP_API_KEY || '';
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e5) throw new Error('Request too large.');
  }
  return JSON.parse(raw || '{}');
}

async function handleRank(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body.' });
  }

  const keyword = String(body.keyword || '').trim();
  const domain = normalizeDomain(body.url);
  if (!keyword) return sendJson(res, 400, { error: 'Missing keyword.' });
  if (!domain) return sendJson(res, 400, { error: 'Enter a valid website URL.' });

  // A key typed into the UI overrides the server's key (handy for local use).
  const apiKey = req.headers['x-serp-key'] || API_KEY;
  const provider = PROVIDERS.includes(body.provider) ? body.provider : PROVIDER;
  if (!apiKey && provider !== 'mock') {
    return sendJson(res, 400, { error: 'No API key. Set SERP_API_KEY on the server or enter one in Settings.' });
  }

  try {
    const result = await checkRank({
      keyword,
      domain,
      gl: String(body.gl || 'us').toLowerCase(),
      hl: String(body.hl || 'en').toLowerCase(),
      depth: Number(body.depth) || 100,
      provider,
      apiKey,
    });
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 502, { error: err.message });
  }
}

async function serveStatic(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (file.includes('..')) return sendJson(res, 404, { error: 'Not found' });
  try {
    const data = await readFile(join(PUBLIC_DIR, file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/rank') return handleRank(req, res);
  if (req.method === 'GET' && req.url === '/api/config') {
    return sendJson(res, 200, { provider: PROVIDER, hasServerKey: Boolean(API_KEY), providers: PROVIDERS });
  }
  if (req.method === 'GET') return serveStatic(req, res);
  sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, () => {
  console.log(`Rank checker running at http://localhost:${PORT} (provider: ${PROVIDER}${API_KEY ? ', key set' : ', no server key'})`);
});
