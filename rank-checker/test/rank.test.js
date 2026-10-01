import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, matchesDomain, checkRank } from '../rank.js';

test('normalizeDomain strips protocol, www, path and case', () => {
  assert.equal(normalizeDomain('https://www.Example.com/roof-repair?x=1'), 'example.com');
  assert.equal(normalizeDomain('example.com'), 'example.com');
  assert.equal(normalizeDomain('  shop.example.co.uk/  '), 'shop.example.co.uk');
  assert.equal(normalizeDomain(''), '');
  assert.equal(normalizeDomain('not a url'), '');
});

test('matchesDomain accepts subdomains but not lookalikes', () => {
  assert.ok(matchesDomain('https://www.example.com/a', 'example.com'));
  assert.ok(matchesDomain('https://blog.example.com/a', 'example.com'));
  assert.ok(!matchesDomain('https://notexample.com/', 'example.com'));
  assert.ok(!matchesDomain('https://example.com.evil.net/', 'example.com'));
});

test('checkRank finds the position across pages and stops early', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, opts) => {
    const { page } = JSON.parse(opts.body);
    calls.push(page);
    const organic = Array.from({ length: 10 }, (_, i) => ({
      link: page === 2 && i === 4 ? 'https://www.mysite.com/roofing' : `https://other${page}-${i}.com/`,
      title: 't',
    }));
    return new Response(JSON.stringify({ organic }), { status: 200 });
  };
  try {
    const r = await checkRank({ keyword: 'roofer', domain: 'mysite.com', provider: 'serper', apiKey: 'k' });
    assert.equal(r.position, 15);
    assert.equal(r.url, 'https://www.mysite.com/roofing');
    assert.deepEqual(calls, [1, 2]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('checkRank reports not found within depth', async () => {
  const r = await checkRank({ keyword: 'x', domain: 'nowhere.com', provider: 'mock', depth: 30 });
  assert.equal(r.position, null);
  assert.equal(r.scanned, 30);
});

test('checkRank surfaces provider errors', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Unauthorized.' }), { status: 403 });
  try {
    await assert.rejects(checkRank({ keyword: 'x', domain: 'a.com', provider: 'serper', apiKey: 'bad' }), /Serper: Unauthorized/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
