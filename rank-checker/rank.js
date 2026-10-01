// Core ranking logic: fetch Google results page by page from a SERP API
// and report the first position where the target site appears.

const PAGE_SIZE = 10;

/** Turn "https://www.Example.com/path" or "example.com" into "example.com". */
export function normalizeDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'http://' + s;
  let host;
  try {
    host = new URL(s).hostname;
  } catch {
    return '';
  }
  return host.replace(/^www\./, '').replace(/\.$/, '');
}

/** True when `url` is on `domain` or one of its subdomains. */
export function matchesDomain(url, domain) {
  const host = normalizeDomain(url);
  if (!host || !domain) return false;
  return host === domain || host.endsWith('.' + domain);
}

const providers = {
  // https://serper.dev — POST JSON, key in X-API-KEY header.
  async serper({ keyword, gl, hl, page, apiKey }) {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: keyword, gl, hl, num: PAGE_SIZE, page }),
    });
    const data = await readJson(res, 'Serper');
    return (data.organic || []).map((r) => ({ url: r.link, title: r.title }));
  },

  // https://serpapi.com — GET with key in the query string.
  async serpapi({ keyword, gl, hl, page, apiKey }) {
    const params = new URLSearchParams({
      engine: 'google',
      q: keyword,
      gl,
      hl,
      num: String(PAGE_SIZE),
      start: String((page - 1) * PAGE_SIZE),
      api_key: apiKey,
    });
    const res = await fetch('https://serpapi.com/search.json?' + params);
    const data = await readJson(res, 'SerpApi');
    return (data.organic_results || []).map((r) => ({ url: r.link, title: r.title }));
  },

  // Deterministic fake results for trying the UI without an API key.
  async mock({ keyword, page }) {
    const seed = [...keyword].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
    return Array.from({ length: PAGE_SIZE }, (_, i) => {
      const pos = (page - 1) * PAGE_SIZE + i + 1;
      const hit = pos === (seed % 40) + 1;
      return {
        url: hit ? 'https://www.example.com/' + keyword.replace(/\s+/g, '-') : `https://site${pos}.test/`,
        title: hit ? `Example result for ${keyword}` : `Result ${pos}`,
      };
    });
  },
};

async function readJson(res, name) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${name} returned a non-JSON response (HTTP ${res.status}).`);
  }
  if (!res.ok || data.error) {
    const msg = data.error || data.message || `HTTP ${res.status}`;
    throw new Error(`${name}: ${msg}`);
  }
  return data;
}

export const PROVIDERS = Object.keys(providers);

/**
 * Check one keyword. Pages through results until the domain is found or
 * `depth` results have been scanned, so a top-10 hit costs a single query.
 */
export async function checkRank({ keyword, domain, gl = 'us', hl = 'en', depth = 100, provider = 'serper', apiKey }) {
  const fetchPage = providers[provider];
  if (!fetchPage) throw new Error(`Unknown provider "${provider}".`);

  const pages = Math.max(1, Math.ceil(Math.min(depth, 100) / PAGE_SIZE));
  const seen = new Set();
  let position = 0;
  let topResult = null;

  for (let page = 1; page <= pages; page++) {
    const results = await fetchPage({ keyword, gl, hl, page, apiKey });
    for (const r of results) {
      // Providers occasionally repeat a result across page boundaries.
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      position++;
      if (!topResult) topResult = r;
      if (matchesDomain(r.url, domain)) {
        return { keyword, position, url: r.url, title: r.title, scanned: position, topResult };
      }
    }
    if (results.length < PAGE_SIZE) break; // no more results
  }
  return { keyword, position: null, url: null, title: null, scanned: position, topResult };
}
