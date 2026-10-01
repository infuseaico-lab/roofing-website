const $ = (id) => document.getElementById(id);
const CONCURRENCY = 3;
const STORE_KEY = 'rank-checker';

const els = {
  form: $('form'), url: $('url'), keywords: $('keywords'), kwCount: $('kwCount'),
  gl: $('gl'), hl: $('hl'), depth: $('depth'), provider: $('provider'), apiKey: $('apiKey'),
  run: $('run'), stop: $('stop'), formError: $('formError'), serverNote: $('serverNote'),
  results: $('results'), resDomain: $('resDomain'), progress: $('progress'), bar: $('bar'),
  rows: $('rows'), csv: $('csv'),
};

let rows = [];          // { keyword, status: 'wait'|'done'|'error', position, url, title, topResult, scanned, error }
let runId = 0;          // bumped to cancel an in-flight run
let sort = { key: null, dir: 1 };

// ---------- persistence ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      url: els.url.value, keywords: els.keywords.value, gl: els.gl.value, hl: els.hl.value,
      depth: els.depth.value, provider: els.provider.value, apiKey: els.apiKey.value,
    }));
  } catch { /* storage unavailable */ }
}
const saved = load();
for (const k of ['url', 'keywords', 'gl', 'hl', 'depth', 'provider', 'apiKey']) {
  if (saved[k] != null) els[k].value = saved[k];
}

