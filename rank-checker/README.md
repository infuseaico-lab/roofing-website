# Rank Checker

A small web app: enter a website URL, paste a list of keywords, and see where the site ranks on Google for each one (top 100, by country and language). Results can be sorted and downloaded as CSV.

It has no dependencies and needs only Node 18 or newer.

```sh
cd rank-checker
npm run demo                               # try it with fake data, no key needed
SERP_API_KEY=your_key npm start            # real Google results via Serper.dev
SERP_PROVIDER=serpapi SERP_API_KEY=... npm start   # or via SerpApi
npm test
```

Then open http://localhost:3000. (`PORT` changes the port.)

## Why it needs an API key

Google blocks automated scraping of its search results and its terms prohibit it, so the tool reads live Google results through a SERP API instead:

- **[Serper.dev](https://serper.dev)** (default): 2,500 free searches to start, then low per-search pricing.
- **[SerpApi](https://serpapi.com)**: has a small free monthly allowance.

Each keyword costs one search per 10 results scanned. The checker stops as soon as it finds your site, so a keyword where you rank #1 to #10 costs 1 search, and one where you don't rank in the top 100 costs 10. Choose "Top 10" depth to keep costs at 1 search per keyword.

You can also paste a key under **API settings** in the page instead of setting `SERP_API_KEY`. That key is kept in your browser's local storage and sent only to this app's server.

## How matching works

Any result on the entered domain or its subdomains counts (`example.com` matches `www.example.com` and `blog.example.com`, but not `notexample.com`). The position is the first organic result from your site; ads, map packs, and other SERP features are not counted.

## Deploying

`server.js` is a plain Node HTTP server, so it runs on any Node host (Render, Railway, Fly.io, a VPS). Set `SERP_API_KEY` as an environment variable there. Anyone who can open the page can spend your searches, so put it behind a login or keep the URL private.