// ---------- helpers ----------
function parseKeywords(text) {
  const seen = new Set();
  return text.split(/\r?\n/).map((s) => s.trim().replace(/\s+/g, ' ')).filter((s) => {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function domainOf(input) {
  let s = input.trim().toLowerCase();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'http://' + s;
  try { return new URL(s).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// The domain is already in the heading, so show only the path of a ranking page.
function pathOf(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const sub = host === els.resDomain.textContent ? '' : host;
    return sub + (u.pathname + u.search || '/');
  } catch { return url; }
}

function updateCount() {
  els.kwCount.textContent = parseKeywords(els.keywords.value).length;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v; else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function link(url, text) {
  return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, text || url);
}

function posBadge(r) {
  if (r.status === 'wait') return el('span', { class: 'pos wait' }, '…');
  if (r.status === 'error') return el('span', { class: 'pos err', title: r.error }, 'Error');
  if (r.position == null) return el('span', { class: 'pos none' }, `>${r.scanned || els.depth.value}`);
  const cls = r.position <= 3 ? 'top3' : r.position <= 10 ? 'top10' : 'deep';
  return el('span', { class: 'pos ' + cls }, String(r.position));
}

// ---------- rendering ----------
function sortedRows() {
  if (!sort.key) return rows;
  const val = (r) => sort.key === 'keyword' ? r.keyword.toLowerCase() : (r.position ?? Infinity);
  return [...rows].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
}

function render() {
  els.rows.replaceChildren(...sortedRows().map((r) => {
    let page = '–';
    if (r.status === 'error') page = el('span', { class: 'error' }, r.error);
    else if (r.url) page = el('span', {}, link(r.url, pathOf(r.url)), r.title ? el('span', { class: 'sub' }, r.title) : null);
    else if (r.status === 'done') page = el('span', { class: 'sub' }, `Not in the top ${r.scanned} results`);

    const top = r.topResult ? link(r.topResult.url, domainOf(r.topResult.url)) : '–';
    return el('tr', {},
      el('td', {}, r.keyword),
      el('td', { class: 'num' }, posBadge(r)),
      el('td', {}, page),
      el('td', {}, top));
  }));

  const done = rows.filter((r) => r.status !== 'wait').length;
  const ranked = rows.filter((r) => r.position != null);
  $('sTop3').textContent = ranked.filter((r) => r.position <= 3).length;
  $('sTop10').textContent = ranked.filter((r) => r.position <= 10).length;
  $('sRanked').textContent = ranked.length;
  $('sMissing').textContent = rows.filter((r) => r.status === 'done' && r.position == null).length;
  $('sAvg').textContent = ranked.length
    ? (ranked.reduce((s, r) => s + r.position, 0) / ranked.length).toFixed(1) : '–';

  const errors = rows.filter((r) => r.status === 'error').length;
  els.bar.style.width = rows.length ? (done / rows.length) * 100 + '%' : '0';
  els.progress.textContent = `${done} of ${rows.length} keywords checked` + (errors ? ` · ${errors} failed` : '');
  els.csv.disabled = done === 0;
}

// ---------- running ----------
async function checkOne(row, ctx) {
  const headers = { 'Content-Type': 'application/json' };
  if (ctx.apiKey) headers['X-Serp-Key'] = ctx.apiKey;
  try {
    const res = await fetch('/api/rank', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: ctx.url, keyword: row.keyword, gl: ctx.gl, hl: ctx.hl, depth: ctx.depth, provider: ctx.provider }),
    });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    Object.assign(row, data, { status: 'done' });
  } catch (err) {
    Object.assign(row, { status: 'error', error: err.message });
  }
}

async function run(e) {
  e.preventDefault();
  els.formError.textContent = '';
  const domain = domainOf(els.url.value);
  const keywords = parseKeywords(els.keywords.value);
  if (!domain) return void (els.formError.textContent = 'Enter a website, like example.com.');
  if (!keywords.length) return void (els.formError.textContent = 'Paste at least one keyword.');
  save();

  const id = ++runId;
  const ctx = {
    url: els.url.value.trim(), gl: els.gl.value, hl: els.hl.value, depth: Number(els.depth.value),
    // Only send a provider when the user has their own key or picked demo mode;
    // otherwise the server's configured provider applies.
    provider: els.apiKey.value || els.provider.value === 'mock' ? els.provider.value : undefined,
    apiKey: els.apiKey.value.trim(),
  };
  rows = keywords.map((keyword) => ({ keyword, status: 'wait' }));
  sort = { key: null, dir: 1 };
  els.resDomain.textContent = domain;
  els.results.hidden = false;
  els.run.disabled = true;
  els.stop.hidden = false;
  render();

  let next = 0;
  const worker = async () => {
    while (next < rows.length && id === runId) {
      const row = rows[next++];
      await checkOne(row, ctx);
      if (id === runId) render();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (id === runId) finish();
}

function finish() {
  els.run.disabled = false;
  els.stop.hidden = true;
}

els.stop.addEventListener('click', () => {
  runId++;
  rows = rows.filter((r) => r.status !== 'wait');
  render();
  finish();
});

// ---------- CSV ----------
function toCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Keyword', 'Position', 'Ranking URL', 'Title', '#1 Result', 'Results scanned', 'Error']];
  for (const r of sortedRows()) {
    if (r.status === 'wait') continue;
    lines.push([r.keyword, r.position ?? (r.status === 'done' ? 'Not found' : ''), r.url, r.title, r.topResult?.url, r.scanned, r.error]);
  }
  return lines.map((l) => l.map(q).join(',')).join('\r\n');
}

els.csv.addEventListener('click', () => {
  const blob = new Blob([toCsv()], { type: 'text/csv' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `rankings-${els.resDomain.textContent}-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- wiring ----------
document.querySelectorAll('th button[data-sort]').forEach((b) => b.addEventListener('click', () => {
  const key = b.dataset.sort;
  sort = { key, dir: sort.key === key ? -sort.dir : 1 };
  render();
}));
els.form.addEventListener('submit', run);
els.keywords.addEventListener('input', updateCount);
els.form.addEventListener('change', save);
updateCount();

fetch('/api/config').then((r) => r.json()).then((cfg) => {
  els.serverNote.textContent = cfg.hasServerKey
    ? `The server has a ${cfg.provider} key configured. Leave the key blank to use it.`
    : cfg.provider === 'mock'
      ? 'The server is in demo mode: results are fake.'
      : 'The server has no API key. Enter one below, or pick Demo to try the tool.';
  if (!cfg.hasServerKey && cfg.provider !== 'mock' && !els.apiKey.value) $('settings').open = true;
  if (!saved.provider) els.provider.value = cfg.provider;
}).catch(() => {});
